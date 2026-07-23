/**
 * useEarnest — the single source of truth for Earnest's presence.
 *
 * There is ONE Earnest, now at TWO altitudes:
 *   - 'rest' — collapsed. On the home route this is the calm PresenceHome hero;
 *              elsewhere it's the ambient presence dot / launcher in the top bar.
 *              No overlay. (Contextual, *inline* Earnest — e.g. EntityEarnestCard,
 *              the generative canvases — is its own embedded surface and doesn't
 *              live here; it escalates INTO Focus when the user leans in.)
 *   - 'full' — the full-screen Focus surface (calm "one honest thing" register,
 *              task rail, and the Mirror, which now also carries Earnest's
 *              proposals + the autonomy gauge).
 *
 * The docked right-side slide-over ('dock') has been RETIRED — Earnest is either
 * inline (on the thing you're looking at) or Focus. To keep the many existing
 * callers working unchanged, any request for the old 'dock' size is transparently
 * resolved to 'full', so "Ask Earnest" everywhere now opens Focus.
 *
 * Size is a pure VIEW concern. It is deliberately decoupled from which
 * conversation is active: the thread is bucketed by route/entity in
 * useContextualChat + useEarnestAwareness, so the live thread carries across
 * surfaces (the bucket key never changes on resize — setEntity/setRoute are
 * idempotent on an unchanged key).
 *
 * The legacy entry composables (useEarnestPanel, useCoachingMode, useAITray)
 * are thin shims over this state so existing callers keep working unchanged.
 */

// 'dock' is retained in the type for back-compat with existing callers, but it
// is never stored — resolveSize() folds it into 'full'.
export type EarnestSize = 'rest' | 'dock' | 'full';

/** The dock is retired: any 'dock' request resolves to the full-screen Focus. */
function resolveSize(size: EarnestSize): Exclude<EarnestSize, 'dock'> {
	return size === 'dock' ? 'full' : size;
}

/**
 * The one-tap "encourage me" opener. Sent through the normal contextually-aware
 * chat engine, so Earnest answers grounded in the user's real momentum/wins, in
 * its warm register — an honest lift, never empty hype (the voice charter's
 * "ground every bit of praise in a specific fact" rule applies). Reused wherever
 * the affordance appears so the wording stays consistent.
 */
export const EARNEST_LIFT_OPENER = 'I could use a lift';

// Module-level shared state.
const _mode = ref<EarnestSize>('rest');
const _initialPrompt = ref('');

export const earnestMode = _mode;
export const earnestInitialPrompt = _initialPrompt;
/**
 * A specific past conversation to restore on open (e.g. deep-linking from the
 * note that was saved out of it). The panel loads it into the current bucket
 * once open, then clears this — same mechanism the history browser uses.
 */
export const earnestPendingSession = ref<string | null>(null);
/** The Focus overlay is showing. */
export const earnestIsOpen = computed(() => _mode.value !== 'rest');

/**
 * Open Earnest, optionally seeding a prompt that auto-sends. Defaults to Focus
 * (the only overlay now that the dock is retired); a 'dock' request resolves to
 * 'full' for back-compat.
 */
export function openEarnest(size: Exclude<EarnestSize, 'rest'> = 'full', opts: { prompt?: string } = {}) {
	if (opts.prompt !== undefined) _initialPrompt.value = opts.prompt;
	_mode.value = resolveSize(size);
}

/**
 * Change the size in place. This is a VIEW change only — it must never touch
 * the active conversation. 'rest' collapses the overlay (keeps the thread in
 * memory so re-opening resumes it). 'dock' resolves to 'full'.
 */
export function setEarnestSize(size: EarnestSize) {
	_mode.value = resolveSize(size);
}

/** Collapse Earnest to rest and clear any pending seed prompt / session. */
export function closeEarnest() {
	_mode.value = 'rest';
	_initialPrompt.value = '';
	earnestPendingSession.value = null;
}

export function useEarnest() {
	return {
		mode: _mode,
		isOpen: earnestIsOpen,
		initialPrompt: _initialPrompt,
		open: openEarnest,
		setSize: setEarnestSize,
		close: closeEarnest,
	};
}
