/**
 * Proposal pursuit state — the single derivation used by the pursuit timeline (A)
 * and the proposal pipeline board (B), so "cold" means the same thing everywhere.
 *
 * "Cold" is DERIVED, not stored: a proposal that was sent/viewed but has gone
 * quiet — past its valid_until, or older than COLD_DAYS with no accept/reject.
 */
export type ProposalPursuitState = 'draft' | 'sent' | 'viewed' | 'cold' | 'won' | 'lost';

export const COLD_DAYS = 14;

export interface ProposalLike {
	proposal_status?: string | null;
	date_sent?: string | null;
	valid_until?: string | null;
	date_created?: string | null;
}

export function proposalPursuitState(
	p: ProposalLike,
	now: Date = new Date(),
): { state: ProposalPursuitState; isCold: boolean; daysOut: number } {
	const status = (p.proposal_status || 'draft') as string;
	if (status === 'accepted') return { state: 'won', isCold: false, daysOut: 0 };
	if (status === 'rejected' || status === 'expired') return { state: 'lost', isCold: false, daysOut: 0 };
	if (status === 'draft') return { state: 'draft', isCold: false, daysOut: 0 };

	// sent | viewed → live unless it's gone cold.
	const sentAt = p.date_sent ? new Date(p.date_sent) : (p.date_created ? new Date(p.date_created) : null);
	const daysOut = sentAt ? Math.max(0, Math.floor((now.getTime() - sentAt.getTime()) / 86_400_000)) : 0;
	const pastValid = !!p.valid_until && new Date(p.valid_until).getTime() < now.getTime();
	const stale = !!sentAt && daysOut >= COLD_DAYS;
	if (pastValid || stale) return { state: 'cold', isCold: true, daysOut };
	return { state: status === 'viewed' ? 'viewed' : 'sent', isCold: false, daysOut };
}

/** Column order + display for the pipeline board. */
export const PROPOSAL_PIPELINE_COLUMNS: Array<{ key: ProposalPursuitState; label: string; tone: string }> = [
	{ key: 'draft', label: 'Draft', tone: 'muted' },
	{ key: 'sent', label: 'Sent', tone: 'info' },
	{ key: 'viewed', label: 'Viewed', tone: 'view' },
	{ key: 'cold', label: 'Cold', tone: 'warn' },
	{ key: 'won', label: 'Won', tone: 'good' },
	{ key: 'lost', label: 'Lost', tone: 'bad' },
];

/** Why a proposal was lost / went cold. */
export const PROPOSAL_LOSS_REASONS: Array<{ value: string; label: string }> = [
	{ value: 'price', label: 'Price' },
	{ value: 'timing', label: 'Timing' },
	{ value: 'competitor', label: 'Lost to competitor' },
	{ value: 'no_response', label: 'No response / ghosted' },
	{ value: 'scope', label: 'Scope mismatch' },
	{ value: 'budget', label: 'Budget' },
	{ value: 'other', label: 'Other' },
];
export const lossReasonLabel = (v?: string | null) =>
	PROPOSAL_LOSS_REASONS.find((r) => r.value === v)?.label || (v ? String(v) : '');
