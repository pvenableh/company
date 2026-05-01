/**
 * Contracts System Types
 */

export type ContractStatus = 'draft' | 'sent' | 'signed' | 'declined' | 'cancelled' | 'expired';

export interface ContractFilters {
  contract_status?: ContractStatus;
  organization?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
}

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  signed: 'Signed',
  declined: 'Declined',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

export const CONTRACT_STATUS_COLORS: Record<ContractStatus, string> = {
  draft: '#6B7280',
  sent: '#3B82F6',
  signed: '#10B981',
  declined: '#EF4444',
  cancelled: '#6B7280',
  expired: '#F59E0B',
};
