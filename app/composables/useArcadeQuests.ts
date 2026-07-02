// composables/useArcadeQuests.ts
/**
 * Arcade quests — daily + weekly challenges that reward a completion bonus.
 *
 * Deliberately NO new Directus collection: quest progress is derived entirely
 * from data the profile already loads (EP history + streak), and "claimed"
 * state lives in `localStorage`, keyed by quest id + period so it resets each
 * day / ISO week. The claim bonus is persisted honestly through the normal
 * award endpoint (`daily_quest` / `weekly_quest` EP events) so the number the
 * quest board celebrates matches the profile total.
 *
 * The underlying actions (closing tickets, winning deals, showing up) already
 * awarded their own EP — the quest bonus is the extra "you finished the set"
 * kicker, not a re-count of the same work.
 */
import { useArcadeAwards } from '~/composables/useArcadeAwards';

export interface QuestSnapshot {
	/** EP earned today (from earnest_history). */
	todayEP: number;
	/** EP earned so far this ISO week. */
	weekEP: number;
	/** Days active this ISO week (history rows with ep_earned > 0). */
	daysActiveThisWeek: number;
	/** Current consecutive-day streak. */
	streak: number;
}

export interface Quest {
	id: string;
	period: 'daily' | 'weekly';
	label: string;
	blurb: string;
	icon: string;
	target: number;
	current: number;
	progress: number; // 0–1
	done: boolean;
	bonus: number; // EP granted on claim
}

interface QuestDef {
	id: string;
	period: 'daily' | 'weekly';
	label: string;
	blurb: string;
	icon: string;
	target: number;
	bonus: number;
	value: (s: QuestSnapshot) => number;
}

const DAILY_BONUS = 15;
const WEEKLY_BONUS = 40;

const QUEST_DEFS: QuestDef[] = [
	// ── Daily ──
	{
		id: 'daily-showup',
		period: 'daily',
		label: 'Daily check-in',
		blurb: 'Earn any EP today',
		icon: 'i-heroicons-sun',
		target: 1,
		bonus: DAILY_BONUS,
		value: (s) => (s.todayEP > 0 ? 1 : 0),
	},
	{
		id: 'daily-power',
		period: 'daily',
		label: 'Power day',
		blurb: 'Earn 75 EP today',
		icon: 'i-heroicons-bolt',
		target: 75,
		bonus: DAILY_BONUS,
		value: (s) => s.todayEP,
	},
	// ── Weekly ──
	{
		id: 'weekly-consistency',
		period: 'weekly',
		label: 'Consistency',
		blurb: 'Be active 5 days this week',
		icon: 'i-heroicons-calendar-days',
		target: 5,
		bonus: WEEKLY_BONUS,
		value: (s) => s.daysActiveThisWeek,
	},
	{
		id: 'weekly-grind',
		period: 'weekly',
		label: 'Weekly grind',
		blurb: 'Earn 300 EP this week',
		icon: 'i-heroicons-fire',
		target: 300,
		bonus: WEEKLY_BONUS,
		value: (s) => s.weekEP,
	},
	{
		id: 'weekly-momentum',
		period: 'weekly',
		label: 'Momentum',
		blurb: 'Reach a 7-day streak',
		icon: 'i-heroicons-arrow-trending-up',
		target: 7,
		bonus: WEEKLY_BONUS,
		value: (s) => s.streak,
	},
];

/** ISO-week key like `2026-W27` — the Monday-anchored week the date falls in. */
function isoWeekKey(d: Date): string {
	// Copy so we don't mutate the input; shift to Thursday of this week (ISO rule).
	const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
	const day = date.getUTCDay() || 7; // Sun = 7
	date.setUTCDate(date.getUTCDate() + 4 - day);
	const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
	const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
	return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function useArcadeQuests() {
	const { awardEvent } = useArcadeAwards();

	const periodKey = (period: 'daily' | 'weekly'): string => {
		const now = new Date();
		return period === 'daily' ? now.toISOString().split('T')[0]! : isoWeekKey(now);
	};

	const storageKey = (q: Pick<Quest, 'id' | 'period'>) =>
		`arcade:quest:${q.id}:${periodKey(q.period)}`;

	const isClaimed = (q: Pick<Quest, 'id' | 'period'>): boolean => {
		if (!import.meta.client) return false;
		try {
			return localStorage.getItem(storageKey(q)) === '1';
		} catch {
			return false;
		}
	};

	/** Compute the live quest list from a data snapshot. */
	const buildQuests = (s: QuestSnapshot): Quest[] =>
		QUEST_DEFS.map((def) => {
			const current = Math.max(0, def.value(s));
			const progress = Math.min(1, def.target > 0 ? current / def.target : 0);
			return {
				id: def.id,
				period: def.period,
				label: def.label,
				blurb: def.blurb,
				icon: def.icon,
				target: def.target,
				current: Math.min(current, def.target),
				progress,
				done: current >= def.target,
				bonus: def.bonus,
			};
		});

	/**
	 * Claim a completed quest's bonus. Idempotent per period: a second call in
	 * the same day/week is a no-op. Returns true if the bonus was awarded.
	 */
	const claim = async (q: Quest): Promise<boolean> => {
		if (!q.done || isClaimed(q)) return false;
		try {
			localStorage.setItem(storageKey(q), '1');
		} catch {
			// If storage is unavailable we still award — worst case is a re-claim,
			// which the server treats as just another (legitimate) bonus.
		}
		// awardEvent fires the celebratory pop + persists the bonus EP.
		await awardEvent(q.period === 'daily' ? 'daily_quest' : 'weekly_quest');
		return true;
	};

	return { buildQuests, isClaimed, claim };
}
