/**
 * palette-tokens — single source of truth for "color prop → palette token"
 * resolution. Used by every leaf UI primitive (UButton, UBadge, UAlert,
 * UProgress, UChip) plus any page-level surface that maps tone-keys to
 * palette-driven classes (meeting status pills, recap state badges, …).
 *
 * Adding a new colour alias is one line here — every consumer picks it
 * up. The output strings are palette-driven Tailwind utilities that
 * resolve through CSS variables emitted by `applyPaletteToDocument` in
 * `useAppAccent.ts`, so a palette switch re-skins every component that
 * routes through this module.
 *
 * NOTE: Whenever you bump `TAG_RAMP_LENGTH` in `useAppAccent.ts`, also
 * extend the `@source inline("…tag-{1,2,3,…}…")` directives in
 * `tailwind.css` so the new slots' utilities land in the compiled CSS.
 */

/**
 * Semantic intent tokens that every palette must define in its
 * `semantics` block. The string value here matches the CSS-var suffix
 * (`--primary`, `--destructive`, etc.) AND the Tailwind utility prefix
 * (`bg-primary`, `text-destructive/15`) — keep them in lockstep with
 * `TOKEN_REGISTRY` in useAppAccent.ts and the `@theme inline` block in
 * tailwind.css.
 */
export type SemanticToken =
	| 'primary'
	| 'destructive'
	| 'success'
	| 'warning'
	| 'info';

/**
 * Colour-prop alias → semantic token.
 *
 * Synonyms collapse to the same intent on purpose — `green` and
 * `emerald` are both "success" because they read identically once the
 * palette tints them. Adding a new alias takes one line.
 *
 * Foundation neutrals (gray/secondary/white) are deliberately absent;
 * they're palette-independent and each leaf component handles them
 * bespoke (some want a foundation grey, some want literal #fff).
 */
export const SEMANTIC_BY_COLOR: Record<string, SemanticToken> = {
	primary: 'primary',
	red: 'destructive',
	destructive: 'destructive',
	green: 'success',
	emerald: 'success',
	amber: 'warning',
	yellow: 'warning',
	orange: 'warning',
	blue: 'info',
	sky: 'info',
	teal: 'info',
};

/**
 * Colour-prop alias → tag-ramp slot (1-indexed). Used when a `color`
 * has no semantic meaning ("purple" doesn't mean *anything* in the app
 * today — it's just a categorical / decorative choice) and the natural
 * home is a slot in the palette's tag ramp.
 *
 * Slot assignment is fixed so consumers stay stable across palettes —
 * `color="purple"` always lands on slot 7, even though slot 7's hue
 * shifts (Sea Mist's Indigo Bloom ↔ Aurora's Cloudy Sky ↔ Neutral's
 * Yale Blue).
 *
 * Slot numbers must stay within `TAG_RAMP_LENGTH` (defined in
 * `useAppAccent.ts`, currently 8).
 */
export const TAG_SLOT_BY_COLOR: Record<string, number> = {
	purple: 7,
	pink: 2,
};

/**
 * Resolve a `color` prop alias to its underlying Tailwind utility
 * prefix:
 *   tokenFor('green')  → 'success'      → `bg-success`, `text-success`, …
 *   tokenFor('purple') → 'tag-7'        → `bg-tag-7`, `text-tag-7`, …
 *   tokenFor('gray')   → null           → caller handles foundation.
 *   tokenFor('xyz')    → null
 *
 * Returns null for foundation neutrals (gray/secondary/white) and
 * unrecognised values — leaf components decide what their bespoke
 * fallback looks like.
 */
export function tokenFor(color: string): string | null {
	const semantic = SEMANTIC_BY_COLOR[color];
	if (semantic) return semantic;
	const slot = TAG_SLOT_BY_COLOR[color];
	if (slot !== undefined) return `tag-${slot}`;
	return null;
}

/**
 * Text-on-solid-fill class for a resolved token.
 *
 * Only `primary` and `destructive` ship `*-foreground` companions —
 * those two intents publish a contrast colour from the palette so dark
 * destructive surfaces stay legible. The other intents (success,
 * warning, info) and tag-ramp slots pair their solid fills with
 * literal white, because the tag ramp's hues vary too widely across
 * palettes to share a single foreground.
 */
export function fgFor(token: string): string {
	return token === 'primary' || token === 'destructive'
		? `text-${token}-foreground`
		: 'text-white';
}

/**
 * Soft tone class for status-style chips (palette-tinted bg + matching
 * text at full opacity). The shape is identical across consumers
 * (meeting status pills, recap state badges, video-call indicator
 * banners, …), so a single lookup keeps them in lockstep.
 *
 * Tone keys are deliberately the legacy Tailwind colour names (emerald,
 * sky, amber, red, gray) so existing page-level state machines that
 * yield `{ tone: 'emerald' }` etc. work unchanged — the mapping
 * just routes them to palette-driven utilities.
 */
export const SOFT_TONE: Record<string, string> = {
	emerald: 'bg-success/10 text-success',
	green: 'bg-success/10 text-success',
	sky: 'bg-info/10 text-info',
	blue: 'bg-info/10 text-info',
	amber: 'bg-warning/10 text-warning',
	yellow: 'bg-warning/10 text-warning',
	red: 'bg-destructive/10 text-destructive',
	destructive: 'bg-destructive/10 text-destructive',
	gray: 'bg-muted/40 text-muted-foreground',
};

/** Look up a soft-tone class with a muted fallback. */
export function softTone(tone: string | null | undefined): string {
	return (tone && SOFT_TONE[tone]) || SOFT_TONE.gray!;
}
