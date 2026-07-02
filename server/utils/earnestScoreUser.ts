// server/utils/earnestScoreUser.ts
/**
 * Per-user, event-driven EP awards — the authoritative source for arcade
 * rewards.
 *
 * Unlike `awardEP()` (org-level, admin token), this awards EP to the
 * *individual* who did the work by running read-modify-write through a
 * user-scoped Directus client, so `earnest_scores.user_created` resolves to
 * that user (the only per-user key the collection has). Levels + titles use
 * the SAME thresholds as the client `useEarnestScore` composable so the number
 * the arcade overlay shows matches the profile panel.
 *
 * Returns an arcade-ready result: the EP granted, the new totals, whether the
 * user leveled up, and any newly-unlocked badges (with display metadata for
 * the badge toast).
 */

import { readItems, createItem, updateItem } from '@directus/sdk';
import { EP_AWARDS, type EPEventType } from './earnestScore';

// Mirrors app/composables/useEarnestScore.ts — keep in sync.
const LEVEL_THRESHOLDS = [0, 200, 500, 1000, 2500, 5000, 10000, 25000, 50000];
const LEVEL_TITLES: Record<number, string> = {
	1: 'Spark',
	2: 'Steady',
	3: 'Intentional',
	4: 'Devoted',
	5: 'Resolute',
	6: 'Principled',
	7: 'Unwavering',
	8: 'Stalwart',
	9: 'Cornerstone',
};

function levelForEP(totalEP: number): number {
	let level = 1;
	for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
		if (totalEP >= (LEVEL_THRESHOLDS[i] ?? 0)) {
			level = i + 1;
			break;
		}
	}
	return level;
}

export function levelTitle(level: number): string {
	return LEVEL_TITLES[level] ?? 'Cornerstone';
}

// Badges checkable from persisted counters (subset of the client set that we
// can evaluate server-side). Each has display metadata for the toast.
interface BadgeDef {
	id: string;
	name: string;
	icon: string;
	description: string;
	check: (s: Record<string, any>) => boolean;
}

const BADGES: BadgeDef[] = [
	{ id: 'first-flame', name: 'First Flame', icon: 'i-heroicons-fire', description: 'The spark that starts the fire', check: (s) => (s.total_tasks_completed ?? 0) >= 1 },
	{ id: 'seven-day-resolve', name: 'Seven-Day Resolve', icon: 'i-heroicons-calendar-days', description: 'A week of unwavering presence', check: (s) => (s.best_streak ?? 0) >= 7 },
	{ id: 'thirty-day-pillar', name: 'Thirty-Day Pillar', icon: 'i-heroicons-shield-check', description: 'A month without faltering', check: (s) => (s.best_streak ?? 0) >= 30 },
	{ id: 'deep-current', name: 'Deep Current', icon: 'i-heroicons-academic-cap', description: 'Depth over breadth', check: (s) => (s.projects_fully_completed ?? 0) >= 3 },
	{ id: 'the-preparator', name: 'The Preparator', icon: 'i-heroicons-clock', description: 'You plan ahead, not scramble', check: (s) => (s.advance_schedule_count ?? 0) >= 5 },
	{ id: 'iron-will', name: 'Iron Will', icon: 'i-heroicons-hand-raised', description: 'Sixty days of relentless commitment', check: (s) => (s.best_streak ?? 0) >= 60 },
	{ id: 'century', name: 'Century', icon: 'i-heroicons-star', description: 'One hundred days without breaking stride', check: (s) => (s.best_streak ?? 0) >= 100 },
];

// Which persisted counter (if any) an event increments.
const EVENT_COUNTERS: Partial<Record<EPEventType, string>> = {
	task_completed: 'total_tasks_completed',
	ticket_closed: 'total_tasks_completed',
	project_completed: 'projects_fully_completed',
};

export interface AwardResult {
	ep: number;
	dimension: string;
	reason: string;
	totalEP: number;
	level: number;
	levelTitle: string;
	leveledUp: boolean;
	newBadges: { id: string; name: string; icon: string; description: string }[];
}

/**
 * Award EP for one event to a single user. `directus` must be a user-scoped
 * client (so `user_created` attributes to the acting user).
 */
export async function awardUserEP(
	directus: any,
	orgId: string,
	userId: string,
	eventType: EPEventType,
): Promise<AwardResult> {
	const award = EP_AWARDS[eventType];
	if (!award) {
		throw new Error(`Unknown EP event: ${eventType}`);
	}

	const today = new Date().toISOString().split('T')[0]!;
	const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]!;

	const rows = (await directus.request(
		readItems('earnest_scores', {
			filter: { user_created: { _eq: userId }, organization: { _eq: orgId } },
			fields: [
				'id', 'total_ep', 'level', 'streak', 'best_streak', 'last_activity_date',
				'days_active_this_week', 'total_tasks_completed', 'projects_fully_completed',
				'advance_schedule_count', 'badges_unlocked', 'dimension_scores', 'current_score',
			],
			sort: ['-total_ep'],
			limit: 1,
		}),
	)) as any[];

	const existing = rows[0] ?? null;

	// ── Streak roll ──
	const lastActive = existing?.last_activity_date ?? null;
	let streak = existing?.streak ?? 0;
	let bestStreak = existing?.best_streak ?? 0;
	let daysActiveThisWeek = existing?.days_active_this_week ?? 0;
	if (lastActive === today) {
		// already counted today
	} else if (lastActive === yesterday) {
		streak += 1;
		daysActiveThisWeek += 1;
	} else {
		streak = 1;
		daysActiveThisWeek = Math.max(1, lastActive ? 1 : 1);
	}
	bestStreak = Math.max(bestStreak, streak);

	// ── EP / level ──
	const prevTotal = existing?.total_ep ?? 0;
	const prevLevel = existing?.level ?? levelForEP(prevTotal);
	let newTotal = prevTotal + award.ep;

	// ── Counter bump ──
	const counterField = EVENT_COUNTERS[eventType];
	const counters: Record<string, any> = {
		total_tasks_completed: existing?.total_tasks_completed ?? 0,
		projects_fully_completed: existing?.projects_fully_completed ?? 0,
		advance_schedule_count: existing?.advance_schedule_count ?? 0,
		best_streak: bestStreak,
	};
	if (counterField) counters[counterField] = (counters[counterField] ?? 0) + 1;

	// ── Badge unlocks ──
	const already: string[] = Array.isArray(existing?.badges_unlocked) ? existing.badges_unlocked : [];
	const newBadges: AwardResult['newBadges'] = [];
	for (const b of BADGES) {
		if (!already.includes(b.id) && b.check(counters)) {
			already.push(b.id);
			newTotal += 75; // badge bonus, matches client
			newBadges.push({ id: b.id, name: b.name, icon: b.icon, description: b.description });
		}
	}

	const newLevel = levelForEP(newTotal);
	const leveledUp = newLevel > prevLevel;

	const patch: Record<string, any> = {
		total_ep: newTotal,
		level: newLevel,
		streak,
		best_streak: bestStreak,
		last_activity_date: today,
		days_active_this_week: Math.min(daysActiveThisWeek, 7),
		total_tasks_completed: counters.total_tasks_completed,
		projects_fully_completed: counters.projects_fully_completed,
		badges_unlocked: already,
	};

	if (existing) {
		await directus.request(updateItem('earnest_scores', existing.id, patch));
	} else {
		await directus.request(
			createItem('earnest_scores', {
				organization: orgId,
				current_score: 0,
				dimension_scores: {},
				...patch,
			}),
		);
	}

	// ── History snapshot (per-user, per-day) ──
	try {
		const hist = (await directus.request(
			readItems('earnest_history', {
				filter: { user_created: { _eq: userId }, organization: { _eq: orgId }, date: { _eq: today } },
				fields: ['id', 'ep_earned'],
				limit: 1,
			}),
		)) as any[];
		const epDelta = newTotal - prevTotal;
		if (hist[0]) {
			await directus.request(
				updateItem('earnest_history', hist[0].id, {
					ep_earned: (hist[0].ep_earned ?? 0) + epDelta,
					streak,
				}),
			);
		} else {
			await directus.request(
				createItem('earnest_history', {
					organization: orgId,
					date: today,
					ep_earned: epDelta,
					streak,
					score: existing?.current_score ?? 0,
				}),
			);
		}
	} catch {
		// history is supplementary — never fail the award on it
	}

	return {
		ep: award.ep,
		dimension: award.dimension,
		reason: award.reason,
		totalEP: newTotal,
		level: newLevel,
		levelTitle: levelTitle(newLevel),
		leveledUp,
		newBadges,
	};
}
