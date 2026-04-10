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
    if (['completed', 'done', 'paid', 'approved'].includes(s)) return 'hsl(var(--success))';
    if (['overdue', 'rejected', 'failed', 'cancelled'].includes(s)) return 'hsl(var(--destructive))';
    if (['active', 'inprogress', 'open'].includes(s)) return 'hsl(var(--primary))';
    if (['pending', 'processing', 'scheduled', 'new'].includes(s)) return 'hsl(var(--warning))';
    if (['archived', 'draft', 'closed'].includes(s)) return 'hsl(var(--muted-foreground))';
    return 'hsl(var(--muted-foreground))';
  }

  /** Tailwind classes for inline badge (bg + text) */
  function getStatusBadgeClasses(status?: string | null): string {
    const s = normalize(status);
    if (['completed', 'done', 'paid', 'approved'].includes(s)) return 'bg-emerald-500/15 text-emerald-500';
    if (['overdue', 'rejected', 'failed', 'cancelled'].includes(s)) return 'bg-destructive/15 text-destructive';
    if (['active', 'inprogress', 'open'].includes(s)) return 'bg-primary/15 text-primary';
    if (['pending', 'processing', 'scheduled', 'new'].includes(s)) return 'bg-amber-500/15 text-amber-500';
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

  return { getStatusOpacity, getStatusAccent, getStatusBadgeClasses, getStatusOpacityClass };
}
