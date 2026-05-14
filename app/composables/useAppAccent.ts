/**
 * useAppAccent — single source of truth for per-app branding (icon + colour).
 *
 * Each top-level app gets a tone with HSL components that propagate through
 * CSS custom properties (`--app-accent-h/s/l`). The layout shell sets those
 * on its root element based on the active route, so the AppRail's active
 * chip, the AppFloorStrip's active pill, and any app-tinted accents in the
 * page chrome all stay in lockstep.
 *
 * The HSL values come from `APP_PALETTES`, keyed by the per-user palette
 * preference (`useAppPalette`). Everything else — icon, label, route,
 * notification categories — is palette-independent and lives in `APP_META`.
 *
 * Adding a new app:
 *   1. Add an entry to APP_META keyed by the URL segment.
 *   2. Add HSL values for that app to every palette in APP_PALETTES.
 *   3. Add the rail item to AppRail.vue's APPS list (id matches the key).
 *
 * Adding a new palette:
 *   1. Add { [appId]: { h, s, l } } entry to APP_PALETTES under a new id.
 *   2. Add the id to PALETTE_IDS in useAppPalette.ts + a picker swatch.
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

type HSL = { h: number; s: number; l: number };

/**
 * Palette registry — single source of truth for every palette that ships.
 *
 * To add a new palette: add one entry below with { meta, colors }. The
 * picker (`AppPalettePicker.vue`) and the type alias (`AppPaletteId`)
 * both derive from this map, so no other file needs updating.
 *
 *   meta.label — picker chip label
 *   meta.hint  — one-line description shown under the swatch row
 *   colors     — { [appId]: { h, s, l } } — see APP_META for app ids
 *
 * Lightness across palettes is normalised so each app reads at similar
 * visual weight in the rail. Footer apps (organization, account) stay
 * intentionally muted across every palette — they're system/settings,
 * not work.
 *
 * @see useAppPalette.ts — picks the active palette per user.
 */
export const APP_PALETTES = {
	// Original Apple iWork–style palette. Each work app is its own hue
	// family so users read "I'm in Money" vs "I'm in Marketing" at a glance.
	default: {
		meta: { label: 'Default', hint: 'Original Earnest hues — distinct per app' },
		colors: {
			dashboard:    { h: 191, s: 100, l: 50 },
			clients:      { h: 242, s: 72,  l: 52 },
			work:         { h: 160, s: 72,  l: 46 },
			money:        { h: 142, s: 72,  l: 48 },
			marketing:    { h: 308, s: 80,  l: 52 },
			organization: { h: 205, s: 35,  l: 48 },
			account:      { h: 220, s: 10,  l: 20 },
		},
	},
	// Oceanic — Lime Cream → Yale Blue gradient.
	//   dashboard → Tropical Teal  #34a0a4
	//   clients   → Emerald        #76c893 (L bumped to ~50 for parity)
	//   work      → Lime Cream     #d9ed92 (L pulled to ~50, otherwise too pale to read)
	//   money     → Baltic Blue    #1e6091
	//   marketing → Bondi Blue     #168aad
	//   org       → Yale Blue      #184e77 (footer)
	//   account   → muted slate    (footer)
	oceanic: {
		meta: { label: 'Oceanic', hint: 'Lime through deep Yale blue' },
		colors: {
			dashboard:    { h: 182, s: 51, l: 42 },
			clients:      { h: 138, s: 43, l: 50 },
			work:         { h: 73,  s: 75, l: 50 },
			money:        { h: 205, s: 67, l: 38 },
			marketing:    { h: 192, s: 78, l: 38 },
			organization: { h: 207, s: 35, l: 32 },
			account:      { h: 207, s: 10, l: 22 },
		},
	},
	// Gradient Blues — violet → blue → cyan jewel-tone family.
	//   dashboard → Strong Cyan    #56cfe1
	//   clients   → Royal Violet   #7400b8
	//   work      → Indigo Bloom   #6930c3
	//   money     → Slate Indigo   #5e60ce
	//   marketing → Blue Energy    #5390d9
	//   org       → Fresh Sky      #4ea8de (footer, muted)
	//   account   → muted slate    (footer)
	gradientBlues: {
		meta: { label: 'Gradient Blues', hint: 'Violet → blue → cyan jewel tones' },
		colors: {
			dashboard:    { h: 187, s: 70,  l: 55 },
			clients:      { h: 278, s: 100, l: 40 },
			work:         { h: 261, s: 60,  l: 48 },
			money:        { h: 239, s: 56,  l: 50 },
			marketing:    { h: 211, s: 64,  l: 55 },
			organization: { h: 202, s: 35,  l: 50 },
			account:      { h: 220, s: 10,  l: 22 },
		},
	},
} as const satisfies Record<string, { meta: { label: string; hint: string }; colors: Record<AppId, HSL> }>;

/** Palette id derived from the registry — adding a new palette doesn't
 *  require updating this type. */
export type AppPaletteId = keyof typeof APP_PALETTES;

/** Stable order for the picker — derived from the registry's insertion
 *  order so new palettes appear at the bottom by default. */
export const APP_PALETTE_IDS = Object.keys(APP_PALETTES) as AppPaletteId[];

/**
 * Legacy palette aliases. When a stored `directus_users.app_palette`
 * value points to a renamed palette, map it here. Read paths consult
 * this before deciding whether to fall back to `default`, so users on
 * the old id keep their selection.
 */
export const APP_PALETTE_ALIASES: Record<string, AppPaletteId> = {
	royal: 'gradientBlues',
};

export function resolvePaletteId(raw: unknown): AppPaletteId {
	if (typeof raw !== 'string') return 'default';
	if (APP_PALETTE_ALIASES[raw]) return APP_PALETTE_ALIASES[raw]!;
	return (APP_PALETTE_IDS as string[]).includes(raw) ? (raw as AppPaletteId) : 'default';
}

/** Resolved per-app accents for the active palette. */
export function getAppAccents(paletteId: AppPaletteId): Record<AppId, AppAccent> {
	const palette = APP_PALETTES[paletteId] ?? APP_PALETTES.default;
	const out = {} as Record<AppId, AppAccent>;
	for (const id of Object.keys(APP_META) as AppId[]) {
		out[id] = { ...APP_META[id], ...palette.colors[id] };
	}
	return out;
}

/**
 * @deprecated Use `getAppAccents(paletteId)` from a composable scope. Kept
 * as a static export for any direct importer that doesn't have access to
 * the user's palette preference — returns the default palette.
 */
export const APP_ACCENTS: Record<AppId, AppAccent> = getAppAccents('default');

export const APP_ORDER: AppId[] = ['dashboard', 'clients', 'work', 'money', 'marketing'];
export const APP_FOOTER_ORDER: AppId[] = ['organization', 'account'];

export function useAppAccent() {
	const route = useRoute();
	const { palette } = useAppPalette();

	const accents = computed<Record<AppId, AppAccent>>(() => getAppAccents(palette.value));

	const activeAppId = computed<AppId | null>(() => {
		const path = route.path;
		if (path.startsWith('/account')) return 'account';
		// Dashboard lives at the app root rather than /apps/dashboard so the
		// existing home page (Productivity Engine + CRM intelligence + score
		// widgets) keeps a single canonical destination — IA stays clean.
		if (path === '/' || path === '/apps' || path === '/apps/') return 'dashboard';
		const seg = path.split('/').filter(Boolean);
		if (seg[0] !== 'apps') return null;
		const id = seg[1] as AppId | undefined;
		return id && id in APP_META ? id : null;
	});

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
			} as CSSProperties;
		}
		return {
			'--app-accent-h': String(a.h),
			'--app-accent-s': `${a.s}%`,
			'--app-accent-l': `${a.l}%`,
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
