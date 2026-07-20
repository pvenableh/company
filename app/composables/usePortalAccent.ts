/**
 * usePortalAccent — single source of truth for portal-side branding
 * (icon + colour) per app.
 *
 * Mirrors `useAppAccent` exactly so the portal shell + rail + page
 * headers reuse the same iOS-liquid-glass treatment. Each portal
 * app gets a tone with HSL components that propagate through CSS
 * custom properties (`--app-accent-h/s/l`); the client-portal layout
 * binds those to its root so `AppHeader` (shared with the main app
 * via `useCurrentAccent`) and any tinted chrome stay in lockstep with
 * PortalRail's active chip.
 *
 * Chip colours are derived from the active `useAppPalette` palette's
 * `sourceColors`, spread across the portal app list via the same
 * `pickGappy` helper the main rail uses. Switching palettes in
 * Appearance re-skins the portal rail the same way it re-skins the
 * main app rail.
 *
 * App taxonomy: the portal exposes six client-side apps rather than
 * the 11 flat sections it used to. Each app groups several legacy
 * sub-pages so the client's mental model is "what matters" rather
 * than "what does the agency call it":
 *   - home         /portal              dashboard, attention items, roll-up
 *   - progress     /portal/progress     projects + tasks + tickets
 *   - billing      /portal/billing      invoices + proposals + contracts
 *   - performance  /portal/performance  social + marketing
 *   - messages     /portal/messages     conversations
 *   - account      /portal/account      profile + appearance (footer)
 *
 * Legacy sub-pages keep their existing URLs (/portal/projects,
 * /portal/invoices, etc.) and the activeAppId resolver below maps
 * each prefix to its parent app so the correct rail chip lights up.
 */
import type { CSSProperties } from 'vue';
import {
	formatIconColor,
	iconHighlightForAccent,
	pickGappy,
	APP_PALETTES,
	type AppPaletteId,
	type HSL,
} from '~/composables/useAppAccent';
import { useAppPalette } from '~/composables/useAppPalette';

export type PortalAppId =
	| 'home'
	| 'progress'
	| 'billing'
	| 'performance'
	| 'messages'
	| 'book'
	| 'feedback'
	| 'account';

export interface PortalAppAccent {
	id: PortalAppId;
	name: string;
	/** Optional iOS-style compact label used in rail chips when the long
	 *  name would crowd the cell. Mirrors `AppAccent.shortName`. */
	shortName?: string;
	icon: string;
	to: string;
	/** Optional availability key — when the portal nav endpoint says the
	 * client has zero data for any of the app's sub-sections, the rail
	 * hides the whole app. */
	availabilityKey?: 'progress' | 'billing' | 'performance' | 'messages';
	/** HSL hue 0-360 */
	h: number;
	/** HSL saturation percent */
	s: number;
	/** HSL lightness percent (mid-tone — UI darkens/lightens around this) */
	l: number;
	/** Notification categories whose unread counts roll up onto this rail
	 * item's badge. Mirrors the shape on the staff AppAccent so PortalRail
	 * and AppRail can share the same badge-rendering logic. */
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
	/** Optional palette-resolved icon colour. Same shape as `AppAccent.iconHsl`
	 *  so shared formatters (`formatIconColor`) work in either shell. */
	iconHsl?: HSL;
}

/** Static meta — palette-independent (id/name/icon/route/notification + availability hooks). */
type PortalAppMeta = Omit<PortalAppAccent, 'h' | 's' | 'l' | 'iconHsl'>;

const PORTAL_META: Record<PortalAppId, PortalAppMeta> = {
	home:        { id: 'home',        name: 'Home',        shortName: 'Home', icon: 'ph:squares-four-duotone',  to: '/portal' },
	progress:    { id: 'progress',    name: 'Progress',    shortName: 'Prog', icon: 'lucide:square-kanban',     to: '/portal/progress',    availabilityKey: 'progress',    notificationCategories: ['projects', 'tickets'] },
	billing:     { id: 'billing',     name: 'Billing',     shortName: 'Bill', icon: 'lucide:trending-up',       to: '/portal/billing',     availabilityKey: 'billing',     notificationCategories: ['invoices', 'proposals', 'contracts'] },
	performance: { id: 'performance', name: 'Performance', shortName: 'Perf', icon: 'ph:chart-line-up-duotone', to: '/portal/performance', availabilityKey: 'performance' },
	messages:    { id: 'messages',    name: 'Messages',    shortName: 'Msgs', icon: 'lucide:messages-square',   to: '/portal/messages',    availabilityKey: 'messages',    notificationCategories: ['conversations'] },
	book:        { id: 'book',        name: 'Book',        shortName: 'Book', icon: 'ph:calendar-plus-duotone', to: '/portal/book' },
	feedback:    { id: 'feedback',    name: 'Feedback',    shortName: 'Rate', icon: 'lucide:message-square-heart', to: '/portal/feedback' },
	account:     { id: 'account',     name: 'Account',     shortName: 'Me',   icon: 'lucide:circle-user-round', to: '/portal/account' },
};

/**
 * Order matters — the rail renders main + footer groups in this sequence,
 * with a divider between. Account is the only footer item (it's
 * system/settings, not work, so it lives apart).
 */
export const PORTAL_ORDER: PortalAppId[] = [
	'home',
	'progress',
	'billing',
	'performance',
	'messages',
	'book',
];

export const PORTAL_FOOTER_ORDER: PortalAppId[] = ['feedback', 'account'];

/** Visual order: main group + footer concatenated. Drives pickGappy's
 *  spread so chip 0 always wears the brightest source colour. */
const PORTAL_CHIP_IDS: readonly PortalAppId[] = [...PORTAL_ORDER, ...PORTAL_FOOTER_ORDER];

/**
 * Sub-route prefixes that belong to each portal app. The rail's
 * activeAppId resolver walks this list longest-prefix-first so a
 * deep route like `/portal/invoices/abc` still highlights the
 * Billing chip. Keeping the mapping in one place makes adding a new
 * sub-section a one-line change.
 */
const PORTAL_APP_PREFIXES: Array<{ id: PortalAppId; prefixes: string[] }> = [
	{ id: 'account',     prefixes: ['/portal/account'] },
	{ id: 'feedback',    prefixes: ['/portal/feedback'] },
	{ id: 'progress',    prefixes: ['/portal/progress', '/portal/projects', '/portal/tasks', '/portal/tickets'] },
	{ id: 'billing',     prefixes: ['/portal/billing', '/portal/invoices', '/portal/proposals', '/portal/contracts'] },
	{ id: 'performance', prefixes: ['/portal/performance', '/portal/social', '/portal/marketing'] },
	{ id: 'messages',    prefixes: ['/portal/messages'] },
	{ id: 'book',        prefixes: ['/portal/book'] },
];

/**
 * Resolve every portal chip's colour from the active palette. Spreads
 * `PORTAL_CHIP_IDS.length` picks across `palette.sourceColors` via
 * `pickGappy` so portal chips re-balance the moment a new palette is
 * picked, identical to how `useAppAccent.getAppAccents` derives the
 * main rail's chips. Icon colour is the mirror across the (icon-)
 * source list — same recipe as the main rail's cross/same-mirror
 * strategies, simplified to "use the opposite end".
 */
export function getPortalAccents(paletteId: AppPaletteId): Record<PortalAppId, PortalAppAccent> {
	const palette = APP_PALETTES[paletteId] ?? APP_PALETTES.seaMist;
	const count = PORTAL_CHIP_IDS.length;
	const bgPicks = pickGappy(palette.sourceColors.length, count);
	const iconSrc = palette.iconSourceColors ?? palette.sourceColors;
	const iconPicks = pickGappy(iconSrc.length, count).slice().reverse();
	const out = {} as Record<PortalAppId, PortalAppAccent>;
	PORTAL_CHIP_IDS.forEach((id, i) => {
		const bg = palette.sourceColors[bgPicks[i]!]!;
		const icon = palette.uniformIcon ?? iconSrc[iconPicks[i]!]!;
		out[id] = { ...PORTAL_META[id], h: bg.h, s: bg.s, l: bg.l, iconHsl: icon };
	});
	return out;
}

export function usePortalAccent() {
	const route = useRoute();
	const { palette, glassChrome } = useAppPalette();

	const accents = computed<Record<PortalAppId, PortalAppAccent>>(() => {
		const base = getPortalAccents(palette.value);
		if (!glassChrome.value) return base;
		const out = {} as Record<PortalAppId, PortalAppAccent>;
		for (const id of PORTAL_CHIP_IDS) {
			const a = base[id]!;
			out[id] = { ...a, iconHsl: { h: a.h, s: a.s, l: a.l } };
		}
		return out;
	});

	/**
	 * Map the current portal route to its parent app id. Iteration is
	 * longest-prefix-first inside each entry, but the entries themselves
	 * are ordered with `account` first so a wildcard root match (the
	 * fallback `/portal` → `home`) doesn't shadow real matches.
	 */
	const activeAppId = computed<PortalAppId | null>(() => {
		const path = route.path;
		if (!path.startsWith('/portal')) return null;

		for (const { id, prefixes } of PORTAL_APP_PREFIXES) {
			for (const prefix of prefixes) {
				if (path === prefix || path.startsWith(`${prefix}/`)) return id;
			}
		}

		if (path === '/portal' || path === '/portal/') return 'home';
		return 'home';
	});

	const accent = computed<PortalAppAccent | null>(() =>
		activeAppId.value ? accents.value[activeAppId.value] : null,
	);

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
