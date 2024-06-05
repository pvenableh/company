// import { formatFonts } from './utils/fonts';
// import { theme } from './theme';

export default defineNuxtConfig({
	ssr: true,
	nitro: {
		preset: 'vercel-edge',
	},
	app: {
		pageTransition: { name: 'page', mode: 'out-in' },
	},
	// components: {
	// 	global: true,
	// 	dirs: ['~/components'],
	// },

	css: ['~/assets/css/tailwind.css', '~/assets/css/main.css'],

	modules: [
		'@formkit/nuxt',
		'@nuxt/devtools',
		'@nuxt/image',
		'@nuxt/ui',
		'@nuxtjs/color-mode',
		'@vueuse/motion/nuxt',
		'@vueuse/nuxt',
		'nuxt-directus-next',
		'nuxt-icon',
		'nuxt-gtag',
		'@nuxtjs/seo',
		// '@nuxtjs/tailwindcss', // https://tailwindcss.nuxtjs.org/ Removed because of Nuxt UI already includes this
	],

	// experimental: {
	// 	componentIslands: true,
	// 	asyncContext: true, // https://nuxt.com/docs/guide/going-further/experimental-features#asynccontext
	// },

	runtimeConfig: {
		public: {
			assetsUrl: process.env.DIRECTUS_ASSETS_URL || 'https://admin.huestudios.company/assets/',
			websocketUrl: process.env.DIRECTUS_WEBSOCKET_URL || 'wss://admin.huestudios.company/websocket',
			staticToken: process.env.DIRECTUS_SERVER_TOKEN || 'X5lSYDCwpp88nvSepjFIWlq4ypbtxY-1',
			siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000',
			adminUrl: process.env.DIRECTUS_URL || 'https://admin.huestudios.company',
		},
	},

	gtag: {
		id: 'G-Y5YQ3FM1FL',
	},

	// Directus Configuration
	directus: {
		url: 'https://admin.huestudios.company',
		moduleConfig: {
			autoImport: true,
			autoRefresh: {
				redirectTo: '/auth/signin',
			},
			devtools: true,
			readMeQuery: {
				fields: ['*,organizations.organizations_id.id,organizations.organizations_id.name'],
				updateState: true,
			},
		},
	},

	plugins: [],

	// Nuxt DevTools - https://devtools.nuxtjs.org/
	devtools: { enabled: true },

	ui: {
		icons: ['heroicons', 'wi', 'meteocons'],
	},

	// Color Mode Configuration - https://color-mode.nuxtjs.org/
	colorMode: {
		preference: 'system',
		classSuffix: '', // This is so we play nice with TailwindCSS
	},

	// Image Configuration - https://image.nuxt.com/providers/directus
	image: {
		provider: 'directus',
		directus: {
			baseURL: `${process.env.DIRECTUS_URL}/assets/`,
		},
	},

	site: {
		url: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000',
		name: 'hue: manage',
		description: 'Welcome to the optimal project management tool for creatives.',
		defaultLocale: 'en', // not needed if you have @nuxtjs/i18n installed
	},

	// Sitemap Configuration - https://nuxtseo.com/sitemap/getting-started/how-it-works
	// sitemap: {
	// 	sitemaps: {
	// 		pages: {
	// 			exclude: ['/posts/**', '/help/**'],
	// 		},
	// 		posts: {
	// 			include: ['/posts/**'],
	// 		},
	// 		help: {
	// 			include: ['/help/**'],
	// 		},
	// 	},
	// },

	postcss: {
		plugins: {
			'postcss-import': {},
			'tailwindcss/nesting': {},
			tailwindcss: {},
			autoprefixer: {},
		},
	},

	build: {
		transpile: ['@sendgrid/mail'],
	},
});
