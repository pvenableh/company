// composables/useEarnestMascot.ts
/**
 * Earnest mascot — gate + trigger bus.
 *
 * The mascot is the brand mark come alive: the logo "E" (see
 * `components/Earnest/Mark.vue`) that morphs into a gesture on a real event.
 * This composable is the single seam producers and the mounted mascot share —
 * exactly like `useArcade`: anywhere in the app can call
 * `useEarnestMascot().react('thumbsup')`, and the one mounted `<EarnestMascot>`
 * plays it. No prop-drilling.
 *
 * Gating (all must pass, else `react()` is a no-op and no mascot mounts):
 *   1. `public.earnestMascotEnabled` runtime flag — the global kill-switch,
 *      mirroring `useSocialPublishing`. Flip it (or the env var) to remove the
 *      mascot everywhere with no code change.
 *   2. per-user preference — Account → Appearance, persisted in a cookie.
 *   3. `prefers-reduced-motion` — honoured automatically.
 * The global flag overrides the per-user toggle.
 */
import type { MarkGesture } from '~/components/Earnest/Mark.vue';

// ─── Shared module-level bus (one instance, many producers) ─────────────────
const _event = ref<{ gesture: MarkGesture; id: number } | null>(null);
let _seq = 0;
let _rmBound = false;

export function useEarnestMascot() {
	const config = useRuntimeConfig();

	// 1. global kill-switch
	const flagEnabled = computed(() => !!(config.public as any).earnestMascotEnabled);

	// 2. per-user preference (default on). Cookie, matching the app's other
	//    client-side view prefs — survives reloads, no server round-trip.
	const userEnabled = useCookie<boolean>('earnest-mascot-enabled', {
		default: () => true,
		maxAge: 60 * 60 * 24 * 365,
		sameSite: 'lax',
	});

	// 3. reduced motion
	const reducedMotion = useState('earnest-mascot-reduced-motion', () => false);
	if (import.meta.client && !_rmBound) {
		_rmBound = true;
		const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
		reducedMotion.value = mq.matches;
		mq.addEventListener?.('change', (e) => (reducedMotion.value = e.matches));
	}

	/** Whether the mascot should mount + animate at all. */
	const enabled = computed(
		() => flagEnabled.value && userEnabled.value !== false && !reducedMotion.value,
	);

	/**
	 * Ask the mascot to react. No-op unless enabled. The mounted `<EarnestMascot>`
	 * watches `event` and plays the gesture.
	 */
	const react = (gesture: MarkGesture) => {
		if (!enabled.value) return;
		_event.value = { gesture, id: ++_seq };
	};

	return {
		enabled,
		/** global flag alone — for explaining *why* it's off in settings UI. */
		flagEnabled,
		/** per-user toggle (writable) — bind to the Appearance switch. */
		userEnabled,
		reducedMotion: readonly(reducedMotion),
		event: readonly(_event),
		react,
	};
}
