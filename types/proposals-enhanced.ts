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

export const PROPOSAL_STATUS_COLORS: Record<ProposalStatus, string> = {
  draft: '#6B7280',
  sent: '#3B82F6',
  viewed: '#8B5CF6',
  accepted: '#10B981',
  rejected: '#EF4444',
  expired: '#F59E0B',
};
