/**
 * usePortalAccent — single source of truth for portal-side branding
 * (icon + colour) per page.
 *
 * Mirrors `useAppAccent` exactly so the portal shell + rail + page
 * headers reuse the same iOS-liquid-glass treatment. Each portal
 * page gets a tone with HSL components that propagate through CSS
 * custom properties (`--app-accent-h/s/l`); the client-portal layout
 * binds those to its root so `AppHeader` (shared with the main app
 * via `useCurrentAccent`) and any tinted chrome stay in lockstep with
 * PortalRail's active chip.
 *
 * Chip colours are derived from the active `useAppPalette` palette's
 * `sourceColors`, spread across the portal section list via the same
 * `pickGappy` helper the main rail uses. This keeps the portal in
 * lockstep with the user's palette pick — switching to Aurora in
 * Appearance re-skins the portal rail the same way it re-skins the
 * main app rail. Per-section icon resolution defers to the palette's
 * `iconStrategy`.
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
	| 'dashboard'
	| 'projects'
	| 'tasks'
	| 'tickets'
	| 'invoices'
	| 'proposals'
	| 'contracts'
	| 'social'
	| 'marketing'
	| 'messages'
	| 'account';

export interface PortalAppAccent {
	id: PortalAppId;
	name: string;
	icon: string;
	to: string;
	/** Optional availability key — when the portal nav endpoint says the
	 * client has zero data for this section, the rail/footer hides it. */
	availabilityKey?: 'social' | 'marketing' | 'proposals' | 'contracts';
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
	dashboard: { id: 'dashboard', name: 'Dashboard', icon: 'ph:squares-four-duotone',     to: '/portal' },
	projects:  { id: 'projects',  name: 'Projects',  icon: 'lucide:square-kanban',        to: '/portal/projects',  notificationCategories: ['projects'] },
	tasks:     { id: 'tasks',     name: 'Tasks',     icon: 'ph:check-square-duotone',     to: '/portal/tasks' },
	tickets:   { id: 'tickets',   name: 'Tickets',   icon: 'ph:ticket-duotone',           to: '/portal/tickets',   notificationCategories: ['tickets'] },
	invoices:  { id: 'invoices',  name: 'Invoices',  icon: 'lucide:trending-up',          to: '/portal/invoices',  notificationCategories: ['invoices'] },
	proposals: { id: 'proposals', name: 'Proposals', icon: 'ph:file-text-duotone',        to: '/portal/proposals', availabilityKey: 'proposals', notificationCategories: ['proposals'] },
	contracts: { id: 'contracts', name: 'Contracts', icon: 'ph:certificate-duotone',      to: '/portal/contracts', availabilityKey: 'contracts', notificationCategories: ['contracts'] },
	social:    { id: 'social',    name: 'Social',    icon: 'ph:chart-line-up-duotone',    to: '/portal/social',    availabilityKey: 'social' },
	marketing: { id: 'marketing', name: 'Marketing', icon: 'ph:waveform-duotone',         to: '/portal/marketing', availabilityKey: 'marketing' },
	messages:  { id: 'messages',  name: 'Messages',  icon: 'ph:chats-circle-duotone',     to: '/portal/messages',  notificationCategories: ['conversations'] },
	account:   { id: 'account',   name: 'Account',   icon: 'lucide:circle-user-round',    to: '/portal/account' },
};

/**
 * Order matters — the rail renders main + footer groups in this sequence,
 * with a divider between. Account is the only footer item (it's
 * system/settings, not work, so it lives apart).
 */
export const PORTAL_ORDER: PortalAppId[] = [
	'dashboard',
	'projects',
	'tasks',
	'tickets',
	'invoices',
	'proposals',
	'contracts',
	'social',
	'marketing',
	'messages',
];

export const PORTAL_FOOTER_ORDER: PortalAppId[] = ['account'];

/** Visual order: main group + footer concatenated. Drives pickGappy's
 *  spread so chip 0 always wears the brightest source colour. */
const PORTAL_CHIP_IDS: readonly PortalAppId[] = [...PORTAL_ORDER, ...PORTAL_FOOTER_ORDER];

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
		// Glass mode: every chip wears its own bg as the icon colour so
		// the rail shows the full chromatic ramp on frosted discs —
		// same recipe as `useAppAccent`'s glass override.
		const out = {} as Record<PortalAppId, PortalAppAccent>;
		for (const id of PORTAL_CHIP_IDS) {
			const a = base[id]!;
			out[id] = { ...a, iconHsl: { h: a.h, s: a.s, l: a.l } };
		}
		return out;
	});

	/**
	 * Map the current portal route to a portal app id. We match longest-
	 * prefix-first so /portal/invoices/[id] still resolves to "invoices"
	 * rather than the dashboard.
	 */
	const activeAppId = computed<PortalAppId | null>(() => {
		const path = route.path;
		if (!path.startsWith('/portal')) return null;

		// Order matters: scan deepest segments first.
		const ordered: Array<[PortalAppId, string]> = [
			['account', '/portal/account'],
			['proposals', '/portal/proposals'],
			['contracts', '/portal/contracts'],
			['invoices', '/portal/invoices'],
			['projects', '/portal/projects'],
			['tickets', '/portal/tickets'],
			['tasks', '/portal/tasks'],
			['social', '/portal/social'],
			['marketing', '/portal/marketing'],
			['messages', '/portal/messages'],
		];
		for (const [id, prefix] of ordered) {
			if (path === prefix || path.startsWith(`${prefix}/`)) return id;
		}
		// Bare /portal → dashboard. /portal/ also counts.
		if (path === '/portal' || path === '/portal/') return 'dashboard';
		return 'dashboard';
	});

	const accent = computed<PortalAppAccent | null>(() =>
		activeAppId.value ? accents.value[activeAppId.value] : null,
	);

	/**
	 * CSS custom properties suitable for binding to `:style`. Falls back to
	 * neutral muted-foreground values when no app is active so anything
	 * inheriting these vars still renders without conditionals.
	 *
	 * Uses the same `--app-accent-*` variable names as `useAppAccent` so
	 * shared components (e.g. AppHeader's chip CSS) work in either shell
	 * without branching.
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
