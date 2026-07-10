/**
 * Apps Layout rail state — the app's only shell is the apps layout (the classic
 * layout has been removed), so this composable no longer carries a mode flag.
 * What survives is rail state (`app_rail_position` on the Directus user row +
 * label visibility), which the AppRail / dock / shell read to place the nav.
 *
 * Small + medium screens (< lg, 1024px) force `railPosition = 'bottom'`
 * regardless of stored preference, so users always have thumb-reachable nav on
 * phones and tablets. The stored value is preserved for a future re-enable.
 */
import { getCurrentInstance, onMounted, shallowRef, type Ref } from 'vue';

export type RailPosition = 'left' | 'top' | 'right' | 'bottom';

const RAIL_POSITIONS: RailPosition[] = ['left', 'top', 'right', 'bottom'];

// Older user rows may still carry the retired 'floating' choice. Map it
// to the closest replacement so the rail still renders cleanly until the
// next setRailPosition() persists a valid value.
function normalizePosition(raw: unknown): RailPosition {
	if (raw === 'floating') return 'bottom';
	return raw && RAIL_POSITIONS.includes(raw as RailPosition) ? (raw as RailPosition) : 'left';
}

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

// The session-cookie user payload doesn't include `app_rail_position`, so
// hydrate it once from /api/directus/users/me on first read.
async function hydrateFromServer() {
	if (hydrationPromise) return hydrationPromise;
	hydrationPromise = (async () => {
		try {
			const me = (await $fetch('/api/directus/users/me', {
				method: 'GET',
				params: { fields: 'app_rail_position' },
			})) as Record<string, any>;
			localRailPosition.value = normalizePosition(me?.app_rail_position);
		} catch {
			localRailPosition.value = 'left';
		}
	})();
	return hydrationPromise;
}

export function useAppsMode() {
	const { user } = useDirectusAuth();
	const { updateMe } = useDirectusUsers();

	// Start hydration on first call (client-side only — SSR uses fallback defaults).
	if (import.meta.client && localRailPosition.value === null) {
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
		railPosition,
		storedRailPosition,
		railShowLabels,
		setRailPosition,
		setRailShowLabels,
	};
}
