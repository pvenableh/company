/**
 * useEarnestPanel — compatibility shim over useEarnest.
 *
 * The docked panel is Earnest at size 'dock'. These exports keep every existing
 * caller (FloatingDock, entity detail pages via useEntityPageContext, the
 * presence home, meeting room) working while the single presence state lives in
 * useEarnest. `panelOpen` maps to the 'dock' size specifically, so it never
 * fights the full-screen 'full' size (they are mutually exclusive by mode).
 */
import { earnestMode, earnestInitialPrompt, earnestPendingSession, openEarnest, closeEarnest } from '~/composables/useEarnest';

export const panelOpen = computed<boolean>({
	get: () => earnestMode.value === 'dock',
	set: (v: boolean) => {
		if (v) openEarnest('dock');
		else if (earnestMode.value === 'dock') closeEarnest();
	},
});

export const panelInitialPrompt = earnestInitialPrompt;

export function openEarnestPanel(prompt = '') {
	openEarnest('dock', { prompt });
}

/** Open the docked panel and restore a specific past conversation into it. */
export function openEarnestSession(sessionId: string) {
	earnestPendingSession.value = sessionId;
	openEarnest('dock');
}

export function closeEarnestPanel() {
	// Only dismiss when actually docked — a no-op at 'full' so that opening focus
	// (which may be followed by a legacy closeEarnestPanel() call) isn't undone.
	if (earnestMode.value === 'dock') closeEarnest();
}

export function useEarnestPanel() {
	return { panelOpen, panelInitialPrompt, openEarnestPanel, closeEarnestPanel };
}
