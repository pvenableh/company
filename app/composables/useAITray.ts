/**
 * useAITray — compatibility shim. The standalone AI tray has been unified into
 * the single Earnest panel (see useEarnestPanel). These exports now alias the
 * shared panel state so existing callers (FloatingDock, FocusInbox, dashboard
 * suggestion cards, meeting room) keep opening the one panel.
 */
import { panelOpen, panelInitialPrompt, openEarnestPanel, closeEarnestPanel } from '~/composables/useEarnestPanel';

export const aiTrayOpen = panelOpen;
export const aiTrayInitialPrompt = panelInitialPrompt;
export const openAITray = openEarnestPanel;
export const closeAITray = closeEarnestPanel;
