// import { formatFonts } from './utils/fonts';
// import { theme } from './theme';

export default defineNuxtConfig({
	ssr: true,
	// cors: true,
	// nitro: {
	// 	preset: 'vercel-edge',
	// },
	app: {
		pageTransition: { name: 'page', mode: 'out-in' },
	},
	components: [
		// Disable prefixing base components with `Base`
		// { path: '~/components/base', pathPrefix: false },
		// Auto import components from `~/components`
		'~/components',
	],

	css: ['~/assets/css/tailwind.css', '~/assets/css/main.css'],

	modules: [
		// '@formkit/nuxt', // https://formkit.com/getting-started/installation#with-nuxt
		'@nuxt/devtools', // https://devtools.nuxtjs.org/
		'@nuxt/image',
		'@nuxt/ui',
		'@nuxtjs/color-mode',
		'@vueuse/motion/nuxt', // https://motion.vueuse.org/nuxt.html
		'@vueuse/nuxt', // https://vueuse.org/
		'nuxt-directus-next',
		'nuxt-icon', // https://github.com/nuxt-modules/icon
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
			staticToken: process.env.DIRECTUS_SERVER_TOKEN || 'iT3VS_eFq4TxUDsMDhGlwLW43xtGACtI',
			siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000',
			adminUrl: process.env.DIRECTUS_URL || 'https://admin.huestudios.company',
		},
	},
	// Directus Configuration
	directus: {
		url: 'https://admin.huestudios.company',
		moduleConfig: {
			devtools: true,
			readMeQuery: {
				fields: ['*'],
				updateState: true,
			},
			autoRefresh: {
				redirectTo: '/auth/signin',
			},
		},
	},

	plugins: [],

	// Nuxt DevTools - https://devtools.nuxtjs.org/
	devtools: { enabled: false },

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

	// site: {
	// 	url: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000',
	// 	name: '1033 Lenox',
	// },

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
		// plugins: {
		// 	'postcss-import': {},
		// 	'tailwindcss/nesting': {},
		// 	tailwindcss: {},
		// 	autoprefixer: {},
		// },
	},

	build: {
		transpile: ['@sendgrid/mail'],
	},
});
