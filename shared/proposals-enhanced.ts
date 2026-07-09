/**
 * Proposals System Types (Enhanced)
 */

export type ProposalStatus = 'draft' | 'sent' | 'viewed' | 'accepted' | 'rejected' | 'expired';

export interface ProposalFilters {
  proposal_status?: ProposalStatus;
  organization?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
}

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  viewed: 'Viewed',
  accepted: 'Accepted',
  rejected: 'Rejected',
  expired: 'Expired',
};

// Status colors are no longer hardcoded here — they route through the
// palette-driven canonical buckets in `useStatusStyle()` (getStatusBadgeClasses).
