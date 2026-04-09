/**
 * Layout Mode System for Earnest.
 *
 * Three switchable navigation layouts:
 *   1. 'spaces'  — macOS-style 3-space sidebar + inspector panel (default)
 *   2. 'tabs'    — iPadOS-style 5-tab bar + contextual panel
 *   3. 'home'    — Apple TV-style grid home + breadcrumb drill-down
 *
 * Persists to localStorage + Directus user profile.
 */

export type LayoutMode = 'spaces' | 'tabs' | 'home';

export interface LayoutModeDefinition {
	id: LayoutMode;
	name: string;
	description: string;
	icon: string;
}

const LAYOUT_MODES: LayoutModeDefinition[] = [
	{
		id: 'spaces',
		name: 'Spaces',
		description: 'Sidebar with grouped sections + inspector panel',
		icon: 'i-lucide-panel-left',
	},
	{
		id: 'tabs',
		name: 'Tabs',
		description: 'Five top tabs for instant domain switching',
		icon: 'i-lucide-layout-grid',
	},
	{
		id: 'home',
		name: 'Home',
		description: 'Card grid with drill-down navigation',
		icon: 'i-lucide-layout-dashboard',
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

	return {
		modes: LAYOUT_MODES,
		currentMode: readonly(currentMode),
		setMode,
		initLayoutMode,
	};
}
