/**
 * Design templates for the public digital business card (`/c/:id`). Each user
 * picks one (`cd_cards.card_theme`); the chosen id is rendered as a
 * `data-card-theme` attribute on the card root, and all visual styling lives in
 * the scoped CSS of `CardView.vue`, keyed off that attribute.
 *
 * This registry is the single source of truth for the *picker* — the swatch
 * gradients + copy shown in the account editor — so adding a template is a
 * one-line entry here plus a `[data-card-theme="…"]` block in CardView.
 */
export interface CardThemeDef {
  /** Stored value in cd_cards.card_theme + the data-card-theme attribute. */
  id: string
  /** Display name in the picker. */
  label: string
  /** One-line description of the aesthetic. */
  hint: string
  /** CSS background used for the picker swatch (a tiny preview of the vibe). */
  swatch: string
  /** Swatch foreground/ink so the label on the swatch stays legible. */
  swatchInk: string
}

export const CARD_THEMES: CardThemeDef[] = [
  {
    id: 'carddesk',
    label: 'CardDesk',
    hint: 'Signature liquid-glass aurora. The native CardDesk look.',
    swatch:
      'radial-gradient(120% 90% at 0% 0%, #00ff87 0%, transparent 55%), radial-gradient(120% 90% at 100% 100%, #b87dff 0%, transparent 55%), #0b0e16',
    swatchInk: '#eafff5',
  },
  {
    id: 'glass',
    label: 'Glass',
    hint: 'Frosted iOS depth — Bauer Bodoni on a dark ambient colour field.',
    swatch:
      'radial-gradient(80% 70% at 12% 6%, rgba(8,189,189,0.55) 0%, transparent 55%), radial-gradient(80% 70% at 95% 95%, rgba(194,0,251,0.5) 0%, transparent 55%), radial-gradient(70% 60% at 60% 50%, rgba(0,191,255,0.45) 0%, transparent 60%), #0a0b0f',
    swatchInk: '#ffffff',
  },
  {
    id: 'editorial',
    label: 'Editorial',
    hint: 'Print-magazine calm — Bauer Bodoni & bronze on warm paper.',
    swatch: 'linear-gradient(160deg, #faf8f3 0%, #efe6d5 100%)',
    swatchInk: '#2b2620',
  },
  {
    id: 'tech',
    label: 'Tech',
    hint: 'Linear/Vercel-docs light — crisp sans, mono labels, cyan accent.',
    swatch: 'linear-gradient(160deg, #ffffff 0%, #f2f6f8 100%)',
    swatchInk: '#1e99c1',
  },
]

export const CARD_THEME_IDS = CARD_THEMES.map((t) => t.id)

/** Normalise any stored/legacy value to a known theme id (defaults to carddesk). */
export function normalizeCardTheme(v: string | null | undefined): string {
  return v && CARD_THEME_IDS.includes(v) ? v : 'carddesk'
}

export function useCardThemes() {
  return { CARD_THEMES, CARD_THEME_IDS, normalizeCardTheme }
}
