/**
 * Marketing-recommendation ranker.
 *
 * v1: deterministic top-N by impact_score with a freshness boost. The
 * spec calls for an LLM ranker pass to attach a "why_now" sentence, but
 * the extractors already write a serviceable why_now per candidate, so
 * v1 skips the LLM hop entirely. This keeps the cron predictable and
 * cheap and lets us swap in the LLM ranker without touching callers.
 *
 * Selection rules:
 *   - Boost newly-completed projects (recency_days <= 7) by +10 to keep
 *     project_complete cards from being drowned by larger dormant pools.
 *   - Cap at one project_complete card per project (impact dedup by title).
 *   - Cap at one dormant_clients card per org (the extractor already
 *     emits at most one).
 *   - Final pick: top 3 distinct cards.
 */
import type { RecommendationCandidate } from '../marketing-signals/types';

const TOP_N = 3;
const FRESHNESS_BOOST = 10;
const FRESHNESS_WINDOW_DAYS = 7;

export interface RankerSelectArgs {
	candidates: RecommendationCandidate[];
	runId: string;
	promptVersion: string;
}

export interface RankedRecommendation {
	candidate: RecommendationCandidate;
	score: number;
	rankerOutput: {
		why_now: string;
		urgency: number;
		audience_overlap_with: string[];
	};
}

function dedupKey(c: RecommendationCandidate): string {
	if (c.card_type === 'project_complete') {
		const title = (c.candidate_data as any)?.signal?.project_title || c.why_now;
		return `project_complete:${title}`;
	}
	if (c.card_type === 'lead_reengagement') {
		const label = (c.candidate_data as any)?.cluster?.label || 'unknown';
		return `lead_reengagement:${label}`;
	}
	return `${c.card_type}:${c.organization}`;
}

export function selectTopN(args: RankerSelectArgs): RankedRecommendation[] {
	const seen = new Set<string>();
	const scored: RankedRecommendation[] = [];

	for (const c of args.candidates) {
		const k = dedupKey(c);
		if (seen.has(k)) continue;
		seen.add(k);
		const fresh = c.recency_days <= FRESHNESS_WINDOW_DAYS ? FRESHNESS_BOOST : 0;
		const score = c.impact_score + fresh;
		// Convert score back to a 0-100 urgency for the card UI.
		const urgency = Math.max(0, Math.min(100, Math.round(score)));
		scored.push({
			candidate: c,
			score,
			rankerOutput: {
				why_now: c.why_now,
				urgency,
				audience_overlap_with: [],
			},
		});
	}

	scored.sort((a, b) => b.score - a.score);
	return scored.slice(0, TOP_N);
}

export const RANKER_PROMPT_VERSION = 'deterministic_v1';
