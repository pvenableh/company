// server/api/scheduler/slots.get.ts
//
// Authoritative slot endpoint. Single source of truth for bookable times, used
// by BOTH the public booking page and internal booking. Replaces the client-side
// slot compute that used to live in app/components/Scheduler/BookingFlow.vue.
//
// Phase 5: round-robin / collective event types resolve a HOST POOL
// (event_type_hosts) and the engine unions/intersects their availability. The
// `audience` gate blocks public access to client_portal / internal types.
//
// Query:
//   eventTypeId   number   — preferred. Resolves host(s), duration, scheduling_type.
//   hostUserId    uuid     — fallback when the host has no event types.
//   duration      number   — required with hostUserId; ignored when eventTypeId set.
//   from, to      ISO date — desired window; clamped to [now+minNotice, now+horizon].
//   tz            IANA     — invitee display tz (informational; slots are ISO-UTC).
//
// Returns: { timezone, slots: [{ start, end, hostUserId }], eventType }

import { createDirectus, rest, staticToken, readItems, readItem } from '@directus/sdk';
import {
	generateSlots,
	localYMD,
	ymdKey,
	type AvailabilityRule,
	type HostAvailabilityInput,
	type Interval,
	type SchedulingType,
} from '~~/server/utils/availability-engine';

const DEFAULT_TZ = 'America/New_York';

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();
	const query = getQuery(event);

	const eventTypeId = query.eventTypeId ? Number(query.eventTypeId) : null;
	const hostUserIdParam = typeof query.hostUserId === 'string' ? query.hostUserId : null;
	const durationParam = query.duration ? Number(query.duration) : null;

	if (!eventTypeId && !hostUserIdParam) {
		throw createError({ statusCode: 400, message: 'eventTypeId or hostUserId is required' });
	}

	const serverToken = config.directusServerToken as string;
	const client = serverToken
		? createDirectus(config.public.directusUrl).with(rest()).with(staticToken(serverToken))
		: createDirectus(config.public.directusUrl).with(rest());

	// ── Resolve event type → host(s) + duration + scheduling type + audience ─────
	let hostIds: string[] = hostUserIdParam ? [hostUserIdParam] : [];
	let durationMinutes = durationParam || 30;
	let schedulingType: SchedulingType = 'single';
	let eventTypeOut: any = null;

	if (eventTypeId) {
		let et: any = null;
		try {
			et = await client.request(
				readItem('event_types', eventTypeId, {
					fields: ['id', 'title', 'duration', 'host_user', 'enabled', 'status', 'scheduling_type', 'audience'],
				}),
			);
		} catch {
			throw createError({ statusCode: 404, message: 'Event type not found' });
		}
		if (!et || et.enabled === false || et.status !== 'published') {
			throw createError({ statusCode: 404, message: 'Event type not available' });
		}

		// Audience gate — public is open; internal/client_portal need a session.
		const audience = et.audience || 'public';
		if (audience !== 'public') {
			const session = await getUserSession(event).catch(() => null);
			if (!session?.user?.id) {
				throw createError({ statusCode: 403, message: 'This event type is not publicly bookable.' });
			}
		}

		durationMinutes = et.duration || durationMinutes;
		schedulingType = (['single', 'round_robin', 'collective'].includes(et.scheduling_type) ? et.scheduling_type : 'single') as SchedulingType;

		const ownerId = typeof et.host_user === 'object' ? et.host_user?.id : et.host_user;
		if (schedulingType === 'single') {
			hostIds = ownerId ? [ownerId] : [];
		} else {
			// Query the pool directly (the `hosts` o2m alias may not be registered).
			const poolRows = (await client.request(
				readItems('event_type_hosts', {
					fields: ['host_user', 'enabled'],
					filter: { event_type: { _eq: eventTypeId }, enabled: { _eq: true } },
				}),
			)) as any[];
			const pool = poolRows
				.map((h: any) => (typeof h.host_user === 'object' ? h.host_user?.id : h.host_user))
				.filter(Boolean);
			hostIds = pool.length ? Array.from(new Set(pool)) : (ownerId ? [ownerId] : []);
		}
		eventTypeOut = { id: et.id, duration: durationMinutes, scheduling_type: schedulingType };
	}

	if (hostIds.length === 0) {
		throw createError({ statusCode: 400, message: 'Could not resolve host' });
	}

	// ── Build per-host availability inputs ───────────────────────────────────────
	const now = new Date();
	// Window/policy comes from the primary host's settings.
	const primarySettings = await loadSettings(client, hostIds[0]!);
	const timezone = primarySettings.timezone || DEFAULT_TZ;
	const minNoticeMinutes = primarySettings.minimum_notice_minutes != null ? Number(primarySettings.minimum_notice_minutes) : 120;
	const horizonDays = primarySettings.booking_horizon_days != null ? Number(primarySettings.booking_horizon_days) : 30;
	const intervalMinutes = primarySettings.slot_interval_minutes != null ? Number(primarySettings.slot_interval_minutes) : 15;

	const rangeStart = query.from ? new Date(String(query.from)) : now;
	const rangeEnd = query.to ? new Date(String(query.to)) : new Date(now.getTime() + horizonDays * 24 * 60 * 60000);
	const busyFrom = new Date(rangeStart.getTime() - 24 * 60 * 60000);
	const busyTo = new Date(rangeEnd.getTime() + 24 * 60 * 60000);

	// External busy for all pooled hosts in one batched call (fail-open).
	let externalByHost: Record<string, Interval[]> = {};
	try {
		externalByHost = (await getBusyForHosts(hostIds, busyFrom, busyTo)) as any;
	} catch (e: any) {
		console.warn('[slots] free/busy read-back failed (fail-open):', e?.message);
	}

	const hosts: HostAvailabilityInput[] = [];
	for (const hostId of hostIds) {
		const settings = hostId === hostIds[0] ? primarySettings : await loadSettings(client, hostId);
		const hostTz = settings.timezone || DEFAULT_TZ;

		const weeklyRules = (await client.request(
			readItems('availability', {
				fields: ['day_of_week', 'start_time', 'end_time', 'is_available', 'break_start', 'break_end', 'status'],
				filter: { user_id: { _eq: hostId }, status: { _neq: 'archived' } },
			}),
		)) as AvailabilityRule[];

		const { internalBusy, existingDailyCounts } = await loadInternalBusy(client, hostId, hostTz, busyFrom, busyTo, durationMinutes);

		hosts.push({
			hostUserId: hostId,
			timezone: hostTz,
			weeklyRules,
			bufferBefore: Number(settings.buffer_before) || 0,
			bufferAfter: Number(settings.buffer_after) || 0,
			internalBusy,
			externalBusy: externalByHost[hostId] || [],
			dailyLimit: settings.daily_booking_limit != null ? Number(settings.daily_booking_limit) : null,
			existingDailyCounts,
		});
	}

	const slots = generateSlots({
		hosts,
		durationMinutes,
		intervalMinutes,
		minNoticeMinutes,
		horizonDays,
		rangeStart,
		rangeEnd,
		now,
		schedulingType,
	});

	return {
		timezone,
		slots: slots.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString(), hostUserId: s.hostUserId })),
		eventType: eventTypeOut || { id: null, duration: durationMinutes, scheduling_type: schedulingType },
	};
});

// ── helpers ──────────────────────────────────────────────────────────────────

async function loadSettings(client: any, hostId: string): Promise<any> {
	const rows = (await client.request(
		(readItems as any)('scheduler_settings', { fields: ['*'], filter: { user_id: { _eq: hostId } }, limit: 1 }),
	)) as any[];
	return rows[0] || {};
}

async function loadInternalBusy(
	client: any,
	hostId: string,
	tz: string,
	busyFrom: Date,
	busyTo: Date,
	durationMinutes: number,
): Promise<{ internalBusy: Interval[]; existingDailyCounts: Record<string, number> }> {
	const meetings = (await client.request(
		(readItems as any)('video_meetings', {
			fields: ['scheduled_start', 'scheduled_end', 'duration_minutes'],
			filter: {
				_and: [
					{ host_user: { _eq: hostId } },
					{ status: { _in: ['scheduled', 'in_progress'] } },
					{ scheduled_start: { _gte: busyFrom.toISOString() } },
					{ scheduled_start: { _lte: busyTo.toISOString() } },
				],
			},
		}),
	)) as any[];

	const appts = (await client.request(
		(readItems as any)('appointments', {
			fields: ['start_time', 'end_time'],
			filter: {
				_and: [
					{ user_created: { _eq: hostId } },
					{ status: { _neq: 'canceled' } },
					{ start_time: { _gte: busyFrom.toISOString() } },
					{ start_time: { _lte: busyTo.toISOString() } },
				],
			},
		}),
	)) as any[];

	const internalBusy: Interval[] = [];
	const existingDailyCounts: Record<string, number> = {};
	for (const m of meetings) {
		if (!m.scheduled_start) continue;
		const start = new Date(m.scheduled_start);
		const end = m.scheduled_end ? new Date(m.scheduled_end) : new Date(start.getTime() + (Number(m.duration_minutes) || 30) * 60000);
		internalBusy.push({ start, end });
		const p = localYMD(start, tz);
		const key = ymdKey(p.y, p.m, p.d);
		existingDailyCounts[key] = (existingDailyCounts[key] || 0) + 1;
	}
	for (const a of appts) {
		if (!a.start_time) continue;
		const start = new Date(a.start_time);
		internalBusy.push({ start, end: a.end_time ? new Date(a.end_time) : new Date(start.getTime() + durationMinutes * 60000) });
	}
	return { internalBusy, existingDailyCounts };
}
