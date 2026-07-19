// server/api/mirror/me.get.ts
//
// The Mirror — a READ-ONLY reflection of how the current user actually works.
// It FINDS patterns (avoidance, latency, overdue slippage, the client eating
// your backlog) via computeMirrorSignals and returns them as insights with
// levers, plus a light momentum readout and the raw completion timestamps the
// client buckets into a local-time rhythm. Fast + deterministic; Earnest's
// honest read is a separate POST /api/mirror/reflect so this stays instant.

import { readItems } from '@directus/sdk';
import { computeMirrorSignals } from '~~/server/utils/mirror-signals';

const DAY_MS = 86_400_000;

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

	const orgId = getQuery(event).orgId as string;
	if (!orgId) throw createError({ statusCode: 400, message: 'orgId is required' });

	const directus = await getUserDirectus(event);
	const iso = (ms: number) => new Date(ms).toISOString();
	const now = Date.now();

	// ── The insight engine (avoidance / latency / overdue / outlier) ───────────
	let signals: any = null, insights: any[] = [], completions: string[] = [];
	try {
		const res = await computeMirrorSignals(directus, orgId, userId);
		signals = res.signals; insights = res.insights; completions = res.completions;
	} catch {
		signals = null; insights = []; completions = [];
	}

	// ── Momentum: Earnest Score snapshot + 30-day trend (light, secondary) ─────
	let momentum: any = null;
	try {
		const scores = (await directus.request(
			readItems('earnest_scores', {
				filter: { organization: { _eq: orgId } },
				fields: ['current_score', 'streak', 'best_streak', 'level', 'days_active_this_week', 'total_tasks_completed'],
				limit: 1,
			}),
		)) as any[];
		const s = scores[0];
		if (s) {
			momentum = {
				score: Number(s.current_score) || 0,
				streak: Number(s.streak) || 0,
				bestStreak: Number(s.best_streak) || 0,
				daysActiveThisWeek: Number(s.days_active_this_week) || 0,
				totalTasksCompleted: Number(s.total_tasks_completed) || 0,
			};
		}
	} catch { /* momentum optional */ }

	let history: Array<{ date: string; score: number }> = [];
	try {
		const since = iso(now - 30 * DAY_MS).split('T')[0];
		const rows = (await directus.request(
			readItems('earnest_history', {
				filter: { organization: { _eq: orgId }, date: { _gte: since } },
				fields: ['date', 'score'],
				sort: ['date'],
				limit: 90,
			}),
		)) as any[];
		history = rows.map((r) => ({ date: String(r.date), score: Number(r.score) || 0 }));
	} catch { /* trend optional */ }

	return { generatedAt: iso(now), signals, insights, completions, momentum, history };
});
