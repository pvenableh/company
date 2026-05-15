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

/**
 * Lead-stage → palette tag-slot assignment.
 *
 * Each stage is pinned to a fixed slot in the `--tag-N` ramp emitted by
 * `applyPaletteToDocument()`. Slot assignment is stable across renders
 * (a "qualified" lead is always slot 3), but the actual hue at that slot
 * shifts per palette: Sea Mist's slot 3 is Strong Cyan, Aurora's slot 3
 * is Magenta Iris, Neutral's slot 3 is Blue Green. So a kanban board of
 * leads stays internally distinguishable while re-skinning on palette
 * switch — same logic as host stripes in useCalendarEvents.
 *
 * Won/lost intentionally route through the semantic intent tokens
 * (`--success`/`--destructive`) rather than tag slots, so terminal
 * outcomes always read with their proper meaning regardless of palette.
 *
 * Returned as `hsl(var(--…))` strings so every existing consumer
 * (`:style="{ backgroundColor: LEAD_STAGE_COLORS[stage] }"`) keeps
 * working with no call-site changes.
 */
export const LEAD_STAGE_COLORS: Record<LeadStage, string> = {
  new:           'hsl(var(--tag-1))',  // bright opening — head of the ramp
  contacted:     'hsl(var(--tag-2))',
  qualified:     'hsl(var(--tag-3))',
  proposal_sent: 'hsl(var(--tag-5))',  // mid-ramp pivot — proposal in motion
  negotiating:   'hsl(var(--tag-7))',  // late-ramp tension
  won:           'hsl(var(--success))',
  lost:          'hsl(var(--destructive))',
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
