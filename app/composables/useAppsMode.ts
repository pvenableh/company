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
import { getCurrentInstance, onMounted, shallowRef, type Ref } from 'vue';

export type AppsLayoutMode = 'classic' | 'apps';
export type RailPosition = 'left' | 'top' | 'right' | 'bottom';

const RAIL_POSITIONS: RailPosition[] = ['left', 'top', 'right', 'bottom'];

// Older user rows may still carry the retired 'floating' choice. Map it
// to the closest replacement so the rail still renders cleanly until the
// next setRailPosition() persists a valid value.
function normalizePosition(raw: unknown): RailPosition {
	if (raw === 'floating') return 'bottom';
	return raw && RAIL_POSITIONS.includes(raw as RailPosition) ? (raw as RailPosition) : 'left';
}

const localMode = ref<AppsLayoutMode | null>(null);
const localRailPosition = ref<RailPosition | null>(null);
let hydrationPromise: Promise<void> | null = null;

// Module-level ref shared by every useAppsMode() consumer. Two reasons it
// lives here, not inside the composable:
//   1) Per-call instances drifted across effect scopes — useMediaQuery ties
//      its cleanup to the first-calling component, so when that component
//      unmounted, the listener died and later consumers got a pinned value.
//   2) Initial sync is deferred to onMounted so SSR (where isMobile must be
//      false, since there's no viewport) and the first client render agree.
//      Setting it during hydration triggers a class-binding hydration
//      mismatch that Vue silently fails to patch.
const isMobile: Ref<boolean> = shallowRef(false);
let mqlAttached = false;
function ensureMqlListener() {
	if (mqlAttached || !import.meta.client) return;
	mqlAttached = true;
	const mql = window.matchMedia('(max-width: 1023px)');
	isMobile.value = mql.matches;
	mql.addEventListener('change', (e) => {
		isMobile.value = e.matches;
	});
}

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
			// the new shell; they can toggle back via /account?section=appearance.
			localMode.value = m === 'classic' ? 'classic' : 'apps';
			localRailPosition.value = normalizePosition(me?.app_rail_position);
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

	if (import.meta.client && getCurrentInstance()) {
		// Defer the listener attach past the current paint. Inside onMounted
		// directly, Vue's hydration is still considered in-flight: setting
		// isMobile.value synchronously then patches the :class binding, but
		// Vue treats the change as a hydration mismatch on class and silently
		// keeps the SSR-rendered value. Pushing one frame out lets the patch
		// run as a normal reactive update.
		onMounted(() => {
			requestAnimationFrame(ensureMqlListener);
		});
	}

	const mode = computed<AppsLayoutMode>(() => {
		if (localMode.value !== null) return localMode.value;
		const raw = (user.value as any)?.layout_mode;
		return raw === 'classic' ? 'classic' : 'apps';
	});

	const isAppsMode = computed(() => mode.value === 'apps');

	const storedRailPosition = computed<RailPosition>(() => {
		if (localRailPosition.value !== null) return localRailPosition.value;
		return normalizePosition((user.value as any)?.app_rail_position);
	});

	// The rail is locked to the bottom for everyone (decided 2026-06-19): the
	// position picker has been removed from the UI, so the dock always docks at
	// the bottom like a mobile tab bar — regardless of any previously-saved
	// `app_rail_position`. `storedRailPosition` is kept available for a future
	// re-enable, but is intentionally NOT consulted for the live position.
	const railPosition = computed<RailPosition>(() => 'bottom');

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
		default: () => false,
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
