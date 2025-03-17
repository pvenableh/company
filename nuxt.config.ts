// import { formatFonts } from './utils/fonts';
// import { theme } from './theme';

export default defineNuxtConfig({
	ssr: true,

	future: {
		compatibilityVersion: 4,
	},

	app: {
		pageTransition: { name: 'page', mode: 'out-in' },
	},

	css: ['~/assets/css/tailwind.css', '~/assets/css/main.css'],

	runtimeConfig: {
		// Private keys (server-side only)
		SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
		FROM_EMAIL: process.env.SENDGRID_FROM_EMAIL,
		BCC_EMAIL: process.env.SENDGRID_BCC_EMAIL,
		REPLY_TO_EMAIL: process.env.SENDGRID_REPLY_TO_EMAIL,
		// Stripe secret keys should be here (server-side only)
		stripeSecretKeyTest: process.env.STRIPE_SECRET_KEY_TEST,
		stripeSecretKeyLive: process.env.STRIPE_SECRET_KEY,
		stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,

		public: {
			adminRole: '3a63a4e1-c82e-46f8-9993-7f11ac6a4b01',
			stripePublic:
				process.env.NODE_ENV === 'production' ? process.env.STRIPE_PUBLIC_KEY : process.env.STRIPE_PUBLIC_KEY_TEST,
			companyName: process.env.COMPANY_NAME,
			directusUrl: process.env.DIRECTUS_URL,
			assetsUrl: process.env.DIRECTUS_ASSETS_URL || 'https://admin.huestudios.company/assets/',
			websocketUrl: process.env.DIRECTUS_WEBSOCKET_URL || 'wss://admin.huestudios.company/websocket',
			staticToken: process.env.DIRECTUS_SERVER_TOKEN || '3njk8nRR70D6o8VHC1IxW87kSBZm3_FS',
			siteUrl: process.env.NODE_ENV === 'production' ? 'https://huestudios.company' : 'http://localhost:3000',
			adminUrl: process.env.DIRECTUS_URL || 'https://admin.huestudios.company',
			defaultTeamId: process.env.NUXT_PUBLIC_DEFAULT_TEAM_ID || 'org-default',
			adminRoleId: process.env.NUXT_PUBLIC_ADMIN_ROLE_ID || '3a63a4e1-c82e-46f8-9993-7f11ac6a4b01',
			clientManagerRoleId: process.env.NUXT_PUBLIC_CLIENT_MANAGER_ROLE_ID || '7b62b285-e3a8-46ff-9e8c-d1445a3c13bb',
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
				icons: ['heroicons', 'wi', 'meteocons', 'material-symbols', 'material-symbols-light', 'logos'],
				notification: {
					position: 'top-[unset]] bottom-0',
					timeout: 1000,
					default: {
						timeout: 1000,
						closeButton: {
							icon: 'i-heroicons-archive-box-x-mark',
							color: 'primary',
							variant: 'outline',
							padded: true,
							size: '2xs',
							ui: { rounded: 'rounded-full' },
						},
					},
				},
			},
		],
		'@nuxtjs/color-mode',
		'@vueuse/motion/nuxt',
		'@vueuse/nuxt',
		'nuxt-directus-next',
		'nuxt-gtag',
		'@samk-dev/nuxt-vcalendar',
		// 'shadcn-nuxt',
	],

	// plugins: [],

	// gtag: {
	// 	id: 'G-Y5YQ3FM1FL',
	// },

	// shadcn: {
	// 	/**
	// 	 * Prefix for all the imported component
	// 	 */
	// 	prefix: '',
	// 	/**
	// 	 * Directory that the component lives in.
	// 	 * @default "./components/ui"
	// 	 */
	// 	componentDir: './components/ui',
	// },

	directus: {
		url: 'https://admin.huestudios.company',
		// staticToken: process.env.DIRECTUS_SERVER_TOKEN,
		authConfig: {
			// mode: 'cookie',
			cookieSecure: process.env.NODE_ENV === 'production',
			cookieSameSite: 'lax',
			refreshTokenCookieName: 'directus_refresh_token',
			authTokenCookieName: 'directus_auth_token',
		},

		moduleConfig: {
			// Enable auto-importing of the Directus composables
			autoImport: true,
			// Enable basic auto-refresh functionality
			autoRefresh: {
				enableMiddleware: true, // Automatically use middleware to refresh the token
				global: true, // Apply auto-refresh globally
				middlewareName: 'auth', // Optional: Custom name for the middleware
				redirectTo: '/auth/signin', // Optional: Where to redirect if refresh fails
			},
			devtools: true,
			readMeQuery: {
				fields: [
					'*,organizations.organizations_id.id,organizations.organizations_id.name,organizations.organizations_id.logo,organizations.organizations_id.icon,organizations.organizations_id.tickets,organizations.organizations_id.projects',
				],
				updateState: true,
			},
		},
	},

	devtools: { enabled: true },

	// debug: true,
	// logLevel: 'verbose',

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
