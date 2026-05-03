/**
 * Shared types for the marketing-signal extractor layer.
 *
 * Each card-type extractor returns 0..N RecommendationCandidate rows.
 * The ranker picks top N across all candidates and writes them to
 * marketing_recommendations.
 */
import type { MarketingCardType } from '~~/shared/marketing-persistence';

export interface RecommendationCandidate {
	organization: string;
	card_type: MarketingCardType;
	candidate_data: Record<string, unknown>;
	/** Used by the ranker to break ties; higher = surface sooner. */
	impact_score: number;
	/** Days since the underlying signal first became actionable. Lower = fresher. */
	recency_days: number;
	/** A short, human-readable hook the ranker may copy into ranker_output.why_now. */
	why_now: string;
	/** Token-budget hint for the card's "Generate" pill. */
	token_estimate: number;
	/** Comma-friendly summary of what gets produced (used by the card UI). */
	deliverables: string;
}
