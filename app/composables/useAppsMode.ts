/**
 * Apps Layout — per-user shell selector.
 *
 * Mirrors `useLayoutMode`'s shape but persists to the Directus user row
 * (`directus_users.layout_mode` + `app_rail_position`), not localStorage.
 *
 *   - 'classic' → default.vue + sidebar + hats (legacy behaviour)
 *   - 'apps'    → apps.vue + AppRail + per-app shell
 *
 * Pages opt into the apps shell via `definePageMeta({ layout: 'apps' })`.
 * Phase 1 has no such pages — the toggle just stores the pref. Phase 2+
 * routes will read `isAppsMode` to decide which layout to mount.
 *
 * State strategy: module-level refs are the client-side source of truth
 * to keep the toggle reactive. The session-cookie user payload doesn't
 * include these new fields (only id/email/name/avatar/role), so we
 * hydrate once from /api/directus/users/me on first read.
 */

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
			localMode.value = m === 'apps' ? 'apps' : 'classic';
			const rp = me?.app_rail_position as RailPosition | undefined;
			localRailPosition.value = rp && RAIL_POSITIONS.includes(rp) ? rp : 'left';
		} catch {
			localMode.value = 'classic';
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
		return raw === 'apps' ? 'apps' : 'classic';
	});

	const isAppsMode = computed(() => mode.value === 'apps');

	const railPosition = computed<RailPosition>(() => {
		if (localRailPosition.value !== null) return localRailPosition.value;
		const raw = (user.value as any)?.app_rail_position as RailPosition | undefined;
		return raw && RAIL_POSITIONS.includes(raw) ? raw : 'left';
	});

	async function setMode(next: AppsLayoutMode): Promise<void> {
		const prev = mode.value;
		if (prev === next) return;
		localMode.value = next;
		try {
			await updateMe({ layout_mode: next });
		} catch (err) {
			localMode.value = prev;
			throw err;
		}
	}

	async function setRailPosition(next: RailPosition): Promise<void> {
		const prev = railPosition.value;
		if (prev === next) return;
		if (!RAIL_POSITIONS.includes(next)) return;
		localRailPosition.value = next;
		try {
			await updateMe({ app_rail_position: next });
		} catch (err) {
			localRailPosition.value = prev;
			throw err;
		}
	}

	return {
		mode,
		isAppsMode,
		railPosition,
		setMode,
		setRailPosition,
	};
}
