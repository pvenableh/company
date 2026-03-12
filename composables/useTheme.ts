/**
 * Universal Theme System for Earnest.
 *
 * Each theme is a named set of CSS custom-property overrides applied via
 * `data-theme` on <html>. Adding a new theme is one object in `themes`.
 *
 * Usage:
 *   const { currentTheme, setTheme, themes } = useTheme()
 *   setTheme('midnight')
 */

export interface ThemeDefinition {
	id: string;
	name: string;
	description: string;
	/** Preview swatch colors shown in the theme picker */
	swatches: string[];
}

/** Registry of available themes. CSS lives in assets/css/themes.css */
const themes: ThemeDefinition[] = [
	{
		id: 'earnest',
		name: 'Earnest',
		description: 'Warm neutrals with a quiet confidence',
		swatches: ['#1a1a1a', '#e8e4df', '#3d3d3d', '#c4a882'],
	},
	{
		id: 'midnight',
		name: 'Midnight',
		description: 'Deep blues for late-night focus',
		swatches: ['#0f172a', '#1e293b', '#3b82f6', '#60a5fa'],
	},
	{
		id: 'dawn',
		name: 'Dawn',
		description: 'Soft peach tones for a fresh start',
		swatches: ['#fffbf5', '#fef0e3', '#e67e45', '#d4a27f'],
	},
	{
		id: 'ocean',
		name: 'Ocean',
		description: 'Cool teals inspired by deep water',
		swatches: ['#f0fdfa', '#ccfbf1', '#0d9488', '#14b8a6'],
	},
];

const STORAGE_KEY = 'earnest-theme';

export function useTheme() {
	const currentTheme = useState<string>('earnest-theme', () => 'earnest');

	const setTheme = (themeId: string) => {
		const exists = themes.find((t) => t.id === themeId);
		if (!exists) return;

		currentTheme.value = themeId;

		if (import.meta.client) {
			document.documentElement.setAttribute('data-theme', themeId);
			localStorage.setItem(STORAGE_KEY, themeId);
		}
	};

	/** Restore saved theme on client hydration */
	const initTheme = () => {
		if (!import.meta.client) return;

		const saved = localStorage.getItem(STORAGE_KEY) || 'earnest';
		currentTheme.value = saved;
		document.documentElement.setAttribute('data-theme', saved);
	};

	return {
		themes,
		currentTheme: readonly(currentTheme),
		setTheme,
		initTheme,
	};
}
