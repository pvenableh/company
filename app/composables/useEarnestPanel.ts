/**
 * useEarnestPanel — compatibility shim over useEarnest.
 *
 * The docked panel has been RETIRED. These exports are kept so every existing
 * caller (entity detail pages via useEntityPageContext, the presence home, the
 * meeting room, EntityEarnestCard's prompt pills) keeps working — but they now
 * open Earnest's full-screen Focus surface instead of a side panel. `panelOpen`
 * therefore tracks the 'full' size; there is no separate 'dock' state anymore.
 */
import { earnestMode, earnestInitialPrompt, earnestPendingSession, openEarnest, closeEarnest } from '~/composables/useEarnest';

export const panelOpen = computed<boolean>({
	get: () => earnestMode.value === 'full',
	set: (v: boolean) => {
		if (v) openEarnest('full');
		else if (earnestMode.value === 'full') closeEarnest();
	},
});

export const panelInitialPrompt = earnestInitialPrompt;

export function openEarnestPanel(prompt = '') {
	openEarnest('full', { prompt });
}

/** Open Focus and restore a specific past conversation into it. */
export function openEarnestSession(sessionId: string) {
	earnestPendingSession.value = sessionId;
	openEarnest('full');
}

export function closeEarnestPanel() {
	if (earnestMode.value === 'full') closeEarnest();
}

export function useEarnestPanel() {
	return { panelOpen, panelInitialPrompt, openEarnestPanel, closeEarnestPanel };
}
