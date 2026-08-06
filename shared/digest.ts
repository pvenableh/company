/**
 * Motivational digest — shared config for the daily/weekly "here's your day"
 * email. Used by the settings UI (what the user can pick), the cron (who to
 * send to, and when in their local time), and the payload builder + email
 * template (which sections to include).
 *
 * Distinct from `ai_preferences.digest_cadence`, which gates the per-PROJECT
 * AI briefs. This is the user-level roll-up across projects, tasks, tickets,
 * contracts, proposals, and clients.
 */

export type DigestCadence = 'daily' | 'weekdays' | 'weekly' | 'off';

/** Tone the email leans into, derived from the local weekday. */
export type DigestTone = 'motivational' | 'forward' | 'wins';

/**
 * How the digest is framed:
 *   - 'overview' — the motivational summary: wins, scoreboard, and per-section
 *     rollups (the original digest).
 *   - 'actions'  — task-first: a single prioritized, deep-linked checklist of
 *     what to do today, with the rollups demoted to a compact footer.
 */
export type DigestStyle = 'overview' | 'actions';

export interface DigestStyleDef {
	key: DigestStyle;
	label: string;
	description: string;
}

/** The two framings a user can pick between in Account → Notifications. */
export const DIGEST_STYLES: DigestStyleDef[] = [
	{ key: 'overview', label: 'Overview', description: 'A motivational summary — wins, momentum, and where everything stands.' },
	{ key: 'actions', label: 'Action list', description: 'A prioritized checklist of what to tackle today, each linking straight to the item.' },
];

export const DEFAULT_DIGEST_STYLE: DigestStyle = 'overview';

export function normalizeDigestStyle(v: unknown): DigestStyle {
	return v === 'actions' ? 'actions' : 'overview';
}

export interface DigestSectionDef {
	key: string;
	label: string;
	description: string;
}

/**
 * The content blocks a user can opt in/out of. These mirror the four Earnest
 * apps (Work · People · Money · Marketing) so the email reads like the product,
 * plus the two motivational blocks (wins + suggestions). Order = render order.
 */
export const DIGEST_SECTIONS: DigestSectionDef[] = [
	{ key: 'wins', label: 'Recent wins', description: 'What you got done — a pat on the back to start the day' },
	{ key: 'suggestions', label: 'Suggested actions', description: 'A short, prioritized list of what to tackle next' },
	{ key: 'work', label: 'Work', description: 'Projects, tasks, and tickets' },
	{ key: 'people', label: 'People', description: 'Clients, leads, pipeline, and CardDesk' },
	{ key: 'money', label: 'Money', description: 'Proposals, contracts, invoices, and collections' },
	{ key: 'marketing', label: 'Marketing', description: 'Scheduled, published, and failed social posts' },
];

export const DIGEST_SECTION_KEYS = DIGEST_SECTIONS.map((s) => s.key);

/** Sensible defaults for a brand-new subscriber — everything on. */
export const DEFAULT_DIGEST_SECTIONS = ['wins', 'suggestions', 'work', 'people', 'money', 'marketing'];
export const DEFAULT_DIGEST_HOUR = 7; // 7am local — "before the day starts"
export const DEFAULT_DIGEST_CADENCE: DigestCadence = 'weekdays';

export const CADENCE_LABELS: Record<DigestCadence, string> = {
	daily: 'Every day',
	weekdays: 'Weekdays only',
	weekly: 'Weekly (Mondays)',
	off: 'Off',
};

/** IANA-tz-aware view of "now": the local hour (0–23) and weekday (0=Sun). */
export function localHourAndDay(now: Date, timezone?: string | null): { hour: number; weekday: number } {
	const tz = timezone || 'UTC';
	try {
		const parts = new Intl.DateTimeFormat('en-US', {
			timeZone: tz,
			hour: 'numeric',
			hour12: false,
			weekday: 'short',
		}).formatToParts(now);
		const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '0';
		// Intl gives 24 for midnight in some engines — normalise to 0.
		let hour = parseInt(hourStr, 10) % 24;
		if (Number.isNaN(hour)) hour = 0;
		const wdStr = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
		const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
		const weekday = map[wdStr] ?? 0;
		return { hour, weekday };
	} catch {
		// Bad tz string — fall back to UTC so the user still gets mail.
		return { hour: now.getUTCHours(), weekday: now.getUTCDay() };
	}
}

/**
 * Decide whether this user should receive the digest at this moment, given
 * their cadence + preferred local hour + timezone. Meant to be called by an
 * HOURLY cron, so it only fires in the single hour that matches sendHour.
 */
export function shouldSendDigestNow(opts: {
	cadence: DigestCadence;
	sendHour: number;
	timezone?: string | null;
	now: Date;
}): { send: boolean; tone: DigestTone; weekday: number } {
	const { cadence, sendHour, timezone, now } = opts;
	const { hour, weekday } = localHourAndDay(now, timezone);
	const tone = digestTone(weekday);

	if (cadence === 'off') return { send: false, tone, weekday };
	if (hour !== clampHour(sendHour)) return { send: false, tone, weekday };

	const isWeekday = weekday >= 1 && weekday <= 5;
	if (cadence === 'weekdays' && !isWeekday) return { send: false, tone, weekday };
	if (cadence === 'weekly' && weekday !== 1) return { send: false, tone, weekday };

	return { send: true, tone, weekday };
}

/** Monday = fresh-week lift, Friday = celebrate the week, otherwise forward-looking. */
export function digestTone(weekday: number): DigestTone {
	if (weekday === 1) return 'motivational';
	if (weekday === 5) return 'wins';
	return 'forward';
}

export function clampHour(h: unknown): number {
	const n = typeof h === 'number' ? h : parseInt(String(h ?? DEFAULT_DIGEST_HOUR), 10);
	if (Number.isNaN(n)) return DEFAULT_DIGEST_HOUR;
	return Math.max(0, Math.min(23, n));
}

/** "7 AM", "2 PM" — for the settings UI + email intro. */
export function formatHour12(h: number): string {
	const hour = clampHour(h);
	const period = hour < 12 ? 'AM' : 'PM';
	const twelve = hour % 12 === 0 ? 12 : hour % 12;
	return `${twelve} ${period}`;
}
