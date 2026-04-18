/**
 * useStatusStyle — Unified status styling for the Clean Gantt design system.
 * Single source of truth for mapping status strings to opacity, accent colors, and badge classes.
 */
export function useStatusStyle() {
  const normalize = (status?: string | null): string =>
    (status || '').toLowerCase().replace(/[\s_-]+/g, '');

  /** Opacity value for bars, cards, and visual weight (Clean Gantt pattern) */
  function getStatusOpacity(status?: string | null): number {
    const s = normalize(status);
    if (['completed', 'done', 'archived', 'paid', 'closed'].includes(s)) return 0.3;
    if (['active', 'inprogress', 'approved', 'open'].includes(s)) return 1;
    if (['scheduled', 'pending', 'processing', 'draft', 'new'].includes(s)) return 0.6;
    return 0.8;
  }

  /** CSS color string for accent indicators (dots, borders, progress bars) */
  function getStatusAccent(status?: string | null): string {
    const s = normalize(status);
    if (['completed', 'done', 'paid', 'approved', 'published'].includes(s)) return 'hsl(var(--success))';
    if (['overdue', 'rejected', 'failed', 'cancelled'].includes(s)) return 'hsl(var(--destructive))';
    if (['active', 'inprogress', 'open'].includes(s)) return 'hsl(160, 60%, 45%)';
    if (['scheduled'].includes(s)) return 'hsl(199, 89%, 48%)';
    if (['pending', 'processing', 'new'].includes(s)) return 'hsl(var(--warning))';
    if (['archived', 'draft', 'closed'].includes(s)) return 'hsl(var(--muted-foreground))';
    return 'hsl(var(--muted-foreground))';
  }

  /** Tailwind classes for inline badge (bg + text) */
  function getStatusBadgeClasses(status?: string | null): string {
    const s = normalize(status);
    if (['completed', 'done', 'paid', 'approved', 'published'].includes(s)) return 'bg-green-500/15 text-green-500';
    if (['overdue', 'rejected', 'failed', 'cancelled'].includes(s)) return 'bg-destructive/15 text-destructive';
    if (['active', 'inprogress', 'open'].includes(s)) return 'bg-teal-500/15 text-teal-500';
    if (['scheduled'].includes(s)) return 'bg-sky-500/15 text-sky-500';
    if (['pending', 'processing', 'new'].includes(s)) return 'bg-amber-500/15 text-amber-500';
    if (['archived', 'draft', 'closed'].includes(s)) return 'bg-muted text-muted-foreground';
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
    if (['completed', 'done', 'paid', 'approved', 'published'].includes(s)) return 'bg-green-500 text-white';
    if (['overdue', 'rejected', 'failed', 'cancelled'].includes(s)) return 'bg-destructive text-white';
    if (['active', 'inprogress', 'open'].includes(s)) return 'bg-teal-500 text-white';
    if (['scheduled'].includes(s)) return 'bg-sky-500 text-white';
    if (['pending', 'processing', 'new'].includes(s)) return 'bg-amber-500 text-white';
    if (['archived', 'draft', 'closed'].includes(s)) return 'bg-muted-foreground text-white';
    return 'bg-muted-foreground text-white';
  }

  // ── Priority styling ──

  /** Tailwind bg class for priority pill badges (white text) */
  function getPriorityBadgeClass(priority?: string | null): string {
    const p = normalize(priority);
    if (p === 'high') return 'bg-[var(--red)]';
    if (p === 'medium') return 'bg-[var(--cyan)]';
    if (p === 'low') return 'bg-[var(--lightGrey)]';
    return 'bg-[var(--lightGrey)]';
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
    getPriorityBadgeClass, priorityGradient, priorityOptions,
  };
}
