// import { formatFonts } from './utils/fonts';
// import { theme } from './theme';
import { defineNuxtConfig } from 'nuxt/config';

const isProduction = process.env.NODE_ENV === 'production';
const authBaseURL = isProduction ? 'https://huestudios.company/api/auth' : 'http://localhost:3000/api/auth';

export default defineNuxtConfig({
	ssr: true,

	// typescript: {
	// 	strict: true,
	// 	typeCheck: false, // Set to false if you're having issues
	// 	shim: true,
	// },

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
		authSecret: process.env.NEXTAUTH_SECRET || 'sKG+LfHMxZVZv3aGnf70dxJ8+776LbJHDttKxF3znYw=',

		public: {
			adminRole: '3a63a4e1-c82e-46f8-9993-7f11ac6a4b01',
			stripePublic:
				process.env.NODE_ENV === 'production' ? process.env.STRIPE_PUBLIC_KEY : process.env.STRIPE_PUBLIC_KEY_TEST,
			companyName: process.env.COMPANY_NAME,
			directusUrl: process.env.DIRECTUS_URL || 'https://admin.huestudios.company',
			assetsUrl: process.env.DIRECTUS_ASSETS_URL || 'https://admin.huestudios.company/assets/',
			websocketUrl: process.env.DIRECTUS_WEBSOCKET_URL || 'wss://admin.huestudios.company/websocket',
			staticToken: process.env.DIRECTUS_SERVER_TOKEN || '3njk8nRR70D6o8VHC1IxW87kSBZm3_FS',
			siteUrl: 'https://huestudios.company',
			adminUrl: process.env.DIRECTUS_URL || 'https://admin.huestudios.company',
			defaultTeamId: process.env.NUXT_PUBLIC_DEFAULT_TEAM_ID || 'org-default',
			adminRoleId: process.env.NUXT_PUBLIC_ADMIN_ROLE_ID || '3a63a4e1-c82e-46f8-9993-7f11ac6a4b01',
			clientManagerRoleId: process.env.NUXT_PUBLIC_CLIENT_MANAGER_ROLE_ID || '7b62b285-e3a8-46ff-9e8c-d1445a3c13bb',
		},
	},

	modules: [
		'@nuxt/devtools',
		'@nuxt/icon',
		[
			'@nuxt/image',
			{
				provider: 'directus',
				directus: {
					baseURL: `${process.env.DIRECTUS_URL}/assets/`,
				},
			},
		],
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
		[
			'@nuxtjs/color-mode',
			{
				preference: 'system',
				classSuffix: '',
			},
		],
		'@sidebase/nuxt-auth',
		'@vueuse/motion/nuxt',
		'@vueuse/nuxt',
		[
			'nuxt-directus-next',
			{
				url: 'https://admin.huestudios.company',
				authConfig: {
					mode: 'static',
				},

				// Remove authConfig section

				moduleConfig: {
					// Keep these features
					autoImport: true,
					devtools: true,

					// Disable auto-refresh since you'll handle auth with nuxt-auth
					autoRefresh: {
						enableMiddleware: false,
						global: false,
					},

					// Keep user data fetching config
					readMeQuery: {
						fields: [
							'*,organizations.organizations_id.id,organizations.organizations_id.name,organizations.organizations_id.logo,organizations.organizations_id.icon,organizations.organizations_id.tickets,organizations.organizations_id.projects',
						],
						updateState: true,
					},
				},
			},
		],
		'nuxt-gtag',
		'@samk-dev/nuxt-vcalendar',
	],
	auth: {
		provider: {
			type: 'authjs',
		},
		globalAppMiddleware: {
			isEnabled: false, // Set to true if you want to enable auth for the entire app
		},
		baseURL: authBaseURL,
		sessionRefresh: {
			// Ensuring session refreshes periodically and on window focus
			enablePeriodically: true,
			enableOnWindowFocus: true,
		},
	},

	devtools: { enabled: true },

	// debug: true,
	// logLevel: 'verbose',

	postcss: {
		plugins: {
			'postcss-import': {},
			'tailwindcss/nesting': {},
			tailwindcss: {},
			autoprefixer: {},
		},
	},

	build: {
		transpile: ['@sendgrid/mail', 'swiper', 'gsap', '@vueuse/core', 'v-calendar', 'vue-chartjs'],
	},

	compatibilityDate: '2024-10-01',
});
