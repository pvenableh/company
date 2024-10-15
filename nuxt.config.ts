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

	css: ['~/assets/css/tailwind.css', '~/assets/css/main.css'],
	//pk_test_BmSiBo09lA9UYtmoeOk6C6yV00wZk1bmX2
	//pk_live_hiVeCs5zdZaHDYJYzhL7C0BH00KmFyrVyH
	runtimeConfig: {
		public: {
			stripePublic: 'pk_test_BmSiBo09lA9UYtmoeOk6C6yV00wZk1bmX2',
			assetsUrl: process.env.DIRECTUS_ASSETS_URL || 'https://admin.huestudios.company/assets/',
			websocketUrl: process.env.DIRECTUS_WEBSOCKET_URL || 'wss://admin.huestudios.company/websocket',
			staticToken: process.env.DIRECTUS_SERVER_TOKEN || 'o46aPhk-Bc_DMYbgL3mH4nA3yOYfQ9N8',
			siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000',
			adminUrl: process.env.DIRECTUS_URL || 'https://admin.huestudios.company',
		},
	},

	modules: [
		'@formkit/nuxt',
		'@nuxt/devtools',
		'@nuxt/icon',
		'@nuxt/image',
		[
			'@nuxt/ui',
			{
				icons: ['heroicons', 'wi', 'meteocons'],
			},
		],
		'@nuxtjs/color-mode',
		'@vueuse/motion/nuxt',
		'@vueuse/nuxt',
		'nuxt-directus-next',
		'nuxt-gtag',
	],

	// plugins: [],

	// gtag: {
	// 	id: 'G-Y5YQ3FM1FL',
	// },

	directus: {
		url: 'https://admin.huestudios.company',
		staticToken: 'o46aPhk-Bc_DMYbgL3mH4nA3yOYfQ9N8',
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

	devtools: { enabled: true },

	colorMode: {
		preference: 'system',
		classSuffix: '',
	},

	image: {
		provider: 'directus',
		directus: {
			baseURL: `${process.env.DIRECTUS_URL}/assets/`,
		},
	},

	postcss: {
		plugins: {
			'postcss-import': {},
			'tailwindcss/nesting': {},
			tailwindcss: {},
			autoprefixer: {},
		},
	},

	build: {
		transpile: ['@sendgrid/mail', 'swiper', 'gsap', '@vueuse/core', 'v-calendar'],
	},

	compatibilityDate: '2024-10-01',
});
