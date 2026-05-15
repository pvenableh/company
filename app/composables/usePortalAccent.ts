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
 * Saturation/lightness convention (Apple iWork pattern):
 *   - Work-style pages keep s≈75, l≈50 so the icons read as one family.
 *   - Comms / billing pages bend toward warmer hues to feel distinct
 *     without breaking the family.
 *   - Account stays intentionally muted to mark it as system/settings.
 */
import type { CSSProperties } from 'vue';
import { formatIconColor, iconHighlightForAccent } from '~/composables/useAppAccent';

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
}

export const PORTAL_ACCENTS: Record<PortalAppId, PortalAppAccent> = {
	dashboard: {
		id: 'dashboard',
		name: 'Dashboard',
		icon: 'ph:squares-four-duotone',
		to: '/portal',
		h: 191, s: 100, l: 50,
	},
	projects: {
		id: 'projects',
		name: 'Projects',
		icon: 'lucide:square-kanban',
		to: '/portal/projects',
		h: 160, s: 72, l: 46,
		notificationCategories: ['projects'],
	},
	tasks: {
		id: 'tasks',
		name: 'Tasks',
		icon: 'ph:check-square-duotone',
		to: '/portal/tasks',
		h: 135, s: 65, l: 48,
	},
	tickets: {
		id: 'tickets',
		name: 'Tickets',
		icon: 'ph:ticket-duotone',
		to: '/portal/tickets',
		h: 38, s: 92, l: 50,
		notificationCategories: ['tickets'],
	},
	invoices: {
		id: 'invoices',
		name: 'Invoices',
		icon: 'lucide:trending-up',
		to: '/portal/invoices',
		h: 142, s: 72, l: 48,
		notificationCategories: ['invoices'],
	},
	proposals: {
		id: 'proposals',
		name: 'Proposals',
		icon: 'ph:file-text-duotone',
		to: '/portal/proposals',
		availabilityKey: 'proposals',
		h: 268, s: 70, l: 56,
		notificationCategories: ['proposals'],
	},
	contracts: {
		id: 'contracts',
		name: 'Contracts',
		icon: 'ph:certificate-duotone',
		to: '/portal/contracts',
		availabilityKey: 'contracts',
		h: 232, s: 70, l: 56,
		notificationCategories: ['contracts'],
	},
	social: {
		id: 'social',
		name: 'Social',
		icon: 'ph:chart-line-up-duotone',
		to: '/portal/social',
		availabilityKey: 'social',
		h: 340, s: 80, l: 56,
	},
	marketing: {
		id: 'marketing',
		name: 'Marketing',
		icon: 'ph:waveform-duotone',
		to: '/portal/marketing',
		availabilityKey: 'marketing',
		h: 308, s: 80, l: 52,
	},
	messages: {
		id: 'messages',
		name: 'Messages',
		icon: 'ph:chats-circle-duotone',
		to: '/portal/messages',
		h: 215, s: 85, l: 55,
		notificationCategories: ['conversations'],
	},
	account: {
		id: 'account',
		name: 'Account',
		icon: 'lucide:circle-user-round',
		to: '/portal/account',
		h: 220, s: 10, l: 20,
	},
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

export function usePortalAccent() {
	const route = useRoute();

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
		activeAppId.value ? PORTAL_ACCENTS[activeAppId.value] : null,
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

	return { activeAppId, accent, accentStyle };
}
