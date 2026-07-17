// server/api/scheduler/slots.get.ts
//
// Authoritative slot endpoint. Single source of truth for bookable times, used
// by BOTH the public booking page and internal booking. Replaces the client-side
// slot compute that used to live in app/components/Scheduler/BookingFlow.vue
// (browser-timezone-naive, no min-notice, no daily caps, buffers half-applied).
//
// Public-safe: resolves everything through the server token, no session needed
// (the public booking page is unauthenticated). Audience gating (client_portal /
// internal) is layered on in Phase 5.
//
// Query:
//   eventTypeId   number   — preferred. Resolves host, duration, scheduling_type.
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
} from '~~/server/utils/availability-engine';

const DEFAULT_TZ = 'America/New_York';

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();
	const query = getQuery(event);

	const eventTypeId = query.eventTypeId ? Number(query.eventTypeId) : null;
	const hostUserIdParam = typeof query.hostUserId === 'string' ? query.hostUserId : null;
	const durationParam = query.duration ? Number(query.duration) : null;
	const tz = typeof query.tz === 'string' && query.tz ? query.tz : null;

	if (!eventTypeId && !hostUserIdParam) {
		throw createError({ statusCode: 400, message: 'eventTypeId or hostUserId is required' });
	}

	const serverToken = config.directusServerToken as string;
	const client = serverToken
		? createDirectus(config.public.directusUrl).with(rest()).with(staticToken(serverToken))
		: createDirectus(config.public.directusUrl).with(rest());

	// ── Resolve event type → host + duration + scheduling type ──────────────────
	let hostUserId = hostUserIdParam;
	let durationMinutes = durationParam || 30;
	let schedulingType: 'single' | 'round_robin' | 'collective' = 'single';
	let eventTypeOut: any = null;

	if (eventTypeId) {
		let et: any = null;
		try {
			et = await client.request(
				readItem('event_types', eventTypeId, {
					fields: ['id', 'title', 'duration', 'host_user', 'enabled', 'status'],
				}),
			);
		} catch (err: any) {
			throw createError({ statusCode: 404, message: 'Event type not found' });
		}
		if (!et || et.enabled === false || et.status !== 'published') {
			throw createError({ statusCode: 404, message: 'Event type not available' });
		}
		hostUserId = typeof et.host_user === 'object' ? et.host_user?.id : et.host_user;
		durationMinutes = et.duration || durationMinutes;
		eventTypeOut = { id: et.id, duration: durationMinutes, scheduling_type: schedulingType };
	}

	if (!hostUserId) {
		throw createError({ statusCode: 400, message: 'Could not resolve host' });
	}

	// ── Host settings (timezone + booking policy) ───────────────────────────────
	const settingsRows = (await client.request(
		readItems('scheduler_settings', {
			fields: ['*'],
			filter: { user_id: { _eq: hostUserId } },
			limit: 1,
		}),
	)) as any[];
	const settings = settingsRows[0] || {};
	const timezone = settings.timezone || DEFAULT_TZ;
	const bufferBefore = Number(settings.buffer_before) || 0;
	const bufferAfter = Number(settings.buffer_after) || 0;
	const minNoticeMinutes = settings.minimum_notice_minutes != null ? Number(settings.minimum_notice_minutes) : 120;
	const horizonDays = settings.booking_horizon_days != null ? Number(settings.booking_horizon_days) : 30;
	const dailyLimit = settings.daily_booking_limit != null ? Number(settings.daily_booking_limit) : null;
	const intervalMinutes = settings.slot_interval_minutes != null ? Number(settings.slot_interval_minutes) : 15;

	// ── Availability rules ──────────────────────────────────────────────────────
	// NB: filter by user_id only (NOT status='published'). The settings UI creates
	// availability rows without an explicit status (Directus defaults them to
	// 'draft'), and the public-booking endpoint reads them regardless of status.
	// Requiring 'published' here would show zero slots for every host.
	const weeklyRules = (await client.request(
		readItems('availability', {
			fields: ['day_of_week', 'start_time', 'end_time', 'is_available', 'break_start', 'break_end', 'status'],
			filter: { user_id: { _eq: hostUserId }, status: { _neq: 'archived' } },
		}),
	)) as AvailabilityRule[];

	// ── Window ──────────────────────────────────────────────────────────────────
	const now = new Date();
	const rangeStart = query.from ? new Date(String(query.from)) : now;
	const rangeEnd = query.to
		? new Date(String(query.to))
		: new Date(now.getTime() + horizonDays * 24 * 60 * 60000);

	// Fetch busy a day wider than the window so buffer math near edges is correct.
	const busyFrom = new Date(rangeStart.getTime() - 24 * 60 * 60000);
	const busyTo = new Date(rangeEnd.getTime() + 24 * 60 * 60000);

	// ── Internal busy: video_meetings + appointments ────────────────────────────
	const meetings = (await client.request(
		readItems('video_meetings', {
			fields: ['scheduled_start', 'scheduled_end', 'duration_minutes'],
			filter: {
				_and: [
					{ host_user: { _eq: hostUserId } },
					{ status: { _in: ['scheduled', 'in_progress'] } },
					{ scheduled_start: { _gte: busyFrom.toISOString() } },
					{ scheduled_start: { _lte: busyTo.toISOString() } },
				],
			},
		}),
	)) as any[];

	const appts = (await client.request(
		readItems('appointments', {
			fields: ['start_time', 'end_time'],
			filter: {
				_and: [
					{ user_created: { _eq: hostUserId } },
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
		const end = m.scheduled_end
			? new Date(m.scheduled_end)
			: new Date(start.getTime() + (Number(m.duration_minutes) || 30) * 60000);
		internalBusy.push({ start, end });
		const { y, mo, d } = (() => {
			const p = localYMD(start, timezone);
			return { y: p.y, mo: p.m, d: p.d };
		})();
		const key = ymdKey(y, mo, d);
		existingDailyCounts[key] = (existingDailyCounts[key] || 0) + 1;
	}
	for (const a of appts) {
		if (!a.start_time) continue;
		const start = new Date(a.start_time);
		const end = a.end_time ? new Date(a.end_time) : new Date(start.getTime() + durationMinutes * 60000);
		internalBusy.push({ start, end });
	}

	// ── External free/busy (Phase 2): read the host's real Google/Outlook calendar
	//    so offered slots exclude conflicts created directly in those calendars.
	//    Fail-open — getBusyForHosts never throws; a disconnected/erroring provider
	//    yields [] and we fall back to internal-only conflict checking.
	let externalBusy: Interval[] = [];
	try {
		const busyByHost = await getBusyForHosts([hostUserId], busyFrom, busyTo);
		externalBusy = busyByHost[hostUserId] || [];
	} catch (e: any) {
		console.warn('[slots] free/busy read-back failed (fail-open):', e?.message);
	}

	// ── Generate ────────────────────────────────────────────────────────────────
	const hostInput: HostAvailabilityInput = {
		hostUserId,
		timezone,
		weeklyRules,
		bufferBefore,
		bufferAfter,
		internalBusy,
		externalBusy,
		dailyLimit,
		existingDailyCounts,
	};

	const slots = generateSlots({
		hosts: [hostInput],
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
		slots: slots.map((s) => ({
			start: s.start.toISOString(),
			end: s.end.toISOString(),
			hostUserId: s.hostUserId,
		})),
		eventType: eventTypeOut || { id: null, duration: durationMinutes, scheduling_type: schedulingType },
	};
});
