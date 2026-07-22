/**
 * useEarnest — the single source of truth for Earnest's presence.
 *
 * There is ONE Earnest, shown at three sizes:
 *   - 'rest' — collapsed. On the home route this is the calm PresenceHome hero;
 *              elsewhere it's the ambient presence dot in the top bar. No overlay.
 *   - 'dock' — the docked right-side slide-over (the everyday assistant panel).
 *   - 'full' — the full-screen focus surface (calm "one honest thing" register,
 *              task rail, Mirror).
 *
 * Size is a pure VIEW concern. It is deliberately decoupled from which
 * conversation is active: the thread is bucketed by route/entity in
 * useContextualChat + useEarnestAwareness, so resizing between dock and full
 * keeps the exact same live thread (the bucket key never changes on resize —
 * setEntity/setRoute are idempotent on an unchanged key).
 *
 * The legacy entry composables (useEarnestPanel, useCoachingMode, useAITray)
 * are thin shims over this state so existing callers keep working unchanged.
 */

export type EarnestSize = 'rest' | 'dock' | 'full';

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
/** The overlay (dock or full) is showing. */
export const earnestIsOpen = computed(() => _mode.value !== 'rest');

/**
 * Open Earnest at a given size, optionally seeding a prompt that auto-sends.
 * Defaults to the docked panel.
 */
export function openEarnest(size: Exclude<EarnestSize, 'rest'> = 'dock', opts: { prompt?: string } = {}) {
	if (opts.prompt !== undefined) _initialPrompt.value = opts.prompt;
	_mode.value = size;
}

/**
 * Change the size in place. This is a VIEW change only — it must never touch
 * the active conversation. 'rest' collapses the overlay (keeps the thread in
 * memory so re-opening resumes it).
 */
export function setEarnestSize(size: EarnestSize) {
	_mode.value = size;
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
