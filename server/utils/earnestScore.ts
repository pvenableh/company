// server/utils/earnestScore.ts
/**
 * Earnest Score calculation and award engine.
 *
 * Called by event handlers across the platform to award EP and update scores.
 * Scores are org-level — collective team performance. This is the primary
 * churn-reduction mechanism: "switching feels like starting over."
 *
 * Five dimensions: delivery, communication, finance, growth, consistency.
 * Each platform event maps to one dimension and awards a fixed EP amount.
 */

import { readItems, readItem, createItem, updateItem } from '@directus/sdk';

export type ScoreDimension = 'delivery' | 'communication' | 'finance' | 'growth' | 'consistency';

export interface EPAward {
	dimension: ScoreDimension;
	ep: number;
	reason: string;
}

// EP values per event type
export const EP_AWARDS: Record<string, EPAward> = {
	// Delivery — completing work
	ticket_closed:        { dimension: 'delivery',      ep: 10, reason: 'Ticket resolved' },
	project_completed:    { dimension: 'delivery',      ep: 25, reason: 'Project completed' },
	project_on_time:      { dimension: 'delivery',      ep: 15, reason: 'Delivered on time' },

	// Communication — team/client interaction
	message_sent:         { dimension: 'communication', ep: 2,  reason: 'Team message' },
	comment_posted:       { dimension: 'communication', ep: 2,  reason: 'Comment added' },
	meeting_held:         { dimension: 'communication', ep: 5,  reason: 'Meeting completed' },

	// Finance — billing discipline
	invoice_sent:         { dimension: 'finance',       ep: 5,  reason: 'Invoice sent' },
	invoice_paid_on_time: { dimension: 'finance',       ep: 15, reason: 'Paid on time' },
	expense_logged:       { dimension: 'finance',       ep: 3,  reason: 'Expense tracked' },

	// Growth — new business
	card_scan:            { dimension: 'growth',        ep: 5,  reason: 'CardDesk scan' },
	contact_added:        { dimension: 'growth',        ep: 10, reason: 'Contact added to CRM' },
	deal_won:             { dimension: 'growth',        ep: 20, reason: 'Deal won' },
	social_post:          { dimension: 'growth',        ep: 3,  reason: 'Social post published' },

	// Consistency — showing up
	daily_login:          { dimension: 'consistency',   ep: 3,  reason: 'Daily login' },
	task_completed:       { dimension: 'consistency',   ep: 3,  reason: 'Task completed' },
};

export type EPEventType = keyof typeof EP_AWARDS;

// Level thresholds — level N requires LEVEL_THRESHOLDS[N-1] total EP
const LEVEL_THRESHOLDS = [0, 100, 250, 500, 1000, 2000, 3500, 5000, 7500, 10000];

function calculateLevel(totalEp: number): number {
	let level = 1;
	for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
		const threshold = LEVEL_THRESHOLDS[i];
		if (threshold !== undefined && totalEp >= threshold) level = i + 1;
		else break;
	}
	return level;
}

/**
 * Calculate a 0–100 "current score" from dimension scores.
 * Each dimension contributes 20 points max. Score = sum of dimension %s × 20.
 * This gives a quick health indicator independent of total EP.
 */
function calculateCurrentScore(dimensions: Record<string, number>): number {
	const dimensionNames: ScoreDimension[] = ['delivery', 'communication', 'finance', 'growth', 'consistency'];
	// Target EP per dimension per month — what "healthy" looks like
	const dimensionTargets: Record<ScoreDimension, number> = {
		delivery: 100,
		communication: 50,
		finance: 40,
		growth: 60,
		consistency: 50,
	};

	let score = 0;
	for (const dim of dimensionNames) {
		const actual = dimensions[dim] ?? 0;
		const target = dimensionTargets[dim];
		const pct = Math.min(actual / target, 1); // cap at 100%
		score += pct * 20; // each dimension worth 20 points
	}
	return Math.round(score);
}

/**
 * Award EP to an org's score for a platform event.
 * Gets or creates the earnest_scores record. Updates dimension_scores,
 * total_ep, level, streak, and current_score.
 *
 * Fire-and-forget — callers should .catch() and never await in the critical path.
 */
export async function awardEP(
	orgId: string,
	eventType: EPEventType,
	_userId?: string, // reserved for per-user scoring in future
): Promise<void> {
	const award = EP_AWARDS[eventType];
	if (!award) return;

	const directus = getTypedDirectus();

	// Get existing score record for this org
	const scoreRecords = await directus.request(
		readItems('earnest_scores', {
			filter: { organization: { _eq: orgId } },
			fields: [
				'id', 'total_ep', 'level', 'streak', 'best_streak',
				'last_activity_date', 'dimension_scores', 'badges_unlocked',
				'days_active_this_week',
			],
			limit: 1,
		})
	) as any[];

	const today = new Date().toISOString().split('T')[0]!;

	if (scoreRecords.length === 0) {
		// Create initial score record
		const dimensions = { [award.dimension]: award.ep };
		await directus.request(
			createItem('earnest_scores', {
				organization: orgId,
				total_ep: award.ep,
				level: 1,
				current_score: calculateCurrentScore(dimensions),
				streak: 1,
				best_streak: 1,
				last_activity_date: today,
				dimension_scores: dimensions,
				badges_unlocked: {},
				days_active_this_week: 1,
			})
		);
		// Write initial history record
		await writeHistorySnapshot(directus, orgId, today, award.ep, award.ep, 1, dimensions);
		return;
	}

	const score = scoreRecords[0];
	const dimensions = { ...(score.dimension_scores ?? {}) };
	dimensions[award.dimension] = (dimensions[award.dimension] ?? 0) + award.ep;

	const newTotalEp = (score.total_ep ?? 0) + award.ep;
	const newLevel = calculateLevel(newTotalEp);
	const newCurrentScore = calculateCurrentScore(dimensions);

	// Streak logic
	const lastActive = score.last_activity_date;
	const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]!;
	let newStreak = score.streak ?? 0;
	let newBestStreak = score.best_streak ?? 0;
	let daysActiveThisWeek = score.days_active_this_week ?? 0;

	if (lastActive === today) {
		// Already active today — streak unchanged
	} else if (lastActive === yesterday) {
		// Consecutive day — increment streak
		newStreak += 1;
		newBestStreak = Math.max(newStreak, newBestStreak);
		daysActiveThisWeek += 1;
	} else if (!lastActive || lastActive < yesterday) {
		// Streak broken (or first ever activity)
		newStreak = 1;
		daysActiveThisWeek = 1;
	}

	await directus.request(
		updateItem('earnest_scores', score.id, {
			total_ep: newTotalEp,
			level: newLevel,
			current_score: newCurrentScore,
			streak: newStreak,
			best_streak: newBestStreak,
			last_activity_date: today,
			dimension_scores: dimensions,
			days_active_this_week: daysActiveThisWeek,
		})
	);

	// Write daily history snapshot (one per day, last write wins)
	await writeHistorySnapshot(directus, orgId, today, newCurrentScore, award.ep, newStreak, dimensions);
}

/**
 * Write or update the daily history snapshot for an org.
 * One record per org per day — subsequent awards on the same day update it.
 */
async function writeHistorySnapshot(
	directus: ReturnType<typeof getTypedDirectus>,
	orgId: string,
	date: string,
	score: number,
	epEarned: number,
	streak: number,
	dimensions: Record<string, number>,
): Promise<void> {
	try {
		const existing = await directus.request(
			readItems('earnest_history', {
				filter: {
					organization: { _eq: orgId },
					date: { _eq: date },
				},
				fields: ['id', 'ep_earned'],
				limit: 1,
			})
		) as any[];

		if (existing.length > 0) {
			// Update existing day record — accumulate EP
			await directus.request(
				updateItem('earnest_history', existing[0].id, {
					score,
					ep_earned: (existing[0].ep_earned ?? 0) + epEarned,
					streak,
					dimensions,
				})
			);
		} else {
			await directus.request(
				createItem('earnest_history', {
					organization: orgId,
					date,
					score,
					ep_earned: epEarned,
					streak,
					dimensions,
				})
			);
		}
	} catch (err) {
		// History is supplementary — don't fail the main award
		console.warn('[earnestScore] Failed to write history:', err);
	}
}
