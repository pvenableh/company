import type { Config } from 'tailwindcss';
import tailwindcssForms from '@tailwindcss/forms';
import defaultTheme from 'tailwindcss/defaultTheme';

module.exports = {
	darkMode: 'class',
	colors: {
		primary: '#00efd1',
		blue: '#00bfff',
		red: '#e32020',
		pink: '#fb00da',
		green: '#00ff1b',
		yellow: '#fff500',
        turquoise: '#00efd1',
	},
	container: {
		center: true,
	},
	content: [
		'./components/**/*.{vue,js,ts}',
		'./layouts/**/*.vue',
		'./pages/**/*.vue',
		'./app.vue',
		'./plugins/**/*.{js,ts}',
		`./App.{js,ts,vue}`,
		`./app.{js,ts,vue}`,
		`./nuxt.config.{js,ts}`,
	],
	theme: {
		extend: {
            borderRadius: {
				large: '30px',
				card: 'var(--border-radius-card)',
				button: 'var(--border-radius-button)',
				input: 'var(--border-radius-input)',
				panel: 'var(--border-radius-panel)',
			},
			colors: {
				'turquoise':  {
					100: '#edfffc',
					200: '#c0fff8',
					300: '#81fff3',
					400: '#3affed',
					500: '#00efd1',
					600: '#00e2c7',
					700: '#00b7a5',
					800: '#009184',
					900: '#00726a',
				}, 
			},
			fontFamily: {
				sans: ['var(--font-sans)', ...defaultTheme.fontFamily.sans],
				display: ['var(--font-display)', ...defaultTheme.fontFamily.serif],
				mono: ['var(--font-mono)', ...defaultTheme.fontFamily.mono],
				signature: ['var(--font-signature)', 'cursive', 'sans-serif'],
			},
            letterSpacing: {
				tightest: '-.075em',
				tighter: '-.05em',
				tight: '-.025em',
				normal: '0',
				wide: '.1em',
				wider: '.2em',
				widest: '.4em',
			},
		},
	},
	variants: {
		extend: {},
	},
    plugins: [
		tailwindcssForms,
		// Formkit Plugin for Tailwind
		// https://formkit.com/guides/create-a-tailwind-theme
		// require('@formkit/themes/tailwindcss'),
	],
} satisfies Config;
