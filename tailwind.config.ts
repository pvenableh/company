import type { Config } from 'tailwindcss';
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
    			DEFAULT: 'transparent'
    		},
    		ringColor: {
    			DEFAULT: 'transparent'
    		},
    		borderRadius: {
    			large: '30px',
    			card: 'var(--border-radius-card)',
    			button: 'var(--border-radius-button)',
    			input: 'var(--border-radius-input)',
    			panel: 'var(--border-radius-panel)',
    			lg: 'var(--radius)',
    			md: 'calc(var(--radius) - 2px)',
    			sm: 'calc(var(--radius) - 4px)'
    		},
    		colors: {
    			turquoise: {
    				'100': '#edfffc',
    				'200': '#c0fff8',
    				'300': '#81fff3',
    				'400': '#3affed',
    				'500': '#00efd1',
    				'600': '#00e2c7',
    				'700': '#00b7a5',
    				'800': '#009184',
    				'900': '#00726a'
    			},
    			background: 'hsl(var(--background))',
    			foreground: 'hsl(var(--foreground))',
    			card: {
    				DEFAULT: 'hsl(var(--card))',
    				foreground: 'hsl(var(--card-foreground))'
    			},
    			popover: {
    				DEFAULT: 'hsl(var(--popover))',
    				foreground: 'hsl(var(--popover-foreground))'
    			},
    			primary: {
    				DEFAULT: 'hsl(var(--primary))',
    				foreground: 'hsl(var(--primary-foreground))'
    			},
    			secondary: {
    				DEFAULT: 'hsl(var(--secondary))',
    				foreground: 'hsl(var(--secondary-foreground))'
    			},
    			muted: {
    				DEFAULT: 'hsl(var(--muted))',
    				foreground: 'hsl(var(--muted-foreground))'
    			},
    			accent: {
    				DEFAULT: 'hsl(var(--accent))',
    				foreground: 'hsl(var(--accent-foreground))'
    			},
    			destructive: {
    				DEFAULT: 'hsl(var(--destructive))',
    				foreground: 'hsl(var(--destructive-foreground))'
    			},
    			border: 'hsl(var(--border))',
    			input: 'hsl(var(--input))',
    			ring: 'hsl(var(--ring))',
    			chart: {
    				'1': 'hsl(var(--chart-1))',
    				'2': 'hsl(var(--chart-2))',
    				'3': 'hsl(var(--chart-3))',
    				'4': 'hsl(var(--chart-4))',
    				'5': 'hsl(var(--chart-5))'
    			}
    		},
    		fontFamily: {
    			body: [
    				'var(--font-body)',
                    ...defaultTheme.fontFamily.sans
                ],
    			bold: [
    				'var(--font-bold)',
                    ...defaultTheme.fontFamily.sans
                ],
    			sans: [
    				'var(--font-sans)',
                    ...defaultTheme.fontFamily.sans
                ],
    			display: [
    				'var(--font-display)',
                    ...defaultTheme.fontFamily.serif
                ],
    			mono: [
    				'var(--font-mono)',
                    ...defaultTheme.fontFamily.mono
                ],
    			signature: [
    				'var(--font-signature)',
    				'cursive',
    				'sans-serif'
    			]
    		},
    		fontWeight: {
    			light: '300',
    			regular: '400',
    			medium: '500',
    			bold: '500',
    			black: '900'
    		},
    		letterSpacing: {
    			tightest: '-.075em',
    			tighter: '-.05em',
    			tight: '-.025em',
    			normal: '0',
    			wide: '.1em',
    			wider: '.2em',
    			widest: '.4em'
    		}
    	}
    },
	variants: {
		extend: {},
	},
	plugins: [
		tailwindcssForms,
        require("tailwindcss-animate")
    ],
} satisfies Config;
