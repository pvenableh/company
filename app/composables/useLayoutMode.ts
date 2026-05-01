/**
 * Layout Mode System for Earnest.
 *
 * User-selectable navigation layouts:
 *   1. 'spaces' — macOS-style sidebar + inspector panel (default)
 *   2. 'focus'  — Spark/Superhuman-style unified inbox + reading pane
 *
 * Hidden modes (kept in source for revival, not shown in picker):
 *   - 'tabs' — iPadOS-style 5-tab bar + contextual panel
 *   - 'home' — Apple TV-style grid home + breadcrumb drill-down
 *
 * Persists to localStorage + Directus user profile.
 */

export type LayoutMode = 'spaces' | 'focus' | 'tabs' | 'home';

export interface LayoutModeDefinition {
	id: LayoutMode;
	name: string;
	description: string;
	icon: string;
	hidden?: boolean;
}

const LAYOUT_MODES: LayoutModeDefinition[] = [
	{
		id: 'spaces',
		name: 'Spaces',
		description: 'Sidebar with grouped sections + inspector panel',
		icon: 'i-lucide-panel-left',
	},
	{
		id: 'focus',
		name: 'Focus',
		description: 'Unified inbox — one thing at a time, Spark-style',
		icon: 'i-lucide-inbox',
	},
	{
		id: 'tabs',
		name: 'Tabs',
		description: 'Five top tabs for instant domain switching',
		icon: 'i-lucide-layout-grid',
		hidden: true,
	},
	{
		id: 'home',
		name: 'Home',
		description: 'Card grid with drill-down navigation',
		icon: 'i-lucide-layout-dashboard',
		hidden: true,
	},
];

const STORAGE_KEY = 'earnest-layout-mode';

export function useLayoutMode() {
	const currentMode = useState<LayoutMode>('earnest-layout-mode', () => 'spaces');

	const setMode = (mode: LayoutMode) => {
		const valid = LAYOUT_MODES.find((m) => m.id === mode);
		if (!valid) return;

		currentMode.value = mode;

		if (import.meta.client) {
			localStorage.setItem(STORAGE_KEY, mode);
		}
	};

	const initLayoutMode = () => {
		if (!import.meta.client) return;

		const saved = localStorage.getItem(STORAGE_KEY) as LayoutMode | null;
		if (saved && LAYOUT_MODES.some((m) => m.id === saved)) {
			currentMode.value = saved;
		}
	};

	const visibleModes = LAYOUT_MODES.filter((m) => !m.hidden);

	return {
		modes: LAYOUT_MODES,
		visibleModes,
		currentMode: readonly(currentMode),
		setMode,
		initLayoutMode,
	};
}
