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
 */
export const APP_ACCENTS: Record<AppId, AppAccent> = {
	clients: {
		id: 'clients',
		name: 'Clients',
		icon: 'ph:users-three-duotone',
		to: '/apps/clients',
		h: 199, s: 89, l: 48,
	},
	work: {
		id: 'work',
		name: 'Work',
		icon: 'lucide:square-kanban',
		to: '/apps/work',
		h: 160, s: 60, l: 45,
	},
	money: {
		id: 'money',
		name: 'Money',
		icon: 'lucide:trending-up',
		to: '/apps/money',
		h: 142, s: 72, l: 46,
	},
	marketing: {
		id: 'marketing',
		name: 'Marketing',
		icon: 'ph:waveform-duotone',
		to: '/apps/marketing',
		h: 38, s: 92, l: 50,
	},
	organization: {
		id: 'organization',
		name: 'Organization',
		icon: 'ph:tree-structure-duotone',
		to: '/apps/organization',
		h: 215, s: 22, l: 48,
	},
	account: {
		id: 'account',
		name: 'Account',
		icon: 'lucide:circle-user-round',
		to: '/account',
		h: 220, s: 10, l: 48,
	},
};

export const APP_ORDER: AppId[] = ['clients', 'work', 'money', 'marketing'];
export const APP_FOOTER_ORDER: AppId[] = ['organization', 'account'];

export function useAppAccent() {
	const route = useRoute();

	const activeAppId = computed<AppId | null>(() => {
		const path = route.path;
		if (path.startsWith('/account')) return 'account';
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
