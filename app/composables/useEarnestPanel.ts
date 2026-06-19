/**
 * useEarnestPanel — single source of truth for the unified Earnest panel's
 * open state. Both legacy entry points funnel through these refs:
 *   - `useAITray` (general/global open, with an optional initial prompt)
 *   - `useEntityPageContext.sidebarOpen` (per-entity open from detail pages)
 * are now thin aliases of `panelOpen`, so every existing trigger drives the
 * one panel. The panel itself decides entity-vs-route context via
 * `useEarnestAwareness`.
 */
export const panelOpen = ref(false);
export const panelInitialPrompt = ref('');

export function openEarnestPanel(prompt = '') {
	panelInitialPrompt.value = prompt;
	panelOpen.value = true;
}

export function closeEarnestPanel() {
	panelOpen.value = false;
	panelInitialPrompt.value = '';
}

export function useEarnestPanel() {
	return { panelOpen, panelInitialPrompt, openEarnestPanel, closeEarnestPanel };
}
