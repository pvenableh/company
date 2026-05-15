/**
 * useAppAccent — single source of truth for per-app branding (icon + colour).
 *
 * Each top-level app gets a tone with HSL components that propagate through
 * CSS custom properties (`--app-accent-h/s/l`). The layout shell sets those
 * on its root element based on the active route, so the AppRail's active
 * chip, the AppFloorStrip's active pill, and any app-tinted accents in the
 * page chrome all stay in lockstep.
 *
 * Each palette in `APP_PALETTES` carries a flat `sourceColors: HSL[]` list
 * (the full gradient: 10 colours for Sea Mist, 9 for Aurora). Per-app
 * background + icon assignments are *derived*, not hand-mapped — `pickGappy`
 * spreads `APP_ORDER.length + APP_FOOTER_ORDER.length` indices across the
 * source list with a constant `step = (sourceLen - 1) / (count - 1)`, so
 * adjacent chips skip a colour for stronger contrast. Icon picks mirror the
 * bg picks against the opposite end of `iconSourceColors` (defaults to
 * `sourceColors`), so each chip pairs its tile with the contrasting hue
 * from the other end of the palette. Adding a chip just bumps `APP_ORDER`;
 * the spread auto-rebalances.
 *
 * Adding a new app:
 *   1. Add an entry to APP_META keyed by the URL segment.
 *   2. Append to APP_ORDER (or APP_FOOTER_ORDER) — colours derive automatically.
 *   3. Add the rail item to AppRail.vue's APPS list (id matches the key).
 *
 * Adding a new palette:
 *   1. Add `{ meta, sourceColors, iconSourceColors? }` entry to APP_PALETTES.
 *   2. Add the id to APP_PALETTE_IDS + a picker swatch.
 *
 * The "name" field is intentionally the user-facing label so AppRail can
 * read straight from this map rather than maintaining a parallel list.
 */
import type { CSSProperties } from 'vue';
import { useAppPalette } from '~/composables/useAppPalette';

export type AppId =
	| 'dashboard'
	| 'clients'
	| 'work'
	| 'money'
	| 'marketing'
	| 'organization'
	| 'account';

export interface AppAccent {
	id: AppId;
	name: string;
	icon: string;
	to: string;
	/** HSL hue 0-360 */
	h: number;
	/** HSL saturation percent */
	s: number;
	/** HSL lightness percent (mid-tone — UI darkens/lightens around this) */
	l: number;
	/** Notification categories whose unread counts should sum onto a badge
	 * for this rail item. AppRail.vue reads each entry through
	 * `useUnreadByCategory.countFor()` and sums them. Use an array so that
	 * macro nav items (Work = tickets+projects, Money = invoices+contracts+
	 * proposals) and granular ones (portal "Tickets" = just tickets) share
	 * the same shape. */
	notificationCategories?: Array<
		| 'conversations'
		| 'reactions'
		| 'tickets'
		| 'projects'
		| 'invoices'
		| 'contracts'
		| 'proposals'
		| 'meetings'
	>;
	/**
	 * Optional per-app icon colour, sourced from the active palette's
	 * `iconColors` map. When set it overrides the computed contrast
	 * colour from `iconColorForAccent` — e.g. Sea Mist pairs each chip
	 * bg with the *mirror* hue from the opposite end of its source
	 * gradient (Aquamarine bg ↔ Royal Violet glyph).
	 */
	iconHsl?: HSL;
}

/** Palette-independent app metadata. */
type AppMeta = Pick<AppAccent, 'id' | 'name' | 'icon' | 'to' | 'notificationCategories'>;

const APP_META: Record<AppId, AppMeta> = {
	dashboard:    { id: 'dashboard',    name: 'Dashboard',    icon: 'ph:compass-tool-duotone',    to: '/' },
	clients:      { id: 'clients',      name: 'Clients',      icon: 'ph:users-three-duotone',     to: '/apps/clients' },
	work:         { id: 'work',         name: 'Work',         icon: 'lucide:square-kanban',       to: '/apps/work',
		notificationCategories: ['tickets', 'projects'] },
	money:        { id: 'money',        name: 'Money',        icon: 'lucide:trending-up',         to: '/apps/money',
		notificationCategories: ['invoices', 'contracts', 'proposals'] },
	marketing:    { id: 'marketing',    name: 'Marketing',    icon: 'ph:waveform-duotone',        to: '/apps/marketing' },
	organization: { id: 'organization', name: 'Organization', icon: 'ph:tree-structure-duotone',  to: '/apps/organization' },
	account:      { id: 'account',      name: 'Account',      icon: 'lucide:circle-user-round',   to: '/account' },
};

export type HSL = { h: number; s: number; l: number; a?: number };

/**
 * Pick a legible icon colour for a gradient app-icon tile in the given
 * accent. Returns a tone-on-tone accent in the same hue family rather
 * than pure white/black: light tiles get a deep version of their own
 * hue, dark tiles get a soft tinted glow. Reads as a cohesive,
 * intentional iOS-style icon rather than a generic stamp.
 *
 * Hue is biased into perceived lightness (yellow/lime/cyan look brighter
 * than blue at the same L) so the "go deeper or go lighter" branch
 * picks the one that actually contrasts.
 *
 * Used by AppRail (per-chip via styleFor) and by useAppAccent /
 * usePortalAccent (emitted as `--app-accent-icon` for the AppHeader chip).
 */
export function iconColorForAccent(h: number, s: number, l: number): string {
	let perceived = l;
	if (h >= 50 && h <= 90) perceived += 22;       // yellow / lime
	else if (h >= 90 && h <= 160) perceived += 6;  // green
	else if (h >= 160 && h <= 200) perceived += 8; // cyan

	if (perceived > 50) {
		// Light/medium tile → deep accent in the same hue. Cap saturation
		// so the icon reads as a confident dark glyph, not a fluorescent
		// splat against the pastel.
		const iconS = Math.min(75, s);
		const iconL = Math.max(18, l - 48);
		return `hsl(${h} ${iconS}% ${iconL}%)`;
	}
	// Dark tile → soft light accent in the same hue family. Keep
	// saturation low so the muted footer slates produce a clean glow.
	const iconS = Math.min(s, 25);
	const iconL = Math.min(88, l + 58);
	return `hsl(${h} ${iconS}% ${iconL}%)`;
}

/**
 * Sister to `iconColorForAccent` — returns the *bright end* of the icon
 * gradient. The icon overlay fades from this colour at the bottom up
 * toward the base colour at the top, producing a deep-top → bright-bottom
 * gradient inside the SVG glyph that reverses the chip's light-top →
 * dark-bottom background. The opposing ramps push contrast at every
 * vertical position.
 */
export function iconHighlightForAccent(h: number, s: number, l: number): string {
	let perceived = l;
	if (h >= 50 && h <= 90) perceived += 22;
	else if (h >= 90 && h <= 160) perceived += 6;
	else if (h >= 160 && h <= 200) perceived += 8;

	if (perceived > 50) {
		// Light tile, deep base icon → bright same-hue tone for the
		// bottom of the glyph. Sits well below 100% lightness so it
		// stays in the accent family rather than becoming flat white.
		const hiS = Math.min(85, s);
		const hiL = Math.min(72, l + 5);
		return `hsl(${h} ${hiS}% ${hiL}%)`;
	}
	// Dark tile, light base icon → near-white tinted glow at the bottom.
	return `hsl(${h} ${Math.min(s, 15)}% 94%)`;
}

/**
 * pickGappy — spread `count` indices across a `sourceLen`-long list with
 * `step = (sourceLen - 1) / (count - 1)`. Adjacent picks skip 1+ source
 * entries when `count < sourceLen`, so adjacent chips read as visually
 * distinct rather than near-duplicates from a contiguous slice.
 *
 * For a 10-colour source + 7 chips → indices `[0, 2, 3, 5, 6, 8, 9]`.
 *
 * Degenerate cases:
 *   count <= 1            → `[0]`
 *   count >= sourceLen    → 0..sourceLen-1 then clamp (uses every colour)
 *
 * The same helper drives both the bg picks and the *mirror* icon picks
 * — the icon list reverses the spread so chip[i]'s icon comes from the
 * opposite end of the (icon-)source array.
 */
export function pickGappy(sourceLen: number, count: number): number[] {
	if (count <= 1) return [0];
	if (count >= sourceLen) {
		return Array.from({ length: count }, (_, i) => Math.min(i, sourceLen - 1));
	}
	const step = (sourceLen - 1) / (count - 1);
	return Array.from({ length: count }, (_, i) => Math.round(i * step));
}

/**
 * Semantic theme tokens — published to `<html>` as CSS vars so the entire
 * app re-skins when the palette changes. Every Tailwind utility that reads
 * `--primary`, `--destructive`, `--success`, `--warning`, plus the
 * status-specific `--status-active` / `--status-scheduled` vars consumed by
 * `useStatusStyle`, pick these up automatically — buttons, badges, pills,
 * delete confirmations, focus rings, the lot.
 *
 * Optional `*Foreground` keys override the text-on-fill colour; omitted
 * defaults to white (works for every solid swatch we ship).
 */
interface PaletteSemantics {
	primary: HSL;
	primaryForeground?: HSL;
	destructive: HSL;
	destructiveForeground?: HSL;
	success: HSL;
	warning: HSL;
	/** Maps to `--status-scheduled` — scheduled/info badges, link blue. */
	info: HSL;
	/** Maps to `--status-active` — in-progress/active badges, live dot. */
	active: HSL;
}

/**
 * Chip chrome — controls how AppRail renders the per-app chips.
 *
 *   palette  — default: each chip uses its per-app accent gradient.
 *   neutral  — every chip uses a uniform frosted/grey surface; icons all
 *              use `chipAccent`. Lets a palette opt out of rainbow chips
 *              while still driving buttons/status with a single accent.
 */
interface PaletteChrome {
	chipMode: 'palette' | 'neutral';
	/** Icon colour used by every chip when `chipMode === 'neutral'`. */
	chipAccent?: HSL;
}

/** Palette definition — flat source list + optional separate icon source. */
interface PaletteDef {
	meta: { label: string; hint: string };
	/** Full gradient walked by `pickGappy` for chip backgrounds. */
	sourceColors: readonly HSL[];
	/**
	 * Optional alternative source for icon picks. Defaults to
	 * `sourceColors` — i.e. icons mirror the bg picks across the same
	 * list. Override when the natural mirror produces low-contrast pairs
	 * in the middle of the gradient (e.g. Sea Mist + Aurora cross-pollinate).
	 */
	iconSourceColors?: readonly HSL[];
	/**
	 * The strategy `resolveIconHsl` runs to derive each chip's icon
	 * colour. Required in practice — every shipping palette declares
	 * one — but typed optional so a palette author can fall back to
	 * `cross-mirror` while prototyping.
	 */
	iconStrategy?: IconStrategyId;
	/**
	 * Per-chip-index icon overrides applied *after* the strategy
	 * resolver. Keyed by `CHIP_IDS` index (0 = dashboard, 1 = clients,
	 * …, 6 = account). Use when one or two specific chips need a
	 * hand-picked icon colour the algorithmic pick can't produce.
	 */
	iconOverrides?: Partial<Record<number, HSL>>;
	/**
	 * Force every chip's icon to the same colour, regardless of strategy
	 * or overrides. Used by Neutral so every grey chip wears the same
	 * cyan glyph — chrome reads as "one system" instead of "rainbow".
	 */
	uniformIcon?: HSL;
	/** Semantic colour tokens that drive buttons, badges, status, etc. */
	semantics: PaletteSemantics;
	/** Optional chip chrome override. Defaults to `{ chipMode: 'palette' }`. */
	chrome?: PaletteChrome;
	/**
	 * Categorical / decorative ramp emitted as `--tag-1`…`--tag-N`. Consumers
	 * that need N distinguishable colours with no semantic meaning (lead
	 * stages, contact tags, host stripes, chart series, decorative badges)
	 * read from `var(--tag-N)` so identity (slot assignment) is preserved
	 * across palettes while hues re-skin. Auto-derived from `sourceColors`
	 * via `pickGappy(sourceColors.length, TAG_RAMP_LENGTH)` if omitted —
	 * provide an override only when the curated spread reads better than
	 * the algorithmic one.
	 */
	tagRamp?: readonly HSL[];
}

/**
 * Number of slots in the categorical tag ramp emitted as `--tag-1`…`--tag-N`.
 * Eight reads as the sweet spot: enough room for the typical 5-7 lead
 * stages / category tags with one or two spares, and a `hash % 8` host
 * stripe distribution stays visually distinct across a busy day.
 *
 * Bumping this value requires four coordinated edits:
 *   1. this constant
 *   2. `--color-tag-N` entries in `@theme inline` in tailwind.css
 *   3. `--tag-N` SSR defaults in `:root` in themes.css
 *   4. `tag-{1,…,N}` patterns in the `@source inline(…)` safelist
 *      in tailwind.css
 *
 * `TAG_SLOT_BY_COLOR` in `app/utils/palette-tokens.ts` may also need
 * new entries if a colour-prop alias should land on a new slot.
 */
export const TAG_RAMP_LENGTH = 8;

// ─── Source palettes ──────────────────────────────────────────────────────
// Each list is the *full* gradient. The chip count (7 today) drops indices
// from it via `pickGappy`. If a future chip joins the rail, the spread
// re-balances automatically — no hand-editing here.

/** Sea Mist — Aquamarine → Royal Violet (10 colours, light → deep). */
const SEA_MIST_SOURCE: readonly HSL[] = [
	{ h: 163, s: 100, l: 75 }, // 0 Aquamarine   #80ffdb
	{ h: 171, s: 80,  l: 69 }, // 1 Turquoise    #72efdd
	{ h: 180, s: 66,  l: 63 }, // 2 Pearl Aqua   #64dfdf
	{ h: 188, s: 70,  l: 61 }, // 3 Strong Cyan  #56cfe1
	{ h: 194, s: 73,  l: 59 }, // 4 Sky Surge    #48bfe3
	{ h: 202, s: 69,  l: 59 }, // 5 Fresh Sky    #4ea8de
	{ h: 213, s: 64,  l: 59 }, // 6 Blue Energy  #5390d9
	{ h: 239, s: 53,  l: 59 }, // 7 Slate Indigo #5e60ce
	{ h: 261, s: 60,  l: 48 }, // 8 Indigo Bloom #6930c3
	{ h: 278, s: 100, l: 36 }, // 9 Royal Violet #7400b8
] as const;

/** Aurora — Neon Pink → Sky Aqua (9 colours, warm → cool). */
const AURORA_SOURCE: readonly HSL[] = [
	{ h: 333, s: 93, l: 56 }, // 0 Neon Pink         #f72585
	{ h: 309, s: 77, l: 40 }, // 1 Raspberry Plum    #b5179e
	{ h: 292, s: 84, l: 39 }, // 2 Magenta Iris (filler)
	{ h: 276, s: 91, l: 38 }, // 3 Indigo Bloom      #7209b7
	{ h: 268, s: 88, l: 36 }, // 4 Ultrasonic Blue   #560bad
	{ h: 230, s: 83, l: 60 }, // 5 Electric Sapphire #4361ee
	{ h: 221, s: 84, l: 60 }, // 6 Royal Blue (filler)
	{ h: 212, s: 84, l: 61 }, // 7 Cloudy Sky        #4895ef
	{ h: 194, s: 85, l: 62 }, // 8 Sky Aqua          #4cc9f0
] as const;

/**
 * Neutral — Sky Aqua → Yale Blue (10 colours, bright cyan → deep navy).
 * Chrome (`chipMode: 'neutral'` below) renders chips as frosted-glass
 * discs, so these colours don't drive the chip *background* — they
 * drive the chip *icon* via `iconStrategy: 'identity'` (icon = bg).
 * pickGappy spreads 7 chips across the 10-step ramp at indices
 * `[0, 2, 3, 5, 6, 8, 9]`, so the first chip always wears Sky Aqua
 * and the last always wears Yale Blue 2; the middle chips slot in
 * between. Adding chips re-balances the spread automatically.
 */
const NEUTRAL_SOURCE: readonly HSL[] = [
	{ h: 196, s: 100, l: 50 }, // 0 Sky Aqua     #00cfff
	{ h: 192, s: 97,  l: 47 }, // 1 Sky Surge    #04bfee
	{ h: 193, s: 92,  l: 45 }, // 2 Sky Surge 2  #09b0dd
	{ h: 193, s: 88,  l: 43 }, // 3 Blue Green   #0da0cc
	{ h: 195, s: 83,  l: 40 }, // 4 Bondi Blue   #1191bb
	{ h: 196, s: 77,  l: 38 }, // 5 Cerulean     #1681aa
	{ h: 200, s: 71,  l: 35 }, // 6 Cerulean 2   #1a7299
	{ h: 206, s: 64,  l: 33 }, // 7 Baltic Blue  #1e6288
	{ h: 214, s: 55,  l: 30 }, // 8 Yale Blue    #235377
	{ h: 220, s: 45,  l: 28 }, // 9 Yale Blue 2  #274366
] as const;

/**
 * Palette registry — flat source-list definitions. Per-app HSL maps are
 * derived on the fly via `pickGappy` (see `getAppAccents`).
 *
 * To add a new palette: add one entry below with `{ meta, sourceColors }`.
 * The picker, type alias, and resolver all key off this map.
 *
 *   meta.label        — picker chip label
 *   meta.hint         — one-line description shown under the swatch row
 *   sourceColors      — flat HSL[] (8–10 colours read best)
 *   iconSourceColors  — optional alternative source for icon picks
 *                       (defaults to the bg list, mirrored)
 *
 * Each palette's icon source is set to *the other* palette's bg list, so
 * Sea Mist's cool aquas get warm pink/violet icons, and Aurora's warm
 * magentas get cool aqua icons. The mirror direction still applies, so
 * the lightest chip pairs with the deepest icon and vice versa — bigger
 * contrast than a same-list mirror, which converges in the middle.
 *
 * @see useAppPalette.ts — picks the active palette per user.
 */
export const APP_PALETTES = {
	seaMist: {
		// Id stays `seaMist` so existing `directus_users.app_palette` values
		// keep resolving without a migration; only the user-facing label
		// flips to "Fresh".
		meta: { label: 'Fresh', hint: 'Aquamarine through bright sky blue' },
		sourceColors: SEA_MIST_SOURCE,
		// `same-mirror` keeps every icon inside Sea Mist's own hue family
		// (palette-cohesive look). The strategy's middle-3 fallback makes
		// the dead-middle chip white-tinted + flanks lighter-tonal; the
		// override below swaps marketing's lighter-tonal blue for a
		// darker violet so the cool half of the rail still has a deep
		// punctuation chip before the indigo footer chips arrive.
		iconStrategy: 'same-mirror',
		iconOverrides: {
			4: { h: 278, s: 100, l: 36 }, // marketing → Royal Violet #7400b8
		},
		// Primary lifts Blue Energy (#5390d9) from the palette — confident
		// button blue that still belongs to Sea Mist. Destructive rolls a
		// rose red that pairs with aquas (warmer than pure crimson).
		// Active/info stay in the cyan family so status pills feel like
		// extensions of the rail.
		semantics: {
			primary: { h: 213, s: 64, l: 52 },        // Blue Energy, slightly deepened
			primaryForeground: { h: 0, s: 0, l: 100 },
			destructive: { h: 346, s: 78, l: 54 },    // rose
			success: { h: 160, s: 62, l: 42 },        // sea-green
			warning: { h: 38, s: 92, l: 50 },
			info: { h: 202, s: 75, l: 54 },           // Fresh Sky
			active: { h: 188, s: 70, l: 48 },         // Strong Cyan
		},
	},
	aurora: {
		meta: { label: 'Aurora', hint: 'Neon pink → ultrasonic blue → sky aqua' },
		sourceColors: AURORA_SOURCE,
		// Cross-pollinate icons with Sea Mist — every warm/electric chip
		// pairs with a cool aqua glyph for maximum legibility.
		iconSourceColors: SEA_MIST_SOURCE,
		// Aurora has a hand-tuned look: cross-mirror baseline, then the
		// first two chips swap to the lightest aquas in Sea Mist's source
		// so the warm pink/raspberry bgs get a bright pastel pop instead
		// of cross-mirror's natural deep-violet pairing.
		iconStrategy: 'cross-mirror',
		iconOverrides: {
			0: { h: 163, s: 100, l: 75 }, // Aquamarine  #80ffdb
			1: { h: 180, s: 66,  l: 63 }, // Pearl Aqua  #64dfdf
		},
		// Electric Sapphire (#4361ee) is the deepest "still a button"
		// colour in the source — neon pink is too brand-heavy for primary
		// CTAs. Destructive picks a true crimson so it stays distinct
		// from Aurora's hot pink/magenta family.
		semantics: {
			primary: { h: 230, s: 83, l: 55 },        // Electric Sapphire
			primaryForeground: { h: 0, s: 0, l: 100 },
			destructive: { h: 0, s: 78, l: 56 },      // crimson — distinct from neon pink
			success: { h: 160, s: 65, l: 42 },
			warning: { h: 38, s: 92, l: 50 },
			info: { h: 194, s: 85, l: 56 },           // Sky Aqua, deepened
			active: { h: 212, s: 84, l: 55 },         // Cloudy Sky
		},
	},
	neutral: {
		meta: { label: 'Neutral', hint: 'Frosted glass with sky → yale-blue chromatic icons' },
		sourceColors: NEUTRAL_SOURCE,
		// `identity` makes each chip's icon = its bg pick — so the icons
		// wear the full chromatic ramp (Sky Aqua → Yale Blue 2) against
		// frosted-glass discs. First + last chips always anchor the ramp
		// (pickGappy locks index 0 + last); middle chips spread between.
		iconStrategy: 'identity',
		chrome: { chipMode: 'neutral', chipAccent: { h: 196, s: 100, l: 50 } },
		// Sky Aqua primary so SVGs + CTAs share the brightest accent. All
		// other status tokens stay stock so meeting greens, destructive
		// reds, etc. don't shift in the calm Neutral palette.
		semantics: {
			primary: { h: 196, s: 100, l: 50 },       // Sky Aqua — top of ramp
			primaryForeground: { h: 0, s: 0, l: 100 },
			destructive: { h: 0, s: 72, l: 51 },
			success: { h: 142, s: 72, l: 46 },
			warning: { h: 38, s: 92, l: 50 },
			info: { h: 199, s: 89, l: 48 },
			active: { h: 160, s: 60, l: 45 },
		},
	},
} as const satisfies Record<string, PaletteDef>;

/** Palette id derived from the registry — adding a new palette doesn't
 *  require updating this type. */
export type AppPaletteId = keyof typeof APP_PALETTES;

/**
 * Picker-visible palettes. The remaining entries (default, oceanic,
 * gradientBlues) stay in `APP_PALETTES` for future revival but are
 * hidden from the picker and aliased to `seaMist` on resolve.
 */
export const APP_PALETTE_IDS: readonly AppPaletteId[] = ['seaMist', 'aurora', 'neutral'];

/**
 * Legacy palette aliases. When a stored `directus_users.app_palette`
 * value points to a renamed (or now-hidden) palette, map it here. Read
 * paths consult this before deciding whether to fall back, so users on
 * the old id migrate cleanly to the active palette.
 */
export const APP_PALETTE_ALIASES: Record<string, AppPaletteId> = {
	royal: 'seaMist',
	default: 'seaMist',
	oceanic: 'seaMist',
	gradientBlues: 'seaMist',
};

export function resolvePaletteId(raw: unknown): AppPaletteId {
	if (typeof raw !== 'string') return 'seaMist';
	if (APP_PALETTE_ALIASES[raw]) return APP_PALETTE_ALIASES[raw]!;
	return (APP_PALETTE_IDS as readonly string[]).includes(raw) ? (raw as AppPaletteId) : 'seaMist';
}

export const APP_ORDER: AppId[] = ['dashboard', 'clients', 'work', 'money', 'marketing'];
export const APP_FOOTER_ORDER: AppId[] = ['organization', 'account'];
/**
 * Main + footer apps concatenated in visual order — this is the index
 * order pickGappy maps source-list positions onto. Keep
 * `APP_ORDER` first so the brightest end of `sourceColors` lands on the
 * dashboard chip.
 */
const CHIP_IDS: readonly AppId[] = [...APP_ORDER, ...APP_FOOTER_ORDER];

/**
 * Icon-strategy axis — each palette declares the strategy that produces
 * its hand-tuned look (see `iconStrategy` on PaletteDef). Strategies:
 *
 *   cross-mirror — icon from `iconSourceColors` (defaults to the *other*
 *                  palette's source), mirrored against the bg picks.
 *                  Max-contrast — cool aqua bgs get warm pink/violet
 *                  glyphs and vice versa. Aurora ships locked here.
 *
 *   same-mirror  — icon from the *same* palette's `sourceColors`, picked
 *                  from the opposite end of the spread. Cohesive (icons
 *                  stay in the palette's hue family); middle chips would
 *                  converge so the resolver inserts a palette-tinted
 *                  white for the dead-middle chip and tonally-lifted
 *                  same-hue icons for its neighbours. Sea Mist ships
 *                  locked here.
 *
 *   tonal        — icon is the same hue as the bg, just deeper (on light
 *                  tiles) or lighter (on dark tiles). Most monochromatic
 *                  — reads as a single-family iOS-icon set.
 *
 *   triadic      — icon hue rotates 120° from bg, at a high-contrast
 *                  lightness. Consistent designed-system feel; every
 *                  chip uses the same offset rule.
 *
 * Strategy used to be a runtime user preference; the picker has been
 * retired and the locked-per-palette config drives everything now.
 * Tonal + triadic remain available for palette authors who want them.
 */
export const ICON_STRATEGIES = ['cross-mirror', 'same-mirror', 'tonal', 'triadic', 'identity'] as const;
export type IconStrategyId = (typeof ICON_STRATEGIES)[number];

/**
 * Resolve a single chip's icon HSL under the active strategy. Pure —
 * no side effects, no closures over module state beyond the strategy.
 *
 * `chipIndex` + `chipCount` only matter for the *-mirror strategies
 * (they re-run pickGappy on the icon source); tonal + triadic ignore
 * them and derive purely from `bg`.
 */
function resolveIconHsl(
	strategy: IconStrategyId,
	palette: { sourceColors: readonly HSL[]; iconSourceColors?: readonly HSL[] },
	bg: HSL,
	chipIndex: number,
	chipCount: number,
): HSL {
	if (strategy === 'identity') {
		// Icon = bg pick. Used by palettes that render chips on a
		// neutral/frosted surface (Neutral, and any palette when the
		// global Glass toggle is on) — the chip itself isn't coloured,
		// the glyph carries the full palette hue.
		return bg;
	}
	if (strategy === 'cross-mirror') {
		const src = palette.iconSourceColors ?? palette.sourceColors;
		const picks = pickGappy(src.length, chipCount).slice().reverse();
		return src[picks[chipIndex]!]!;
	}
	if (strategy === 'same-mirror') {
		const src = palette.sourceColors;
		const bgPicks = pickGappy(src.length, chipCount);
		const iconPicks = bgPicks.slice().reverse();
		const myBg = bgPicks[chipIndex]!;
		const myIcon = iconPicks[chipIndex]!;
		const diff = Math.abs(myBg - myIcon);
		// Dead-middle chip (bg pick == its own mirror) — palette-tinted
		// white. A whisper of the chip's own hue (low saturation) plus
		// 88% alpha lets the bg gradient bleed through subtly, so the
		// icon reads as "of the palette" rather than a clinical pure
		// white stamp. Still bright enough to be the visual pivot.
		if (diff === 0) {
			return { h: bg.h, s: 12, l: 97, a: 0.88 };
		}
		// Near-middle chips — keep them in the chip's own hue family
		// rather than substituting in a single bright accent, so the
		// glyph reads as "lighter sibling of the bg" instead of an
		// alien colour. Hue tracks bg, saturation drops a bit, lightness
		// pushed near-white.
		if (diff <= src.length / 2) {
			return {
				h: bg.h,
				s: Math.max(40, bg.s - 20),
				l: Math.min(92, Math.max(78, bg.l + 24)),
			};
		}
		// Outer chips — the natural mirror across the palette gives
		// plenty of hue distance, so use it as-is.
		return src[myIcon]!;
	}
	if (strategy === 'tonal') {
		// Perceived-lightness contrast: same hue family, swing to the
		// other end of the lightness scale. Mirrors `iconColorForAccent`'s
		// internal math but returns an HSL instead of a CSS string.
		let perceived = bg.l;
		if (bg.h >= 50 && bg.h <= 90) perceived += 22;
		else if (bg.h >= 90 && bg.h <= 160) perceived += 6;
		else if (bg.h >= 160 && bg.h <= 200) perceived += 8;
		if (perceived > 50) {
			return { h: bg.h, s: Math.min(75, bg.s), l: Math.max(18, bg.l - 48) };
		}
		return { h: bg.h, s: Math.min(bg.s, 25), l: Math.min(88, bg.l + 58) };
	}
	// triadic — 120° hue rotation, contrast lightness.
	const iconH = (bg.h + 120) % 360;
	const iconS = Math.min(90, Math.max(55, bg.s));
	const iconL = bg.l > 55 ? Math.max(24, bg.l - 36) : Math.min(82, bg.l + 28);
	return { h: iconH, s: iconS, l: iconL };
}

/**
 * Resolve per-app accents for the active palette + icon strategy.
 * Spreads `CHIP_IDS.length` picks across `palette.sourceColors` for bg,
 * then runs `resolveIconHsl` per chip to pick the icon under the chosen
 * strategy.
 */
export function getAppAccents(paletteId: AppPaletteId): Record<AppId, AppAccent> {
	const palette = APP_PALETTES[paletteId] ?? APP_PALETTES.seaMist;
	const bgPicks = pickGappy(palette.sourceColors.length, CHIP_IDS.length);
	const strategy: IconStrategyId = palette.iconStrategy ?? 'cross-mirror';
	const out = {} as Record<AppId, AppAccent>;
	CHIP_IDS.forEach((id, i) => {
		const bg = palette.sourceColors[bgPicks[i]!]!;
		// `uniformIcon` (Neutral) wins outright; otherwise per-chip override
		// beats the strategy resolver.
		const override = palette.iconOverrides?.[i];
		const icon = palette.uniformIcon
			?? override
			?? resolveIconHsl(strategy, palette, bg, i, CHIP_IDS.length);
		out[id] = { ...APP_META[id], ...bg, iconHsl: icon };
	});
	return out;
}

/**
 * Read the active palette's chrome config — used by AppRail to switch
 * between gradient chips (`palette`) and frosted-grey chips (`neutral`).
 * Exported so any consumer can know what mode is active without re-importing
 * the registry shape.
 */
export function getPaletteChrome(paletteId: AppPaletteId): PaletteChrome {
	const palette = APP_PALETTES[paletteId] ?? APP_PALETTES.seaMist;
	return palette.chrome ?? { chipMode: 'palette' };
}

/** Format an HSL tuple as the `H S% L%` string expected by the `--primary`
 *  / `--destructive` style CSS vars (no `hsl()` wrapper — Tailwind's
 *  `@theme inline` block already wraps these). */
function hslToVarString(c: HSL): string {
	return `${c.h} ${c.s}% ${c.l}%`;
}

const WHITE: HSL = { h: 0, s: 0, l: 100 };

/**
 * Single source of truth for CSS-var → palette-field mapping. Every
 * semantic token the app exposes is registered here exactly once;
 * `applyPaletteToDocument` loops over the registry and writes each var
 * to `<html>` from the active palette.
 *
 * Adding a new semantic token:
 *   1. Add an entry below (one line: var name → resolver).
 *   2. Add a matching `--color-<token>: hsl(var(--<token>))` line to the
 *      `@theme inline` block in tailwind.css so it works as a Tailwind
 *      utility (`bg-<token>`, `text-<token>`).
 *   3. Add an SSR default to `:root` in themes.css.
 *   4. (Optional) Add an explicit field to `PaletteSemantics` if every
 *      palette must provide its own; otherwise resolve through an
 *      existing semantic (alias).
 *
 * The categorical `--tag-N` ramp is emitted separately in
 * `applyPaletteToDocument` because its var-count is data-driven
 * (`TAG_RAMP_LENGTH`) rather than statically named.
 */
type TokenResolver = (s: PaletteSemantics) => HSL;
const TOKEN_REGISTRY: Record<string, TokenResolver> = {
	'--primary':                s => s.primary,
	'--primary-foreground':     s => s.primaryForeground ?? WHITE,
	'--destructive':            s => s.destructive,
	'--destructive-foreground': s => s.destructiveForeground ?? WHITE,
	'--success':                s => s.success,
	'--warning':                s => s.warning,
	'--info':                   s => s.info,
	'--status-active':          s => s.active,
	'--status-scheduled':       s => s.info,
	// Ring tracks primary so focus outlines stay in palette family.
	'--ring':                   s => s.primary,
};

/**
 * Resolve the active palette's categorical tag ramp. Returns the curated
 * `tagRamp` when the palette ships one; otherwise spreads
 * `TAG_RAMP_LENGTH` indices across `sourceColors` via `pickGappy` for
 * visually distinct slots that stay in-family with the palette's hue
 * range.
 *
 * Same identity contract as the rail's bg picks: pickGappy's spread is
 * deterministic per source length, so a given palette always yields the
 * same ramp on every render — slot N keeps its meaning across page loads.
 */
export function getTagRamp(paletteId: AppPaletteId): readonly HSL[] {
	const palette = APP_PALETTES[paletteId] ?? APP_PALETTES.seaMist;
	if (palette.tagRamp) return palette.tagRamp;
	const picks = pickGappy(palette.sourceColors.length, TAG_RAMP_LENGTH);
	return picks.map((i) => palette.sourceColors[i]!);
}

/**
 * Push the active palette's semantic tokens to `<html>` as CSS custom
 * properties. Overrides `--primary`, `--destructive`, `--success`,
 * `--warning`, plus the status-specific `--status-active` /
 * `--status-scheduled` / `--info` that `useStatusStyle` consumes — so
 * every Tailwind utility that reads these vars (bg-primary,
 * text-destructive, the focus ring, status badges, …) re-skins on
 * palette switch with no per-component plumbing.
 *
 * The chrome.chipMode is also published as the `data-chip-mode` attribute
 * so AppRail's CSS can branch between gradient chips (palette) and
 * frosted-grey chips (neutral).
 *
 * Idempotent + client-only — server-rendered markup picks up the *default*
 * palette values from `themes.css`, then this function fires on hydration
 * to apply the user's choice.
 */
export function applyPaletteToDocument(paletteId: AppPaletteId): void {
	if (typeof document === 'undefined') return;
	const palette = APP_PALETTES[paletteId] ?? APP_PALETTES.seaMist;
	const root = document.documentElement;
	const set = (prop: string, value: string) => root.style.setProperty(prop, value);

	// 1. Semantic tokens — single loop over the registry. Adding a new
	//    token means one entry in TOKEN_REGISTRY + one @theme inline line.
	for (const [varName, resolve] of Object.entries(TOKEN_REGISTRY)) {
		set(varName, hslToVarString(resolve(palette.semantics)));
	}

	// 2. Categorical tag ramp — emitted as `--tag-1`…`--tag-N`. Slot
	//    assignments stay stable per consumer (lead stages, host stripes,
	//    etc.) so identity is preserved when palette switches.
	const ramp = getTagRamp(paletteId);
	ramp.forEach((c, i) => set(`--tag-${i + 1}`, hslToVarString(c)));

	// 3. Chrome attribute drives AppRail's chip-mode CSS branch.
	const chrome = palette.chrome ?? { chipMode: 'palette' };
	root.setAttribute('data-chip-mode', chrome.chipMode);
	if (chrome.chipAccent) {
		const a = chrome.chipAccent;
		root.style.setProperty('--chip-accent', `hsl(${a.h} ${a.s}% ${a.l}%)`);
	} else {
		root.style.removeProperty('--chip-accent');
	}
}

/**
 * Format an `AppAccent`'s icon colour for use in CSS. Prefers the
 * palette-supplied `iconHsl` when present (per-app override); otherwise
 * falls back to the perceived-lightness contrast colour.
 */
export function formatIconColor(a: Pick<AppAccent, 'h' | 's' | 'l' | 'iconHsl'>): string {
	if (a.iconHsl) {
		const { h, s, l, a: alpha } = a.iconHsl;
		return alpha !== undefined && alpha < 1
			? `hsla(${h} ${s}% ${l}% / ${alpha})`
			: `hsl(${h} ${s}% ${l}%)`;
	}
	return iconColorForAccent(a.h, a.s, a.l);
}

/**
 * @deprecated Use `getAppAccents(paletteId)` from a composable scope. Kept
 * as a static export for any direct importer that doesn't have access to
 * the user's palette preference — returns the default palette.
 */
export const APP_ACCENTS: Record<AppId, AppAccent> = getAppAccents('seaMist');

/**
 * Path → owning-app mapping for routes that live outside `/apps/*` but still
 * belong to a Work-app surface (meeting room, meeting recap, scheduler
 * settings, project detail, ticket detail, …). Keeps the AppRail's active
 * chip and the apps-shell accent in lockstep with the user's mental model:
 * "I'm still in Work even though the URL doesn't say `/apps/work`."
 *
 * AppRail.vue + useAppAccent both consult this — keep them in sync via the
 * helper, never re-derive the prefix list in components.
 */
export function appIdForPath(path: string): AppId | null {
	if (path.startsWith('/account')) return 'account';
	if (path === '/' || path === '/apps' || path === '/apps/') return 'dashboard';

	const seg = path.split('/').filter(Boolean);
	if (seg.length === 0) return null;

	// /apps/<id>/... → canonical app routes.
	if (seg[0] === 'apps') {
		const id = seg[1] as AppId | undefined;
		return id && id in APP_META ? id : null;
	}

	// Classic-named routes that semantically belong to an app. Drill-downs
	// (e.g. /meetings/[id]) reach these from the apps-layout floors, so the
	// rail should stay anchored to the originating app.
	const WORK_PREFIXES = ['meetings', 'meeting', 'scheduler', 'projects', 'tickets', 'tasks'];
	if (WORK_PREFIXES.includes(seg[0]!)) return 'work';

	const MONEY_PREFIXES = ['invoices', 'contracts', 'proposals', 'expenses'];
	if (MONEY_PREFIXES.includes(seg[0]!)) return 'money';

	const CLIENT_PREFIXES = ['clients', 'contacts', 'leads'];
	if (CLIENT_PREFIXES.includes(seg[0]!)) return 'clients';

	if (seg[0] === 'marketing' || seg[0] === 'social') return 'marketing';
	if (seg[0] === 'organization' || seg[0] === 'team') return 'organization';

	return null;
}

export function useAppAccent() {
	const route = useRoute();
	const { palette, glassChrome } = useAppPalette();

	const accents = computed<Record<AppId, AppAccent>>(() => {
		const base = getAppAccents(palette.value);
		if (!glassChrome.value) return base;
		// Glass mode: override every chip's icon to its own bg colour so
		// the rail wears the palette's full chromatic ramp on frosted
		// discs. First + last bg picks anchor the ramp (locked by
		// pickGappy); middle chips slot between them. Works across every
		// palette — Sea Mist's aqua→violet, Aurora's pink→sky, Neutral's
		// sky→navy — without per-palette wiring.
		const out = {} as Record<AppId, AppAccent>;
		for (const id of CHIP_IDS) {
			const a = base[id]!;
			out[id] = { ...a, iconHsl: { h: a.h, s: a.s, l: a.l } };
		}
		return out;
	});

	const activeAppId = computed<AppId | null>(() => appIdForPath(route.path));

	const accent = computed<AppAccent | null>(() =>
		activeAppId.value ? accents.value[activeAppId.value] : null,
	);

	/**
	 * CSS custom properties suitable for binding to `:style`. Falls back to
	 * neutral muted-foreground values when no app is active so anything
	 * inheriting these vars still renders without conditionals.
	 */
	const accentStyle = computed<CSSProperties>(() => {
		const a = accent.value;
		if (!a) {
			return {
				'--app-accent-h': '220',
				'--app-accent-s': '10%',
				'--app-accent-l': '48%',
				'--app-accent-icon': 'hsl(0 0% 100%)',
				'--app-accent-icon-bright': 'hsl(0 0% 100%)',
			} as CSSProperties;
		}
		return {
			'--app-accent-h': String(a.h),
			'--app-accent-s': `${a.s}%`,
			'--app-accent-l': `${a.l}%`,
			'--app-accent-icon': formatIconColor(a),
			'--app-accent-icon-bright': iconHighlightForAccent(a.h, a.s, a.l),
		} as CSSProperties;
	});

	return { activeAppId, accent, accents, accentStyle };
}

/**
 * Shape returned by `useCurrentAccent` — narrowed to the fields shared
 * components (AppHeader, AppSlideOver) actually consume. Both
 * `useAppAccent` and `usePortalAccent` satisfy this shape; the union
 * lets a single component render in either shell.
 */
export interface CurrentAccent {
	id: string;
	name: string;
	icon: string;
	h: number;
	s: number;
	l: number;
}

/**
 * useCurrentAccent — dispatcher used by shared chrome components.
 *
 *   /apps/*   → useAppAccent (Clients/Work/Money/Marketing/Org/Account)
 *   /portal/* → usePortalAccent (Dashboard/Projects/Tasks/Tickets/…)
 *
 * Returning a unified shape means `AppHeader` and `AppSlideOver` can be
 * used as-is in the client portal — visually identical to the main app
 * because they render through the same component.
 */
export function useCurrentAccent() {
	const route = useRoute();

	const isPortal = computed(() => route.path.startsWith('/portal'));

	const portalAccent = usePortalAccent();
	const appAccent = useAppAccent();

	const accent = computed<CurrentAccent | null>(() => {
		const a = isPortal.value ? portalAccent.accent.value : appAccent.accent.value;
		if (!a) return null;
		return {
			id: String(a.id),
			name: a.name,
			icon: a.icon,
			h: a.h,
			s: a.s,
			l: a.l,
		};
	});

	const accentStyle = computed<CSSProperties>(() =>
		(isPortal.value ? portalAccent.accentStyle.value : appAccent.accentStyle.value),
	);

	return { accent, accentStyle, isPortal };
}
