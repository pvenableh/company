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
  const SUCCESS = ['completed', 'done', 'paid', 'approved', 'published', 'succeeded', 'confirmed', 'won', 'signed', 'accepted', 'admitted', 'sent', 'resolved', 'completedearly', 'completedlate'];
  const DESTRUCTIVE = ['overdue', 'rejected', 'failed', 'cancelled', 'canceled', 'noshow', 'lost', 'expired', 'revoked', 'bounced', 'error', 'pastdue'];
  const ACTIVE = ['active', 'inprogress', 'open', 'ontrack'];
  const SCHEDULED = ['scheduled', 'submitted'];
  const PENDING = ['pending', 'processing', 'new', 'draft', 'paused', 'publishing', 'todo', 'onhold', 'requirespaymentmethod', 'requiresaction', 'intransit', 'prospect', 'sending', 'invited', 'trialing', 'atrisk'];
  const MUTED = ['archived', 'closed', 'inactive', 'refunded', 'churned', 'unsubscribed'];

  /** Opacity value for bars, cards, and visual weight (Clean Gantt pattern) */
  function getStatusOpacity(status?: string | null): number {
    const s = normalize(status);
    if ([...SUCCESS, ...MUTED].includes(s)) return 0.3;
    if (ACTIVE.includes(s)) return 1;
    if ([...SCHEDULED, ...PENDING].includes(s)) return 0.6;
    return 0.8;
  }

  /** CSS color string for accent indicators (dots, borders, progress bars).
   *  All values resolve through CSS vars set by `applyPaletteToDocument`
   *  so a palette switch re-skins every dot/border/progress bar in place. */
  function getStatusAccent(status?: string | null): string {
    const s = normalize(status);
    if (SUCCESS.includes(s)) return 'hsl(var(--success))';
    if (DESTRUCTIVE.includes(s)) return 'hsl(var(--destructive))';
    if (ACTIVE.includes(s)) return 'hsl(var(--status-active))';
    if (SCHEDULED.includes(s)) return 'hsl(var(--status-scheduled))';
    if (PENDING.includes(s)) return 'hsl(var(--warning))';
    if (MUTED.includes(s)) return 'hsl(var(--muted-foreground))';
    return 'hsl(var(--muted-foreground))';
  }

  /** Tailwind classes for inline badge (bg + text). Semantic tokens
   *  (`bg-success`, `bg-status-active`, …) read from the palette-driven
   *  CSS vars so swapping palettes re-tints all badges. */
  function getStatusBadgeClasses(status?: string | null): string {
    const s = normalize(status);
    if (SUCCESS.includes(s)) return 'bg-success/15 text-success';
    if (DESTRUCTIVE.includes(s)) return 'bg-destructive/15 text-destructive';
    if (ACTIVE.includes(s)) return 'bg-status-active/15 text-status-active';
    if (SCHEDULED.includes(s)) return 'bg-status-scheduled/15 text-status-scheduled';
    if (PENDING.includes(s)) return 'bg-warning/15 text-warning';
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
    if (SUCCESS.includes(s)) return 'bg-success text-white';
    if (DESTRUCTIVE.includes(s)) return 'bg-destructive text-white';
    if (ACTIVE.includes(s)) return 'bg-status-active text-white';
    if (SCHEDULED.includes(s)) return 'bg-status-scheduled text-white';
    if (PENDING.includes(s)) return 'bg-warning text-white';
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
  //
  // Priority routes through palette-driven semantic tokens — no per-palette
  // priority overrides are needed because urgency maps cleanly to existing
  // intents:
  //   urgent   → destructive   (highest-attention, palette's "danger" hue)
  //   high     → warning       (palette's "action needed" hue)
  //   medium   → info          (palette's "scheduled/informational" hue)
  //   low      → muted         (de-emphasised)
  // A palette switch re-skins every priority chip automatically.

  /** Tailwind bg class for priority pill badges (white text) */
  function getPriorityBadgeClass(priority?: string | null): string {
    const p = normalize(priority);
    if (p === 'urgent') return 'bg-destructive';
    if (p === 'high') return 'bg-warning';
    if (p === 'medium' || p === 'normal') return 'bg-info';
    if (p === 'low') return 'bg-muted-foreground/60';
    return 'bg-muted-foreground/60';
  }

  /** Tinted bg + matching text (for subtle priority chips) */
  function getPriorityBadgeClasses(priority?: string | null): string {
    const p = normalize(priority);
    if (p === 'urgent') return 'bg-destructive/15 text-destructive';
    if (p === 'high') return 'bg-warning/15 text-warning';
    if (p === 'medium' || p === 'normal') return 'bg-info/15 text-info';
    if (p === 'low') return 'bg-muted text-muted-foreground';
    return 'bg-muted text-muted-foreground';
  }

  /** Soft card background by priority (very light tint; for AccentCard bodies) */
  function getPriorityBg(priority?: string | null): string {
    const p = normalize(priority);
    if (p === 'urgent') return 'bg-destructive/10';
    if (p === 'high') return 'bg-warning/10';
    if (p === 'medium' || p === 'normal') return 'bg-info/10';
    if (p === 'low') return 'bg-muted/30';
    return 'bg-muted/30';
  }

  /** Solid accent bar color by priority (for AccentCard left-rail, dots, lines) */
  function getPriorityAccent(priority?: string | null): string {
    const p = normalize(priority);
    if (p === 'urgent') return 'bg-destructive';
    if (p === 'high') return 'bg-warning';
    if (p === 'medium' || p === 'normal') return 'bg-info';
    if (p === 'low') return 'bg-muted-foreground/40';
    return 'bg-muted-foreground/40';
  }

  /** Icon text color by priority */
  function getPriorityIconClass(priority?: string | null): string {
    const p = normalize(priority);
    if (p === 'urgent') return 'text-destructive';
    if (p === 'high') return 'text-warning';
    if (p === 'medium' || p === 'normal') return 'text-info';
    if (p === 'low') return 'text-muted-foreground';
    return 'text-muted-foreground';
  }

  /** CSS gradient string for the priority segmented control.
   *  Reads through the same palette-driven CSS vars so the gradient
   *  re-tints on palette switch (low/medium/high → muted/info/destructive). */
  const priorityGradient = 'linear-gradient(to right, hsl(var(--muted-foreground) / 0.4), hsl(var(--info)), hsl(var(--destructive)))';

  /** Priority options for segmented controls and selectors */
  const priorityOptions = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
  ] as const;

  return {
    getStatusOpacity, getStatusAccent, getStatusBadgeClasses, getStatusPillClass, getStatusOpacityClass,
    getStatusColorName,
    getPriorityBadgeClass, getPriorityBadgeClasses,
    getPriorityBg, getPriorityAccent, getPriorityIconClass,
    priorityGradient, priorityOptions,
  };
}
