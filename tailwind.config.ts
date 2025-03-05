import type { Config } from 'tailwindcss';
// import plugin from 'tailwindcss/plugin';
import tailwindcssForms from '@tailwindcss/forms';
import defaultTheme from 'tailwindcss/defaultTheme';

module.exports = {
	darkMode: ['class', 'class'],
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
			borderColor: {
				DEFAULT: 'transparent',
			},
			ringColor: {
				DEFAULT: 'transparent',
			},
			borderRadius: {
				large: '30px',
				card: 'var(--border-radius-card)',
				button: 'var(--border-radius-button)',
				input: 'var(--border-radius-input)',
				panel: 'var(--border-radius-panel)',
			},
			colors: {
				turquoise: {
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
				body: ['Proxima Nova W01 Light', 'Helvetica Neue', 'Helvetica', 'Roboto', 'Arial', 'sans-serif'],
				bold: ['Proxima Nova W01 Regular', 'Helvetica Neue', 'Helvetica', 'Roboto', 'Arial', 'sans-serif'],
				sans: ['Proxima Nova W01 Light', 'Helvetica Neue', 'Helvetica', 'Roboto', 'Arial', 'sans-serif'],
				display: ['var(--font-display)', ...defaultTheme.fontFamily.serif],
				mono: ['var(--font-mono)', ...defaultTheme.fontFamily.mono],
				signature: ['var(--font-signature)', 'cursive', 'sans-serif'],
			},
			fontWeight: {
				light: '300',
				regular: '400',
				medium: '500',
				bold: '500',
				black: '900',
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
		// plugin(function ({ addUtilities }) {
		// 	addUtilities({
		// 		'.no-scrollbar': {
		// 			'-ms-overflow-style': 'none' /* IE and Edge */,
		// 			'scrollbar-width': 'none' /* Firefox */,
		// 			'&::-webkit-scrollbar': {
		// 				display: 'none' /* Chrome, Safari and Opera */,
		// 			},
		// 		},
		// 	});
		// }),
	],
} satisfies Config;
