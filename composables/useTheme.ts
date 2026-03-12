/**
 * Universal Theme System for Earnest.
 *
 * Two independent axes:
 *   1. Color theme — `data-theme` on <html> (earnest, midnight, dawn, ocean)
 *   2. Style variant — `data-style` on <html> (modern, classic)
 *
 * Usage:
 *   const { currentTheme, setTheme, currentStyle, setStyle, themes, styles } = useTheme()
 *   setTheme('midnight')
 *   setStyle('classic')
 */

export interface ThemeDefinition {
	id: string;
	name: string;
	description: string;
	/** Preview swatch colors shown in the theme picker */
	swatches: string[];
}

export interface StyleDefinition {
	id: string;
	name: string;
	description: string;
}

/** Registry of available color themes. CSS lives in assets/css/themes.css */
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

/** Registry of typographic style variants */
const styles: StyleDefinition[] = [
	{
		id: 'modern',
		name: 'Modern',
		description: 'Proxima Nova, uppercase, tracked-out',
	},
	{
		id: 'classic',
		name: 'Classic',
		description: 'Bauer Bodoni, mixed-case, editorial',
	},
];

const THEME_KEY = 'earnest-theme';
const STYLE_KEY = 'earnest-style';

export function useTheme() {
	const currentTheme = useState<string>('earnest-theme', () => 'earnest');
	const currentStyle = useState<string>('earnest-style', () => 'modern');

	const setTheme = (themeId: string) => {
		const exists = themes.find((t) => t.id === themeId);
		if (!exists) return;

		currentTheme.value = themeId;

		if (import.meta.client) {
			document.documentElement.setAttribute('data-theme', themeId);
			localStorage.setItem(THEME_KEY, themeId);
		}
	};

	const setStyle = (styleId: string) => {
		const exists = styles.find((s) => s.id === styleId);
		if (!exists) return;

		currentStyle.value = styleId;

		if (import.meta.client) {
			document.documentElement.setAttribute('data-style', styleId);
			localStorage.setItem(STYLE_KEY, styleId);
		}
	};

	/** Restore saved theme + style on client hydration */
	const initTheme = () => {
		if (!import.meta.client) return;

		const savedTheme = localStorage.getItem(THEME_KEY) || 'earnest';
		currentTheme.value = savedTheme;
		document.documentElement.setAttribute('data-theme', savedTheme);

		const savedStyle = localStorage.getItem(STYLE_KEY) || 'modern';
		currentStyle.value = savedStyle;
		document.documentElement.setAttribute('data-style', savedStyle);
	};

	return {
		themes,
		styles,
		currentTheme: readonly(currentTheme),
		currentStyle: readonly(currentStyle),
		setTheme,
		setStyle,
		initTheme,
	};
}
