// server/utils/mirror-signals.ts
//
// The Mirror's insight engine — it FINDS patterns instead of drawing bar charts.
// From a user's real task history it derives the honest, non-obvious, actionable
// signals: avoidance (work that keeps not happening), completion latency (things
// drag), overdue slippage, and the single client eating the backlog. Each strong
// signal becomes an insight with a concrete LEVER (a prompt handed to Earnest),
// so the reflection is productive, not a scoreboard.
//
// Timezone-sensitive rhythm is intentionally left to the client (raw completion
// timestamps are returned) so "you close most work on Tuesday mornings" is TRUE
// in the user's local time, not the server's UTC.

import { readItems } from '@directus/sdk';

const DAY = 86_400_000;

export interface MirrorInsight {
	id: string;
	kind: 'avoidance' | 'latency' | 'overdue' | 'outlier';
	/** 0–100, higher = surface first. */
	severity: number;
	/** The sharp, specific observation. */
	headline: string;
	/** The evidence behind it (real titles / numbers). */
	evidence: string;
	/** One concrete next move — the prompt is handed to openEarnestPanel(). */
	lever?: { label: string; prompt: string };
}

export interface MirrorSignals {
	windowDays: number;
	completedCount: number;
	medianLatencyDays: number | null;
	slowTailCount: number;
	openNow: number;
	avoidanceCount: number;
	oldestAvoidanceDays: number | null;
	overdueCount: number;
	worstOverdueDays: number | null;
	outlier: { name: string; openCount: number; overdueCount: number } | null;
}

export interface MirrorResult {
	signals: MirrorSignals;
	insights: MirrorInsight[];
	/** Raw completion timestamps (last 60d) — client buckets them in local time. */
	completions: string[];
}

function daysAgo(iso: string | null | undefined): number | null {
	if (!iso) return null;
	const t = new Date(iso).getTime();
	if (Number.isNaN(t)) return null;
	return Math.max(0, Math.floor((Date.now() - t) / DAY));
}
function median(nums: number[]): number | null {
	if (!nums.length) return null;
	const s = [...nums].sort((a, b) => a - b);
	const mid = Math.floor(s.length / 2);
	return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
}
/** Humanise a day count: "12 days", "3 weeks", "2 months". */
export function humanDays(d: number): string {
	if (d <= 1) return d <= 0 ? 'today' : '1 day';
	if (d < 21) return `${d} days`;
	if (d < 60) return `${Math.round(d / 7)} weeks`;
	return `${Math.round(d / 30)} months`;
}

/**
 * Compute the Mirror's signals + insights for one user in one org. Every query
 * is best-effort; a failure in one dimension never blanks the rest. Uses the
 * passed (user-scoped) Directus client so row perms apply.
 */
export async function computeMirrorSignals(directus: any, orgId: string, userId: string): Promise<MirrorResult> {
	const now = Date.now();
	const mine = { assigned_to: { directus_users_id: { _eq: userId } } };
	const orgFilter = { organization_id: { _eq: orgId } };

	// ── Completed work (latency + rhythm) ──────────────────────────────────────
	let completed: any[] = [];
	try {
		completed = (await directus.request(
			(readItems as any)('tasks', {
				filter: { _and: [orgFilter, { status: { _eq: 'completed' } }, mine] },
				fields: ['date_created', 'date_completed', 'date_updated'],
				sort: ['-date_updated'],
				limit: 500,
			}),
		)) as any[];
	} catch { completed = []; }

	const latencies: number[] = [];
	const completions: string[] = [];
	for (const t of completed) {
		const done = t.date_completed || t.date_updated;
		if (done && new Date(done).getTime() >= now - 60 * DAY) completions.push(done);
		if (t.date_created && done) {
			const lat = Math.round((new Date(done).getTime() - new Date(t.date_created).getTime()) / DAY);
			if (lat >= 0 && lat < 400) latencies.push(lat);
		}
	}
	const medianLatencyDays = median(latencies);
	const slowTailCount = latencies.filter((l) => l > 21).length;

	// ── Open work (avoidance + overdue + outlier) ──────────────────────────────
	let open: any[] = [];
	try {
		open = (await directus.request(
			(readItems as any)('tasks', {
				filter: { _and: [orgFilter, { status: { _nin: ['completed'] } }, mine] },
				fields: ['id', 'title', 'date_created', 'due_date', 'schedule', 'priority', 'client_id'],
				sort: ['date_created'],
				limit: 300,
			}),
		)) as any[];
	} catch { open = []; }

	const openNow = open.length;
	const avoided = open
		.map((t) => ({ ...t, age: daysAgo(t.date_created) ?? 0 }))
		.filter((t) => t.age >= 14)
		.sort((a, b) => b.age - a.age);
	const overdue = open
		.map((t) => ({ ...t, over: t.due_date ? Math.floor((now - new Date(t.due_date).getTime()) / DAY) : -1 }))
		.filter((t) => t.over > 0)
		.sort((a, b) => b.over - a.over);

	// outlier client — the one with the most open work, if it dominates
	const byClient = new Map<string, { open: number; overdue: number }>();
	for (const t of open) {
		const cid = typeof t.client_id === 'object' ? t.client_id?.id : t.client_id;
		if (!cid) continue;
		const e = byClient.get(String(cid)) || { open: 0, overdue: 0 };
		e.open++;
		if (t.due_date && new Date(t.due_date).getTime() < now) e.overdue++;
		byClient.set(String(cid), e);
	}
	let outlier: MirrorSignals['outlier'] = null;
	if (byClient.size) {
		const [topId, top] = [...byClient.entries()].sort((a, b) => b[1].open - a[1].open)[0]!;
		// only an "outlier" if it's real: 3+ open AND ≥40% of all open work
		if (top.open >= 3 && top.open >= openNow * 0.4) {
			let name = 'One client';
			try {
				const c = (await directus.request(
					(readItems as any)('clients', { filter: { id: { _eq: topId } }, fields: ['name'], limit: 1 }),
				)) as any[];
				if (c?.[0]?.name) name = c[0].name;
			} catch { /* keep generic name */ }
			outlier = { name, openCount: top.open, overdueCount: top.overdue };
		}
	}

	const signals: MirrorSignals = {
		windowDays: 60,
		completedCount: completions.length,
		medianLatencyDays,
		slowTailCount,
		openNow,
		avoidanceCount: avoided.length,
		oldestAvoidanceDays: avoided[0]?.age ?? null,
		overdueCount: overdue.length,
		worstOverdueDays: overdue[0]?.over ?? null,
		outlier,
	};

	// ── Insights — only emit a card when the pattern is real ───────────────────
	const insights: MirrorInsight[] = [];

	if (avoided.length >= 2 && (avoided[0]?.age ?? 0) >= 14) {
		const oldest = avoided[0]!;
		insights.push({
			id: 'avoidance',
			kind: 'avoidance',
			severity: Math.min(92, 46 + avoided.length * 6 + Math.floor((oldest.age ?? 0) / 7)),
			headline: `${avoided.length} tasks have sat untouched for weeks — that reads as avoidance, not backlog.`,
			evidence: `The oldest, “${oldest.title}”, has waited ${humanDays(oldest.age ?? 0)}.`,
			lever: {
				label: 'Deal with these',
				prompt: `I have ${avoided.length} tasks I keep putting off, some for over ${humanDays(oldest.age ?? 0)}. Walk me through them one by one — for each, help me reschedule it honestly, hand it off, or drop it.`,
			},
		});
	}

	if (overdue.length >= 1) {
		const worst = overdue[0]!;
		insights.push({
			id: 'overdue',
			kind: 'overdue',
			severity: Math.min(95, 58 + Math.min(30, worst.over)),
			headline: `${overdue.length} ${overdue.length === 1 ? 'task is past its date' : 'tasks are past their date'} — the worst by ${humanDays(worst.over)}.`,
			evidence: `“${worst.title}” was due ${humanDays(worst.over)} ago.`,
			lever: {
				label: 'Reset the dates',
				prompt: `I have ${overdue.length} overdue tasks. Help me reschedule them to dates I'll actually hit, starting with the ${humanDays(worst.over)}-overdue “${worst.title}”.`,
			},
		});
	}

	if (outlier && outlier.openCount >= 3) {
		insights.push({
			id: 'outlier',
			kind: 'outlier',
			severity: 50 + outlier.overdueCount * 6,
			headline: `${outlier.name} is eating your backlog — more open work than anyone else.`,
			evidence: `${outlier.openCount} open${outlier.overdueCount ? `, ${outlier.overdueCount} already overdue` : ''}.`,
			lever: {
				label: `Unstick ${outlier.name}`,
				prompt: `${outlier.name} has ${outlier.openCount} open tasks piling up. Help me get them unstuck — what's the real next move, and what can we clear or hand off?`,
			},
		});
	}

	if (medianLatencyDays != null && (medianLatencyDays > 10 || slowTailCount >= 3)) {
		insights.push({
			id: 'latency',
			kind: 'latency',
			severity: 38 + Math.min(24, (medianLatencyDays ?? 0)),
			headline: `You finish what you start, but it drags — a task takes ${humanDays(medianLatencyDays)} to close, typically.`,
			evidence: slowTailCount >= 3 ? `${slowTailCount} of your recent tasks sat open for over three weeks.` : `Half of your tasks take longer than ${humanDays(medianLatencyDays)}.`,
			lever: {
				label: 'Tighten it',
				prompt: `My tasks take a median of ${medianLatencyDays} days to close and ${slowTailCount} sat open over three weeks. Help me figure out what's slowing me down and pick two changes to tighten it.`,
			},
		});
	}

	insights.sort((a, b) => b.severity - a.severity);

	return { signals, insights, completions };
}
