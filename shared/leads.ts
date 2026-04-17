/**
 * Leads System Types
 */

export type LeadStage = 'new' | 'contacted' | 'qualified' | 'proposal_sent' | 'negotiating' | 'won' | 'lost';
export type LeadPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface LeadFilters {
  status?: string;
  stage?: LeadStage;
  priority?: LeadPriority;
  source?: string;
  assigned_to?: string;
  related_contact?: string;
  tag?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
}

export interface LeadStats {
  total: number;
  by_stage: Record<LeadStage, number>;
  avg_score: number;
  pipeline_value: number;
  new_this_week: number;
}

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  proposal_sent: 'Proposal Sent',
  negotiating: 'Negotiating',
  won: 'Won',
  lost: 'Lost',
};

export const LEAD_STAGE_COLORS: Record<LeadStage, string> = {
  new: '#3B82F6',
  contacted: '#6366F1',
  qualified: '#8B5CF6',
  proposal_sent: '#F59E0B',
  negotiating: '#EC4899',
  won: '#10B981',
  lost: '#EF4444',
};

/** Active pipeline stages for the Kanban board (excludes terminal won/lost) */
export const LEAD_PIPELINE_STAGES: LeadStage[] = [
  'new', 'contacted', 'qualified', 'proposal_sent', 'negotiating',
];

/** CSS variable color names for board column headers */
export const LEAD_STAGE_COLUMN_COLORS: Record<LeadStage, string> = {
  new: 'cyan',
  contacted: 'cyan2',
  qualified: 'green2',
  proposal_sent: 'yellow',
  negotiating: 'pink',
  won: 'green',
  lost: 'red',
};

/** Default follow-up intervals in days per stage */
export const FOLLOW_UP_INTERVALS: Record<LeadStage, number> = {
  new: 1,
  contacted: 3,
  qualified: 5,
  proposal_sent: 2,
  negotiating: 1,
  won: 0,
  lost: 0,
};
