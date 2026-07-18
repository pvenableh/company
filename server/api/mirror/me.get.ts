// server/api/mirror/me.get.ts
//
// The Mirror — a READ-ONLY reflection of how the current user actually works.
// It reflects, it does not advise: momentum (Earnest Score + trend), the raw
// completion timestamps behind your rhythm, the work that's been sitting, and
// the themes you keep returning to in your notes. No new collections — this
// only reads what already exists (earnest_scores, earnest_history, tasks,
// ai_notes), user- and org-scoped via the user's own Directus client (RLS).
//
// Bucketing/ages are intentionally left to the client so they land in the
// user's LOCAL timezone (honest rhythm), not the server's UTC. This route is a
// thin, defensive data provider — every section is best-effort so one empty or
// failing read never blanks the whole Mirror.

import { readItems } from '@directus/sdk';

const DAY_MS = 86_400_000;

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	if (!userId) {
		throw createError({ statusCode: 401, message: 'Authentication required' });
	}

	const orgId = getQuery(event).orgId as string;
	if (!orgId) {
		throw createError({ statusCode: 400, message: 'orgId is required' });
	}

	const directus = await getUserDirectus(event);
	const iso = (ms: number) => new Date(ms).toISOString();
	const now = Date.now();

	// ── Momentum: the Earnest Score snapshot + a 30-day trend ──────────────────
	let momentum: any = null;
	try {
		const scores = (await directus.request(
			readItems('earnest_scores', {
				filter: { organization: { _eq: orgId } },
				fields: [
					'current_score', 'streak', 'best_streak', 'level',
					'days_active_this_week', 'total_tasks_completed', 'last_activity_date',
				],
				limit: 1,
			}),
		)) as any[];
		const s = scores[0];
		if (s) {
			momentum = {
				score: Number(s.current_score) || 0,
				streak: Number(s.streak) || 0,
				bestStreak: Number(s.best_streak) || 0,
				level: Number(s.level) || 1,
				daysActiveThisWeek: Number(s.days_active_this_week) || 0,
				totalTasksCompleted: Number(s.total_tasks_completed) || 0,
				lastActivityDate: s.last_activity_date || null,
			};
		}
	} catch { /* no score yet — momentum stays null */ }

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
	} catch { /* trend is optional */ }

	// ── Rhythm: raw completion timestamps (client buckets them in local time) ──
	let completions: string[] = [];
	try {
		const since = iso(now - 60 * DAY_MS);
		const done = (await directus.request(
			readItems('tasks', {
				filter: {
					organization_id: { _eq: orgId },
					status: { _eq: 'completed' },
					assigned_to: { directus_users_id: { _eq: userId } },
				},
				fields: ['date_completed', 'date_updated'],
				sort: ['-date_updated'],
				limit: 400,
			}),
		)) as any[];
		completions = done
			.map((t) => t.date_completed || t.date_updated)
			.filter((d): d is string => !!d && new Date(d).getTime() >= now - 60 * DAY_MS);
	} catch { /* rhythm is best-effort */ }

	// ── Sitting: open work assigned to me, oldest first (an honest nudge) ──────
	let sitting: Array<{ id: string; title: string; schedule: string | null; created: string | null }> = [];
	try {
		const open = (await directus.request(
			readItems('tasks', {
				filter: {
					organization_id: { _eq: orgId },
					status: { _nin: ['completed'] },
					assigned_to: { directus_users_id: { _eq: userId } },
				},
				fields: ['id', 'title', 'schedule', 'date_created'],
				sort: ['date_created'],
				limit: 6,
			}),
		)) as any[];
		sitting = open.map((t) => ({
			id: String(t.id),
			title: t.title || 'Untitled task',
			schedule: t.schedule ?? null,
			created: t.date_created ?? null,
		}));
	} catch { /* sitting is best-effort */ }

	// ── Themes: what you keep returning to in your notes ───────────────────────
	let themes: { noteCount: number; tags: Array<{ name: string; count: number }>; recentTitles: string[] } = {
		noteCount: 0, tags: [], recentTitles: [],
	};
	try {
		const notes = (await directus.request(
			readItems('ai_notes', {
				filter: { user: { _eq: userId }, status: { _eq: 'active' } },
				fields: ['title', 'date_updated', 'tags.ai_tags_id.name'],
				sort: ['-date_updated'],
				limit: 60,
			}),
		)) as any[];
		const tagCounts = new Map<string, number>();
		for (const n of notes) {
			for (const t of n.tags || []) {
				const name = t?.ai_tags_id?.name;
				if (name) tagCounts.set(name, (tagCounts.get(name) || 0) + 1);
			}
		}
		themes = {
			noteCount: notes.length,
			tags: [...tagCounts.entries()]
				.map(([name, count]) => ({ name, count }))
				.sort((a, b) => b.count - a.count)
				.slice(0, 6),
			recentTitles: notes.map((n) => n.title).filter(Boolean).slice(0, 4),
		};
	} catch { /* themes are best-effort */ }

	return {
		generatedAt: iso(now),
		momentum,
		history,
		completions,
		sitting,
		themes,
	};
});
