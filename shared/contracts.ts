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

// Status colors are no longer hardcoded here — they route through the
// palette-driven canonical buckets in `useStatusStyle()` (getStatusBadgeClasses).
