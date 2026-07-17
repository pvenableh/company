// server/utils/availability-engine.ts
//
// Authoritative, pure slot-generation engine. No HTTP, no Directus — callers
// (server/api/scheduler/slots.get.ts, finalizeBooking) fetch the inputs and
// hand them in. This is the single source of truth for "when can someone book",
// replacing the browser-timezone-naive client compute that used to live in
// app/components/Scheduler/BookingFlow.vue.
//
// Timezone handling is done with Intl (no date-fns-tz dependency): availability
// rules are wall-clock times in the HOST's timezone, so we convert each day's
// open window to real UTC instants — fixing the old code that matched weekdays
// and hours in the visitor's browser timezone.

// ─── Timezone helpers (dependency-free, DST-aware) ─────────────────────────────

/**
 * Offset in minutes such that: instant.getTime() + offset*60000 === the wall
 * clock in `timeZone` interpreted as if it were UTC. Negative west of UTC
 * (America/New_York in winter → -300).
 */
function tzOffsetMinutes(date: Date, timeZone: string): number {
	const dtf = new Intl.DateTimeFormat('en-US', {
		timeZone,
		hour12: false,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	});
	const map: Record<string, string> = {};
	for (const p of dtf.formatToParts(date)) map[p.type] = p.value;
	const hour = map.hour === '24' ? '0' : map.hour; // some engines emit 24
	const asUTC = Date.UTC(
		Number(map.year),
		Number(map.month) - 1,
		Number(map.day),
		Number(hour),
		Number(map.minute),
		Number(map.second),
	);
	return (asUTC - date.getTime()) / 60000;
}

/** Convert a wall-clock time in `timeZone` to a real UTC Date. */
export function zonedWallTimeToUtc(
	y: number,
	m: number, // 1-12
	d: number,
	hh: number,
	mm: number,
	timeZone: string,
): Date {
	// Guess: treat the wall time as UTC, then correct by the tz offset. Re-check
	// the offset at the corrected instant so DST-boundary days land right.
	const guess = Date.UTC(y, m - 1, d, hh, mm, 0);
	const offset1 = tzOffsetMinutes(new Date(guess), timeZone);
	let utc = guess - offset1 * 60000;
	const offset2 = tzOffsetMinutes(new Date(utc), timeZone);
	if (offset2 !== offset1) utc = guess - offset2 * 60000;
	return new Date(utc);
}

/** The calendar Y/M/D of an instant, as seen in `timeZone`. */
export function localYMD(date: Date, timeZone: string): { y: number; m: number; d: number } {
	const dtf = new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	});
	const map: Record<string, string> = {};
	for (const p of dtf.formatToParts(date)) map[p.type] = p.value;
	return { y: Number(map.year), m: Number(map.month), d: Number(map.day) };
}

/** yyyy-mm-dd key for a calendar date (host-local). */
export function ymdKey(y: number, m: number, d: number): string {
	return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Weekday name ("Monday"…"Sunday") for a calendar date. Pure — no tz needed. */
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function weekdayName(y: number, m: number, d: number): string {
	return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]!;
}

/** Parse "HH:MM" / "HH:MM:SS" to minutes-past-midnight; null if unparseable. */
function parseTimeToMinutes(t: string | null | undefined): number | null {
	if (!t) return null;
	const parts = String(t).split(':');
	const h = Number(parts[0]);
	const min = Number(parts[1] ?? 0);
	if (Number.isNaN(h) || Number.isNaN(min)) return null;
	return h * 60 + min;
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface Interval {
	start: Date;
	end: Date;
}

export interface AvailabilityRule {
	day_of_week?: string | null; // "Monday"…"Sunday"
	start_time?: string | null; // wall-clock in host tz
	end_time?: string | null;
	is_available?: boolean | null;
	break_start?: string | null;
	break_end?: string | null;
}

export interface HostAvailabilityInput {
	hostUserId: string;
	timezone: string; // IANA
	weeklyRules: AvailabilityRule[];
	bufferBefore: number; // minutes applied around busy intervals
	bufferAfter: number;
	internalBusy: Interval[];
	externalBusy?: Interval[]; // wired in Phase 2 (free/busy read-back)
	dailyLimit?: number | null;
	/** host-local yyyy-mm-dd → existing booking count, for the daily cap. */
	existingDailyCounts?: Record<string, number>;
}

export type SchedulingType = 'single' | 'round_robin' | 'collective';

export interface SlotEngineParams {
	hosts: HostAvailabilityInput[];
	durationMinutes: number;
	intervalMinutes: number;
	minNoticeMinutes: number;
	horizonDays: number;
	rangeStart: Date;
	rangeEnd: Date;
	now?: Date; // injectable for tests
	schedulingType?: SchedulingType;
}

export interface EngineSlot {
	start: Date;
	end: Date;
	hostUserId?: string; // resolved for round_robin/collective
}

// ─── Interval math ──────────────────────────────────────────────────────────────

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
	return aStart < bEnd && aEnd > bStart;
}

/** True if [start,end] does not collide with any busy interval (buffers applied). */
export function isIntervalFree(
	start: Date,
	end: Date,
	busy: Interval[],
	bufferBefore = 0,
	bufferAfter = 0,
): boolean {
	const s = start.getTime();
	const e = end.getTime();
	for (const b of busy) {
		const bs = b.start.getTime() - bufferBefore * 60000;
		const be = b.end.getTime() + bufferAfter * 60000;
		if (overlaps(s, e, bs, be)) return false;
	}
	return true;
}

// ─── Per-host slot generation ────────────────────────────────────────────────────

interface HostSlot {
	startMs: number;
	endMs: number;
	hostUserId: string;
}

function slotsForHost(host: HostAvailabilityInput, params: SlotEngineParams, now: Date): HostSlot[] {
	const tz = host.timezone || 'America/New_York';
	const durMs = params.durationMinutes * 60000;
	const stepMs = Math.max(1, params.intervalMinutes) * 60000;

	// Clamp the window to [now+minNotice, now+horizon] ∩ [rangeStart, rangeEnd].
	const earliest = new Date(Math.max(params.rangeStart.getTime(), now.getTime() + params.minNoticeMinutes * 60000));
	const horizonEnd = new Date(now.getTime() + params.horizonDays * 24 * 60 * 60000);
	const latest = new Date(Math.min(params.rangeEnd.getTime(), horizonEnd.getTime()));
	if (earliest.getTime() >= latest.getTime()) return [];

	const busy = [...host.internalBusy, ...(host.externalBusy || [])];

	// Index rules by weekday. A weekday may have multiple rows.
	const rulesByDay = new Map<string, AvailabilityRule[]>();
	for (const r of host.weeklyRules) {
		if (r.is_available === false) continue;
		if (!r.day_of_week) continue;
		const key = r.day_of_week;
		if (!rulesByDay.has(key)) rulesByDay.set(key, []);
		rulesByDay.get(key)!.push(r);
	}

	const out: HostSlot[] = [];

	// Walk host-local calendar dates from `earliest` to `latest` inclusive.
	const startYMD = localYMD(earliest, tz);
	const endYMD = localYMD(latest, tz);
	let cursor = { y: startYMD.y, m: startYMD.m, d: startYMD.d };
	const endStr = ymdKey(endYMD.y, endYMD.m, endYMD.d);

	// Safety bound: never iterate more than horizon+2 days.
	for (let guard = 0; guard < params.horizonDays + 3; guard++) {
		const { y, m, d } = cursor;
		const dayStr = ymdKey(y, m, d);

		const dayKey = ymdKey(y, m, d);
		const dailyCount = host.existingDailyCounts?.[dayKey] ?? 0;
		const overCap = host.dailyLimit != null && dailyCount >= host.dailyLimit;

		if (!overCap) {
			const rules = rulesByDay.get(weekdayName(y, m, d)) || [];
			for (const rule of rules) {
				const openStart = parseTimeToMinutes(rule.start_time);
				const openEnd = parseTimeToMinutes(rule.end_time);
				if (openStart == null || openEnd == null || openEnd <= openStart) continue;

				const breakStart = parseTimeToMinutes(rule.break_start);
				const breakEnd = parseTimeToMinutes(rule.break_end);
				const hasBreak = breakStart != null && breakEnd != null && breakEnd > breakStart;

				// Grid the open window by intervalMinutes.
				for (let mins = openStart; mins + params.durationMinutes <= openEnd; mins += params.intervalMinutes) {
					// Skip candidates whose window overlaps the break.
					if (hasBreak && overlaps(mins, mins + params.durationMinutes, breakStart!, breakEnd!)) continue;

					const slotStart = zonedWallTimeToUtc(y, m, d, Math.floor(mins / 60), mins % 60, tz);
					const startMs = slotStart.getTime();
					const endMs = startMs + durMs;

					if (startMs < earliest.getTime() || startMs > latest.getTime()) continue;

					if (!isIntervalFree(new Date(startMs), new Date(endMs), busy, host.bufferBefore, host.bufferAfter)) {
						continue;
					}
					out.push({ startMs, endMs, hostUserId: host.hostUserId });
				}
			}
		}

		if (dayStr === endStr) break;
		// Advance one calendar day (UTC arithmetic rolls month/year correctly).
		const next = new Date(Date.UTC(y, m - 1, d + 1));
		cursor = { y: next.getUTCFullYear(), m: next.getUTCMonth() + 1, d: next.getUTCDate() };
	}

	return out;
}

// ─── Public API ──────────────────────────────────────────────────────────────────

/**
 * Generate bookable slots.
 *
 * - single: slots for the one host.
 * - round_robin: UNION of pooled hosts' slots by start time; each returned slot
 *   carries an advisory hostUserId (least-loaded first). Final host is
 *   re-resolved at booking time.
 * - collective: INTERSECTION — only start times where every pooled host is free.
 */
export function generateSlots(params: SlotEngineParams): EngineSlot[] {
	const now = params.now ?? new Date();
	const type = params.schedulingType ?? 'single';
	const durMs = params.durationMinutes * 60000;

	if (params.hosts.length === 0) return [];

	if (type === 'single' || params.hosts.length === 1) {
		return slotsForHost(params.hosts[0]!, params, now)
			.map((s) => ({ start: new Date(s.startMs), end: new Date(s.endMs), hostUserId: s.hostUserId }))
			.sort((a, b) => a.start.getTime() - b.start.getTime());
	}

	// Per-host slot sets keyed by start instant.
	const perHost = params.hosts.map((h) => {
		const set = new Map<number, HostSlot>();
		for (const s of slotsForHost(h, params, now)) set.set(s.startMs, s);
		return { hostId: h.hostUserId, set };
	});

	if (type === 'collective') {
		// Start times where ALL hosts are free.
		const [first, ...rest] = perHost;
		const result: EngineSlot[] = [];
		for (const startMs of first!.set.keys()) {
			if (rest.every((h) => h.set.has(startMs))) {
				result.push({ start: new Date(startMs), end: new Date(startMs + durMs) });
			}
		}
		return result.sort((a, b) => a.start.getTime() - b.start.getTime());
	}

	// round_robin: union of all start times; advisory host = least-loaded free host.
	const byStart = new Map<number, string[]>();
	for (const h of perHost) {
		for (const startMs of h.set.keys()) {
			if (!byStart.has(startMs)) byStart.set(startMs, []);
			byStart.get(startMs)!.push(h.hostId);
		}
	}
	// Advisory load = number of slots already claimed this pass (cheap, stable).
	const load: Record<string, number> = {};
	const result: EngineSlot[] = [];
	for (const startMs of [...byStart.keys()].sort((a, b) => a - b)) {
		const candidates = byStart.get(startMs)!;
		candidates.sort((a, b) => (load[a] ?? 0) - (load[b] ?? 0) || a.localeCompare(b));
		const chosen = candidates[0]!;
		load[chosen] = (load[chosen] ?? 0) + 1;
		result.push({ start: new Date(startMs), end: new Date(startMs + durMs), hostUserId: chosen });
	}
	return result;
}
