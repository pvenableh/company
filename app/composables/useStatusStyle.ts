/**
 * useStatusStyle — Unified status styling for the Clean Gantt design system.
 * Single source of truth for mapping status strings to opacity, accent colors, and badge classes.
 */
export function useStatusStyle() {
  const normalize = (status?: string | null): string =>
    (status || '').toLowerCase().replace(/[\s_-]+/g, '');

  // ── Status buckets (single source of truth; normalized keys) ──
  // Normalization strips spaces/underscores/hyphens and lowercases, so
  // "In Progress", "in_progress", "in-progress" all match "inprogress".
  const SUCCESS = ['completed', 'done', 'paid', 'approved', 'published', 'succeeded'];
  const DESTRUCTIVE = ['overdue', 'rejected', 'failed', 'cancelled', 'canceled', 'noshow'];
  const ACTIVE = ['active', 'inprogress', 'open'];
  const SCHEDULED = ['scheduled', 'submitted'];
  const PENDING = ['pending', 'processing', 'new', 'draft', 'paused', 'publishing', 'todo', 'onhold', 'requirespaymentmethod', 'requiresaction', 'intransit', 'prospect'];
  const MUTED = ['archived', 'closed', 'inactive', 'refunded'];

  /** Opacity value for bars, cards, and visual weight (Clean Gantt pattern) */
  function getStatusOpacity(status?: string | null): number {
    const s = normalize(status);
    if ([...SUCCESS, ...MUTED].includes(s)) return 0.3;
    if (ACTIVE.includes(s)) return 1;
    if ([...SCHEDULED, ...PENDING].includes(s)) return 0.6;
    return 0.8;
  }

  /** CSS color string for accent indicators (dots, borders, progress bars) */
  function getStatusAccent(status?: string | null): string {
    const s = normalize(status);
    if (SUCCESS.includes(s)) return 'hsl(var(--success))';
    if (DESTRUCTIVE.includes(s)) return 'hsl(var(--destructive))';
    if (ACTIVE.includes(s)) return 'hsl(160, 60%, 45%)';
    if (SCHEDULED.includes(s)) return 'hsl(199, 89%, 48%)';
    if (PENDING.includes(s)) return 'hsl(var(--warning))';
    if (MUTED.includes(s)) return 'hsl(var(--muted-foreground))';
    return 'hsl(var(--muted-foreground))';
  }

  /** Tailwind classes for inline badge (bg + text) */
  function getStatusBadgeClasses(status?: string | null): string {
    const s = normalize(status);
    if (SUCCESS.includes(s)) return 'bg-green-500/15 text-green-500';
    if (DESTRUCTIVE.includes(s)) return 'bg-destructive/15 text-destructive';
    if (ACTIVE.includes(s)) return 'bg-teal-500/15 text-teal-500';
    if (SCHEDULED.includes(s)) return 'bg-sky-500/15 text-sky-500';
    if (PENDING.includes(s)) return 'bg-amber-500/15 text-amber-500';
    if (MUTED.includes(s)) return 'bg-muted text-muted-foreground';
    return 'bg-muted text-muted-foreground';
  }

  /** CSS class for Clean Gantt opacity pattern */
  function getStatusOpacityClass(status?: string | null): string {
    const o = getStatusOpacity(status);
    if (o <= 0.3) return 'cg-status-completed';
    if (o <= 0.6) return 'cg-status-scheduled';
    return 'cg-status-active';
  }

  /** Solid bg + white text class for prominent status pills */
  function getStatusPillClass(status?: string | null): string {
    const s = normalize(status);
    if (SUCCESS.includes(s)) return 'bg-green-500 text-white';
    if (DESTRUCTIVE.includes(s)) return 'bg-destructive text-white';
    if (ACTIVE.includes(s)) return 'bg-teal-500 text-white';
    if (SCHEDULED.includes(s)) return 'bg-sky-500 text-white';
    if (PENDING.includes(s)) return 'bg-amber-500 text-white';
    if (MUTED.includes(s)) return 'bg-muted-foreground text-white';
    return 'bg-muted-foreground text-white';
  }

  /** Bare color token name (e.g. for UBadge `color` prop or CSS var lookup) */
  function getStatusColorName(status?: string | null): 'green' | 'red' | 'teal' | 'sky' | 'amber' | 'gray' {
    const s = normalize(status);
    if (SUCCESS.includes(s)) return 'green';
    if (DESTRUCTIVE.includes(s)) return 'red';
    if (ACTIVE.includes(s)) return 'teal';
    if (SCHEDULED.includes(s)) return 'sky';
    if (PENDING.includes(s)) return 'amber';
    return 'gray';
  }

  // ── Priority styling (4-level: urgent > high > medium > low) ──

  /** Tailwind bg class for priority pill badges (white text) */
  function getPriorityBadgeClass(priority?: string | null): string {
    const p = normalize(priority);
    if (p === 'urgent') return 'bg-red-600';
    if (p === 'high') return 'bg-[var(--red)]';
    if (p === 'medium' || p === 'normal') return 'bg-[var(--cyan)]';
    if (p === 'low') return 'bg-[var(--lightGrey)]';
    return 'bg-[var(--lightGrey)]';
  }

  /** Tinted bg + matching text (for subtle priority chips) */
  function getPriorityBadgeClasses(priority?: string | null): string {
    const p = normalize(priority);
    if (p === 'urgent') return 'bg-red-600/15 text-red-600';
    if (p === 'high') return 'bg-red-500/15 text-red-500';
    if (p === 'medium' || p === 'normal') return 'bg-cyan-500/15 text-cyan-500';
    if (p === 'low') return 'bg-muted text-muted-foreground';
    return 'bg-muted text-muted-foreground';
  }

  /** CSS gradient string for the priority segmented control */
  const priorityGradient = 'linear-gradient(to right, var(--lightGrey), var(--cyan), var(--red))';

  /** Priority options for segmented controls and selectors */
  const priorityOptions = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
  ] as const;

  return {
    getStatusOpacity, getStatusAccent, getStatusBadgeClasses, getStatusPillClass, getStatusOpacityClass,
    getStatusColorName,
    getPriorityBadgeClass, getPriorityBadgeClasses, priorityGradient, priorityOptions,
  };
}
