/**
 * Event-category presets — the "standard packs" an org seeds and then owns.
 *
 * Categories replace the old fixed `type` enum as the user-facing classifier
 * for project events. Each category carries a `kind` (behavior tag) that drives
 * the create-form's progressive disclosure and the "bill this milestone" action,
 * so categories stay cosmetic *and* functional.
 *
 * Packs are industry-flavored. An org auto-selects the pack matching its
 * `industry.class`, seeds editable copies, then customizes freely.
 */

export type CategoryKind = 'general' | 'design' | 'content' | 'timeline' | 'financial' | 'hours';

export interface CategoryPreset {
  name: string;
  color: string;
  icon: string;
  kind: CategoryKind;
}

export interface CategoryPack {
  key: string;
  label: string;
  /** One-line hint shown in the pack picker. */
  blurb: string;
  categories: CategoryPreset[];
}

/** kind → which create-form sections auto-open (keys match EventCreateForm SECTIONS). */
export const KIND_TO_SECTIONS: Record<CategoryKind, string[]> = {
  general: ['timeline'],
  design: ['timeline', 'links', 'files'],
  content: ['links', 'files'],
  timeline: ['timeline'],
  financial: ['billing'],
  hours: ['billing'],
};

/** kind → legacy `type` enum value (mirrored on save for back-compat + billing). */
export const KIND_TO_TYPE: Record<CategoryKind, string> = {
  general: 'General',
  design: 'Design',
  content: 'Content',
  timeline: 'Timeline',
  financial: 'Financial',
  hours: 'Hours',
};

/** Options for the `kind` picker when creating/editing a custom category. */
export const KIND_OPTIONS: { value: CategoryKind; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'design', label: 'Design — shows Figma & files' },
  { value: 'content', label: 'Content — shows links & files' },
  { value: 'timeline', label: 'Timeline / milestone' },
  { value: 'financial', label: 'Billing — shows invoices' },
  { value: 'hours', label: 'Hours' },
];

const CREATIVE: CategoryPreset[] = [
  { name: 'Strategy', color: '#64748b', icon: '🎯', kind: 'general' },
  { name: 'Kickoff', color: '#4da6ff', icon: '🚀', kind: 'timeline' },
  { name: 'Concept', color: '#a855f7', icon: '💡', kind: 'design' },
  { name: 'Design', color: '#ec4899', icon: '🎨', kind: 'design' },
  { name: 'Copy', color: '#f59e0b', icon: '✏️', kind: 'content' },
  { name: 'Production', color: '#10b981', icon: '🎬', kind: 'design' },
  { name: 'Review', color: '#eab308', icon: '👀', kind: 'general' },
  { name: 'Launch', color: '#ef4444', icon: '📣', kind: 'timeline' },
  { name: 'Billing', color: '#0ea5e9', icon: '💳', kind: 'financial' },
];

const CONSTRUCTION: CategoryPreset[] = [
  { name: 'Planning', color: '#64748b', icon: '🗺️', kind: 'general' },
  { name: 'Site Visit', color: '#0ea5e9', icon: '📍', kind: 'general' },
  { name: 'Permitting', color: '#f59e0b', icon: '📋', kind: 'general' },
  { name: 'Design', color: '#a855f7', icon: '📐', kind: 'design' },
  { name: 'Procurement', color: '#8b5cf6', icon: '📦', kind: 'general' },
  { name: 'Construction', color: '#f97316', icon: '🏗️', kind: 'timeline' },
  { name: 'Inspection', color: '#eab308', icon: '🔍', kind: 'general' },
  { name: 'Draw / Invoice', color: '#0ea5e9', icon: '💳', kind: 'financial' },
  { name: 'Handover', color: '#22c55e', icon: '🔑', kind: 'timeline' },
];

const PROFESSIONAL: CategoryPreset[] = [
  { name: 'Discovery', color: '#64748b', icon: '🔍', kind: 'general' },
  { name: 'Proposal', color: '#4da6ff', icon: '📄', kind: 'general' },
  { name: 'Kickoff', color: '#8b5cf6', icon: '🚀', kind: 'timeline' },
  { name: 'Research', color: '#a855f7', icon: '📚', kind: 'content' },
  { name: 'Drafting', color: '#f59e0b', icon: '✏️', kind: 'content' },
  { name: 'Review', color: '#eab308', icon: '👀', kind: 'general' },
  { name: 'Filing', color: '#10b981', icon: '📋', kind: 'general' },
  { name: 'Billing', color: '#0ea5e9', icon: '💳', kind: 'financial' },
  { name: 'Meeting', color: '#ec4899', icon: '📅', kind: 'general' },
];

const DEFAULT_PACK: CategoryPreset[] = [
  { name: 'Planning', color: '#64748b', icon: '🗺️', kind: 'general' },
  { name: 'Kickoff', color: '#4da6ff', icon: '🚀', kind: 'timeline' },
  { name: 'Design', color: '#a855f7', icon: '🎨', kind: 'design' },
  { name: 'Content', color: '#f59e0b', icon: '✏️', kind: 'content' },
  { name: 'Development', color: '#10b981', icon: '💻', kind: 'design' },
  { name: 'Review', color: '#eab308', icon: '👀', kind: 'general' },
  { name: 'Launch', color: '#ef4444', icon: '🎉', kind: 'timeline' },
  { name: 'Billing', color: '#0ea5e9', icon: '💳', kind: 'financial' },
  { name: 'Meeting', color: '#ec4899', icon: '📅', kind: 'general' },
];

export const CATEGORY_PACKS: Record<string, CategoryPack> = {
  default: { key: 'default', label: 'Standard', blurb: 'A well-rounded set for any project team.', categories: DEFAULT_PACK },
  creative: { key: 'creative', label: 'Creative / Marketing', blurb: 'Strategy → concept → design → launch.', categories: CREATIVE },
  construction: { key: 'construction', label: 'Architecture / Construction', blurb: 'Permitting, site visits, construction phases.', categories: CONSTRUCTION },
  professional: { key: 'professional', label: 'Professional Services', blurb: 'Discovery, drafting, filing, billing.', categories: PROFESSIONAL },
};

/** Industry `class` slug → pack key. Unmapped industries fall back to `default`. */
export const INDUSTRY_TO_PACK: Record<string, string> = {
  'marketing-communications': 'creative',
  'arts-culture-nonprofit': 'creative',
  'fashion-beauty': 'creative',
  'tech': 'creative',
  'hospitality-events': 'creative',
  'architecture-construction': 'construction',
  'real-estate-development': 'construction',
  'professional-services': 'professional',
  'government-community-development': 'professional',
};

export function packKeyForIndustryClass(cls?: string | null): string {
  return (cls && INDUSTRY_TO_PACK[cls]) || 'default';
}
