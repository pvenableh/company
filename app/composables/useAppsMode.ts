/**
 * Apps Layout — per-user shell selector.
 *
 * Mirrors `useLayoutMode`'s shape but persists to the Directus user row
 * (`directus_users.layout_mode` + `app_rail_position`), not localStorage.
 *
 *   - 'classic' → default.vue + sidebar (legacy behaviour)
 *   - 'apps'    → apps.vue + AppRail + per-app shell
 *
 * Pages opt into the apps shell via `definePageMeta({ layout: 'apps' })`.
 *
 * State strategy: module-level refs are the client-side source of truth
 * to keep the toggle reactive. The session-cookie user payload doesn't
 * include these new fields (only id/email/name/avatar/role), so we
 * hydrate once from /api/directus/users/me on first read.
 *
 * Small + medium screens (< lg, 1024px) force `railPosition = 'bottom'`
 * regardless of stored preference, so users always have thumb-reachable
 * nav on phones and tablets. The stored value is preserved and re-engages
 * on wider viewports.
 */
import { useMediaQuery } from '@vueuse/core';

export type AppsLayoutMode = 'classic' | 'apps';
export type RailPosition = 'left' | 'top' | 'right' | 'bottom' | 'floating';

const RAIL_POSITIONS: RailPosition[] = ['left', 'top', 'right', 'bottom', 'floating'];

const localMode = ref<AppsLayoutMode | null>(null);
const localRailPosition = ref<RailPosition | null>(null);
let hydrationPromise: Promise<void> | null = null;

async function hydrateFromServer() {
	if (hydrationPromise) return hydrationPromise;
	hydrationPromise = (async () => {
		try {
			const me = (await $fetch('/api/directus/users/me', {
				method: 'GET',
				params: { fields: 'layout_mode,app_rail_position' },
			})) as Record<string, any>;
			const m = me?.layout_mode;
			// Default is 'apps' — only an explicit 'classic' stored on the
			// user opts out. Existing users with null/undefined flip into
			// the new shell; they can toggle back via /account?section=layout.
			localMode.value = m === 'classic' ? 'classic' : 'apps';
			const rp = me?.app_rail_position as RailPosition | undefined;
			localRailPosition.value = rp && RAIL_POSITIONS.includes(rp) ? rp : 'left';
		} catch {
			localMode.value = 'apps';
			localRailPosition.value = 'left';
		}
	})();
	return hydrationPromise;
}

export function useAppsMode() {
	const { user } = useDirectusAuth();
	const { updateMe } = useDirectusUsers();

	// Start hydration on first call (client-side only — SSR uses fallback defaults).
	if (import.meta.client && localMode.value === null && localRailPosition.value === null) {
		hydrateFromServer();
	}

	const mode = computed<AppsLayoutMode>(() => {
		if (localMode.value !== null) return localMode.value;
		const raw = (user.value as any)?.layout_mode;
		return raw === 'classic' ? 'classic' : 'apps';
	});

	const isAppsMode = computed(() => mode.value === 'apps');

	const isMobile = useMediaQuery('(max-width: 1023px)');

	const storedRailPosition = computed<RailPosition>(() => {
		if (localRailPosition.value !== null) return localRailPosition.value;
		const raw = (user.value as any)?.app_rail_position as RailPosition | undefined;
		return raw && RAIL_POSITIONS.includes(raw) ? raw : 'left';
	});

	// Small + medium screens (phones + tablets, < lg) force bottom for thumb
	// reach; the stored pref is preserved and re-engages on wider viewports.
	const railPosition = computed<RailPosition>(() =>
		isMobile.value ? 'bottom' : storedRailPosition.value,
	);

	async function setMode(next: AppsLayoutMode): Promise<void> {
		if (mode.value === next) return;
		// Flip the local override immediately so the UI reacts even if the
		// server-side save fails (e.g. demo accounts where `layout_mode`
		// isn't writable). The user keeps the chosen layout for the
		// session; persistence is best-effort.
		localMode.value = next;
		try {
			await updateMe({ layout_mode: next });
		} catch (err) {
			console.warn('[useAppsMode] layout_mode persist failed; keeping local override', err);
			throw err;
		}
	}

	async function setRailPosition(next: RailPosition): Promise<void> {
		if (!RAIL_POSITIONS.includes(next)) return;
		if (railPosition.value === next) return;
		localRailPosition.value = next;
		try {
			await updateMe({ app_rail_position: next });
		} catch (err) {
			console.warn('[useAppsMode] app_rail_position persist failed; keeping local override', err);
			throw err;
		}
	}

	// Label visibility for the horizontal rail (top/bottom). Vertical and
	// floating modes are always icon-only; this only toggles the inline
	// label that sits next to the chip when the rail is a horizontal pill.
	// Cookie-backed so SSR + client agree and the label doesn't flash on
	// first paint. Stays a local-only preference (no Directus column) —
	// can be promoted to the user row later if cross-device sync matters.
	const railShowLabels = useCookie<boolean>('app-rail-show-labels', {
		default: () => true,
	});

	function setRailShowLabels(next: boolean): void {
		railShowLabels.value = next;
	}

	return {
		mode,
		isAppsMode,
		railPosition,
		storedRailPosition,
		railShowLabels,
		setMode,
		setRailPosition,
		setRailShowLabels,
	};
}
