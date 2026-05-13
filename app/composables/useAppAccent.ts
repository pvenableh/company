/**
 * useAppAccent — single source of truth for per-app branding (icon + colour).
 *
 * Each top-level app gets a tone with HSL components that propagate through
 * CSS custom properties (`--app-accent-h/s/l`). The layout shell sets those
 * on its root element based on the active route, so the AppRail's active
 * chip, the AppFloorStrip's active pill, and any app-tinted accents in the
 * page chrome all stay in lockstep.
 *
 * Adding a new app:
 *   1. Add an entry to APP_ACCENTS keyed by the URL segment.
 *   2. Add the rail item to AppRail.vue's APPS list (id matches the key).
 *
 * The "name" field is intentionally the user-facing label so AppRail can
 * read straight from this map rather than maintaining a parallel list.
 */
import type { CSSProperties } from 'vue';

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
}

/**
 * Accent hues are pulled from the status palette in `useStatusStyle` so the
 * app chrome and the in-page status pills speak the same language. Don't
 * invent new hues here — if you need another, add it to the status palette
 * first and then reference it.
 *
 * Saturation/lightness convention (Apple iWork pattern):
 *   - Work apps (Clients/Work/Money/Marketing) share s≈75, l≈50 so the
 *     four icons read as one family despite hue differences.
 *   - Footer apps (Organization/Account) stay intentionally muted —
 *     they're system/settings, not work, and the lower saturation
 *     reinforces that hierarchy in the rail.
 */
export const APP_ACCENTS: Record<AppId, AppAccent> = {
	dashboard: {
		id: 'dashboard',
		name: 'Dashboard',
		icon: 'ph:compass-tool-duotone',
		to: '/',
		h: 191, s: 100, l: 50,
	},
	clients: {
		id: 'clients',
		name: 'Clients',
		icon: 'ph:users-three-duotone',
		to: '/apps/clients',
		h: 242, s: 72, l: 52,
	},
	work: {
		id: 'work',
		name: 'Work',
		icon: 'lucide:square-kanban',
		to: '/apps/work',
		h: 160, s: 72, l: 46,
	},
	money: {
		id: 'money',
		name: 'Money',
		icon: 'lucide:trending-up',
		to: '/apps/money',
		h: 142, s: 72, l: 48,
	},
	marketing: {
		id: 'marketing',
		name: 'Marketing',
		icon: 'ph:waveform-duotone',
		to: '/apps/marketing',
		h: 308, s: 80, l: 52,
	},
	organization: {
		id: 'organization',
		name: 'Organization',
		icon: 'ph:tree-structure-duotone',
		to: '/apps/organization',
		h: 205, s: 35, l: 48,
	},
	account: {
		id: 'account',
		name: 'Account',
		icon: 'lucide:circle-user-round',
		to: '/account',
		h: 220, s: 10, l: 20,
	},
};

export const APP_ORDER: AppId[] = ['dashboard', 'clients', 'work', 'money', 'marketing'];
export const APP_FOOTER_ORDER: AppId[] = ['organization', 'account'];

export function useAppAccent() {
	const route = useRoute();

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
		return id && id in APP_ACCENTS ? id : null;
	});

	const accent = computed<AppAccent | null>(() =>
		activeAppId.value ? APP_ACCENTS[activeAppId.value] : null,
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

	return { activeAppId, accent, accentStyle };
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
