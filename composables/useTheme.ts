/**
 * Universal Theme System for Earnest.
 *
 * Three independent axes:
 *   1. Color theme — `data-theme` on <html> (earnest, midnight, dawn, ocean, mono)
 *   2. Style variant — `data-style` on <html> (modern, classic)
 *   3. Mono hue — when theme is 'mono', a custom hue (0–360) drives all colors
 *
 * Usage:
 *   const { currentTheme, setTheme, currentStyle, setStyle, themes, styles } = useTheme()
 *   setTheme('midnight')
 *   setStyle('classic')
 *   setMonoHue(220)  // deep blue monochrome
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

export interface MonoPreset {
	name: string;
	hue: number;
	/** Preview color at S:60 L:50 */
	color: string;
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
	{
		id: 'mono',
		name: 'Mono',
		description: 'One hue, every shade — your color',
		swatches: [], // dynamically generated
	},
	{
		id: 'chromatic',
		name: 'Chromatic',
		description: 'Rich multi-hue palette from one base color',
		swatches: [], // dynamically generated
	},
];

/** Curated mono presets — hues that look great monochromatic */
const monoPresets: MonoPreset[] = [
	{ name: 'Slate', hue: 215, color: 'hsl(215, 60%, 50%)' },
	{ name: 'Rose', hue: 350, color: 'hsl(350, 60%, 50%)' },
	{ name: 'Amber', hue: 38, color: 'hsl(38, 60%, 50%)' },
	{ name: 'Emerald', hue: 155, color: 'hsl(155, 60%, 50%)' },
	{ name: 'Violet', hue: 270, color: 'hsl(270, 60%, 50%)' },
	{ name: 'Indigo', hue: 235, color: 'hsl(235, 60%, 50%)' },
	{ name: 'Coral', hue: 15, color: 'hsl(15, 60%, 50%)' },
	{ name: 'Teal', hue: 175, color: 'hsl(175, 60%, 50%)' },
	{ name: 'Plum', hue: 300, color: 'hsl(300, 60%, 50%)' },
	{ name: 'Sky', hue: 200, color: 'hsl(200, 60%, 50%)' },
];

/** Registry of typographic style variants */
const styles: StyleDefinition[] = [
	{
		id: 'modern',
		name: 'Modern',
		description: 'Sans-serif, uppercase, tracked-out — Apple-like gallery aesthetic',
	},
	{
		id: 'classic',
		name: 'Classic',
		description: 'Serif titles, sentence case, warm tones — editorial / fashion',
	},
	{
		id: 'casual',
		name: 'Casual',
		description: 'Handwritten headers (Gaegu), relaxed spacing — friendly & approachable',
	},
];

const THEME_KEY = 'earnest-theme';
const STYLE_KEY = 'earnest-style';
const MONO_HUE_KEY = 'earnest-mono-hue';

/**
 * Generate a complete set of CSS custom property values from a single hue.
 * Returns an object keyed by CSS variable name (without --) with HSL values.
 */
function generateMonoPalette(hue: number) {
	const h = Math.round(hue % 360);

	// Light mode palette — all derived from one hue
	const light = {
		background: `${h} 20% 98%`,
		foreground: `${h} 15% 10%`,
		card: `${h} 10% 100%`,
		'card-foreground': `${h} 15% 10%`,
		popover: `${h} 10% 100%`,
		'popover-foreground': `${h} 15% 10%`,
		primary: `${h} 55% 42%`,
		'primary-foreground': `0 0% 100%`,
		secondary: `${h} 18% 92%`,
		'secondary-foreground': `${h} 15% 12%`,
		muted: `${h} 18% 92%`,
		'muted-foreground': `${h} 10% 46%`,
		accent: `${h} 18% 92%`,
		'accent-foreground': `${h} 15% 12%`,
		destructive: `0 72% 51%`,
		'destructive-foreground': `0 0% 100%`,
		border: `${h} 14% 88%`,
		input: `${h} 14% 88%`,
		ring: `${h} 55% 42%`,
		'chart-1': `${h} 55% 42%`,
		'chart-2': `${h} 45% 52%`,
		'chart-3': `${h} 35% 62%`,
		'chart-4': `${h} 60% 35%`,
		'chart-5': `${h} 25% 72%`,
		'sidebar-background': `${h} 15% 96%`,
		'sidebar-foreground': `${h} 15% 12%`,
		'sidebar-primary': `${h} 55% 42%`,
		'sidebar-primary-foreground': `0 0% 100%`,
		'sidebar-accent': `${h} 18% 92%`,
		'sidebar-accent-foreground': `${h} 15% 12%`,
		'sidebar-border': `${h} 14% 88%`,
		'sidebar-ring': `${h} 55% 42%`,
		success: `142 76% 36%`,
		'success-foreground': `0 0% 100%`,
		warning: `38 92% 50%`,
		'warning-foreground': `0 0% 0%`,
	};

	// Dark mode palette
	const dark = {
		background: `${h} 15% 7%`,
		foreground: `${h} 12% 92%`,
		card: `${h} 12% 10%`,
		'card-foreground': `${h} 12% 92%`,
		popover: `${h} 12% 10%`,
		'popover-foreground': `${h} 12% 92%`,
		primary: `${h} 50% 60%`,
		'primary-foreground': `${h} 15% 7%`,
		secondary: `${h} 10% 15%`,
		'secondary-foreground': `${h} 12% 92%`,
		muted: `${h} 10% 15%`,
		'muted-foreground': `${h} 8% 55%`,
		accent: `${h} 10% 15%`,
		'accent-foreground': `${h} 12% 92%`,
		destructive: `0 62.8% 30.6%`,
		'destructive-foreground': `${h} 12% 92%`,
		border: `${h} 10% 18%`,
		input: `${h} 10% 18%`,
		ring: `${h} 50% 60%`,
		'chart-1': `${h} 50% 60%`,
		'chart-2': `${h} 40% 50%`,
		'chart-3': `${h} 30% 55%`,
		'chart-4': `${h} 55% 45%`,
		'chart-5': `${h} 20% 65%`,
		'sidebar-background': `${h} 15% 8%`,
		'sidebar-foreground': `${h} 12% 92%`,
		'sidebar-primary': `${h} 50% 60%`,
		'sidebar-primary-foreground': `${h} 15% 7%`,
		'sidebar-accent': `${h} 10% 14%`,
		'sidebar-accent-foreground': `${h} 12% 92%`,
		'sidebar-border': `${h} 10% 18%`,
		'sidebar-ring': `${h} 50% 60%`,
	};

	return { light, dark };
}

/**
 * Inject generated mono CSS variables into the document.
 */
function applyMonoPalette(hue: number) {
	if (!import.meta.client) return;

	const { light, dark } = generateMonoPalette(hue);
	const root = document.documentElement;

	// Remove any previously injected mono style
	let styleEl = document.getElementById('mono-theme-vars') as HTMLStyleElement | null;
	if (!styleEl) {
		styleEl = document.createElement('style');
		styleEl.id = 'mono-theme-vars';
		document.head.appendChild(styleEl);
	}

	// Build CSS text for light & dark
	const lightVars = Object.entries(light)
		.map(([k, v]) => `  --${k}: ${v};`)
		.join('\n');
	const darkVars = Object.entries(dark)
		.map(([k, v]) => `  --${k}: ${v};`)
		.join('\n');

	styleEl.textContent = `
[data-theme='mono'] {
  --radius: 0.75rem;
${lightVars}
}
[data-theme='mono'] .dark {
${darkVars}
}`;
}

/** Remove injected mono CSS */
function removeMonoPalette() {
	if (!import.meta.client) return;
	const styleEl = document.getElementById('mono-theme-vars');
	if (styleEl) styleEl.remove();
}

/**
 * Generate a chromatic (multi-hue) palette from a single base hue.
 * Unlike mono which uses ONE hue everywhere, chromatic spreads colors
 * across the color wheel using color theory relationships:
 *   - Primary:   base hue
 *   - Accent:    split-complementary (+150°)
 *   - Secondary: analogous (+30°)
 *   - Charts:    triadic & tetradic positions for visual variety
 */
function generateChromaticPalette(hue: number) {
	const h = Math.round(hue % 360);
	const complement = (h + 150) % 360;  // split-complementary
	const analogous = (h + 30) % 360;
	const triadic1 = (h + 120) % 360;
	const triadic2 = (h + 240) % 360;
	const tetradic = (h + 90) % 360;

	const light = {
		background: `${h} 18% 98%`,
		foreground: `${h} 12% 10%`,
		card: `${h} 8% 100%`,
		'card-foreground': `${h} 12% 10%`,
		popover: `${h} 8% 100%`,
		'popover-foreground': `${h} 12% 10%`,
		primary: `${h} 65% 42%`,
		'primary-foreground': `0 0% 100%`,
		secondary: `${analogous} 25% 92%`,
		'secondary-foreground': `${analogous} 20% 14%`,
		muted: `${h} 14% 93%`,
		'muted-foreground': `${h} 8% 46%`,
		accent: `${complement} 45% 92%`,
		'accent-foreground': `${complement} 30% 14%`,
		destructive: `0 72% 51%`,
		'destructive-foreground': `0 0% 100%`,
		border: `${h} 12% 88%`,
		input: `${h} 12% 88%`,
		ring: `${h} 65% 42%`,
		'chart-1': `${h} 65% 42%`,
		'chart-2': `${complement} 55% 48%`,
		'chart-3': `${triadic1} 50% 52%`,
		'chart-4': `${triadic2} 45% 46%`,
		'chart-5': `${tetradic} 50% 50%`,
		'sidebar-background': `${h} 12% 96%`,
		'sidebar-foreground': `${h} 12% 12%`,
		'sidebar-primary': `${h} 65% 42%`,
		'sidebar-primary-foreground': `0 0% 100%`,
		'sidebar-accent': `${complement} 20% 93%`,
		'sidebar-accent-foreground': `${complement} 20% 14%`,
		'sidebar-border': `${h} 12% 88%`,
		'sidebar-ring': `${h} 65% 42%`,
		success: `142 76% 36%`,
		'success-foreground': `0 0% 100%`,
		warning: `38 92% 50%`,
		'warning-foreground': `0 0% 0%`,
	};

	const dark = {
		background: `${h} 12% 7%`,
		foreground: `${h} 10% 92%`,
		card: `${h} 10% 10%`,
		'card-foreground': `${h} 10% 92%`,
		popover: `${h} 10% 10%`,
		'popover-foreground': `${h} 10% 92%`,
		primary: `${h} 60% 60%`,
		'primary-foreground': `${h} 12% 7%`,
		secondary: `${analogous} 12% 16%`,
		'secondary-foreground': `${analogous} 15% 90%`,
		muted: `${h} 8% 16%`,
		'muted-foreground': `${h} 6% 55%`,
		accent: `${complement} 15% 16%`,
		'accent-foreground': `${complement} 12% 90%`,
		destructive: `0 62.8% 30.6%`,
		'destructive-foreground': `${h} 10% 92%`,
		border: `${h} 8% 18%`,
		input: `${h} 8% 18%`,
		ring: `${h} 60% 60%`,
		'chart-1': `${h} 60% 60%`,
		'chart-2': `${complement} 50% 55%`,
		'chart-3': `${triadic1} 45% 55%`,
		'chart-4': `${triadic2} 40% 50%`,
		'chart-5': `${tetradic} 45% 55%`,
		'sidebar-background': `${h} 12% 8%`,
		'sidebar-foreground': `${h} 10% 92%`,
		'sidebar-primary': `${h} 60% 60%`,
		'sidebar-primary-foreground': `${h} 12% 7%`,
		'sidebar-accent': `${complement} 10% 14%`,
		'sidebar-accent-foreground': `${complement} 10% 90%`,
		'sidebar-border': `${h} 8% 18%`,
		'sidebar-ring': `${h} 60% 60%`,
	};

	return { light, dark };
}

/**
 * Inject generated chromatic CSS variables into the document.
 */
function applyChromaticPalette(hue: number) {
	if (!import.meta.client) return;

	const { light, dark } = generateChromaticPalette(hue);

	let styleEl = document.getElementById('chromatic-theme-vars') as HTMLStyleElement | null;
	if (!styleEl) {
		styleEl = document.createElement('style');
		styleEl.id = 'chromatic-theme-vars';
		document.head.appendChild(styleEl);
	}

	const lightVars = Object.entries(light)
		.map(([k, v]) => `  --${k}: ${v};`)
		.join('\n');
	const darkVars = Object.entries(dark)
		.map(([k, v]) => `  --${k}: ${v};`)
		.join('\n');

	styleEl.textContent = `
[data-theme='chromatic'] {
  --radius: 0.75rem;
${lightVars}
}
[data-theme='chromatic'] .dark {
${darkVars}
}`;
}

/** Remove injected chromatic CSS */
function removeChromaticPalette() {
	if (!import.meta.client) return;
	const styleEl = document.getElementById('chromatic-theme-vars');
	if (styleEl) styleEl.remove();
}

export function useTheme() {
	const currentTheme = useState<string>('earnest-theme', () => 'earnest');
	const currentStyle = useState<string>('earnest-style', () => 'modern');
	const monoHue = useState<number>('earnest-mono-hue', () => 215);

	/** Dynamic themes that generate CSS from a hue value */
	const dynamicThemes = ['mono', 'chromatic'];

	const setTheme = (themeId: string) => {
		if (!dynamicThemes.includes(themeId)) {
			const exists = themes.find((t) => t.id === themeId);
			if (!exists) return;
		}

		// Clean up any previously injected dynamic styles
		removeMonoPalette();
		removeChromaticPalette();

		currentTheme.value = themeId;

		if (import.meta.client) {
			document.documentElement.setAttribute('data-theme', themeId);
			localStorage.setItem(THEME_KEY, themeId);

			// Apply dynamic palette if needed
			if (themeId === 'mono') {
				applyMonoPalette(monoHue.value);
			} else if (themeId === 'chromatic') {
				applyChromaticPalette(monoHue.value);
			}
		}
	};

	const setMonoHue = (hue: number) => {
		monoHue.value = Math.round(hue % 360);

		if (import.meta.client) {
			localStorage.setItem(MONO_HUE_KEY, String(monoHue.value));

			// Update palette live for whichever dynamic theme is active
			if (currentTheme.value === 'mono') {
				applyMonoPalette(monoHue.value);
			} else if (currentTheme.value === 'chromatic') {
				applyChromaticPalette(monoHue.value);
			}
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

		// Restore mono hue first (before theme, in case theme is mono)
		const savedHue = localStorage.getItem(MONO_HUE_KEY);
		if (savedHue) monoHue.value = parseInt(savedHue, 10) || 215;

		const savedTheme = localStorage.getItem(THEME_KEY) || 'earnest';
		currentTheme.value = savedTheme;
		document.documentElement.setAttribute('data-theme', savedTheme);

		// If dynamic theme, inject the CSS palette
		if (savedTheme === 'mono') {
			applyMonoPalette(monoHue.value);
		} else if (savedTheme === 'chromatic') {
			applyChromaticPalette(monoHue.value);
		}

		const savedStyle = localStorage.getItem(STYLE_KEY) || 'modern';
		currentStyle.value = savedStyle;
		document.documentElement.setAttribute('data-style', savedStyle);
	};

	return {
		themes,
		styles,
		monoPresets,
		currentTheme: readonly(currentTheme),
		currentStyle: readonly(currentStyle),
		monoHue: readonly(monoHue),
		setTheme,
		setStyle,
		setMonoHue,
		initTheme,
		generateMonoPalette,
		generateChromaticPalette,
	};
}
