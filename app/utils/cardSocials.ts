/**
 * Single source of truth for the social platforms shown on cards + contacts.
 * Imported in BOTH the Vue app and the Nitro server via `~/types/socials`, so
 * adding a platform is a one-line entry here + one Directus column (same name as
 * `key`) on cd_cards and cd_contacts. Everything else (forms, public page, scan
 * prompt, vCard, contact APIs) iterates over this list.
 */
export interface SocialDef {
  /** DB column / form field name, e.g. 'linkedin'. */
  key: string
  /** Display label, e.g. 'LinkedIn'. */
  label: string
  /** Iconify brand logo (from @iconify-json/logos), e.g. 'logos:linkedin-icon'. */
  icon: string
  /** Monochrome brand glyph (from @iconify-json/simple-icons) that inherits
   *  currentColor — used where the icon should match the theme, not its brand. */
  mono: string
  /** Per-platform call-to-action, e.g. 'Connect with me on LinkedIn'. */
  cta: string
  /** Input placeholder shown in the edit forms. */
  placeholder: string
  /** URL prefix used to turn a bare @handle into a full link. */
  base: string
}

export const SOCIALS: SocialDef[] = [
  { key: 'linkedin',  label: 'LinkedIn',  icon: 'logos:linkedin-icon',  mono: 'simple-icons:linkedin',  cta: 'Connect with me on LinkedIn', placeholder: 'linkedin.com/in/jane or @jane', base: 'https://www.linkedin.com/in/' },
  { key: 'instagram', label: 'Instagram', icon: 'logos:instagram-icon', mono: 'simple-icons:instagram', cta: 'Check us out on Instagram',    placeholder: '@jane or instagram.com/jane',     base: 'https://instagram.com/' },
  { key: 'twitter',   label: 'X',         icon: 'logos:x',              mono: 'simple-icons:x',         cta: 'Follow me on X',               placeholder: '@jane or x.com/jane',             base: 'https://x.com/' },
  { key: 'youtube',   label: 'YouTube',   icon: 'logos:youtube-icon',   mono: 'simple-icons:youtube',   cta: 'Subscribe on YouTube',         placeholder: '@jane or youtube.com/@jane',      base: 'https://youtube.com/@' },
  { key: 'behance',   label: 'Behance',   icon: 'logos:behance',        mono: 'simple-icons:behance',   cta: 'See my work on Behance',       placeholder: 'behance.net/jane or @jane',       base: 'https://www.behance.net/' },
]

export const SOCIAL_KEYS = SOCIALS.map((s) => s.key)

/** Normalise a handle/URL into a full clickable URL for a given platform key. */
export function socialUrl(key: string, value: string | null | undefined): string {
  const t = (value ?? '').trim()
  if (!t) return ''
  if (/^https?:\/\//i.test(t)) return t
  const def = SOCIALS.find((s) => s.key === key)
  return def ? def.base + t.replace(/^@/, '') : t
}
