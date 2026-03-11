// nuxt.config.ts
// Migrated to Tailwind CSS v4 + shadcn-vue + Directus with nuxt-auth-utils

import tailwindcss from '@tailwindcss/vite';

const isProduction = process.env.NODE_ENV === 'production';

export default defineNuxtConfig({
	ssr: true,

	future: {
		compatibilityVersion: 4,
	},

	compatibilityDate: '2024-10-01',

	app: {
		pageTransition: { name: 'page', mode: 'out-in' },
	},

	css: ['~/assets/css/main.css'],

	runtimeConfig: {
		// ============================================
		// Session configuration for nuxt-auth-utils
		// ============================================
		session: {
			maxAge: 60 * 60 * 24 * 7, // 1 week
			password: process.env.NUXT_SESSION_PASSWORD,
			cookie: {
				sameSite: 'lax',
			},
		},

		// ============================================
		// Private keys (server-side only)
		// ============================================

		// SendGrid
		sendgridApiKey: process.env.SENDGRID_API_KEY,
		sendgridFromEmail: process.env.SENDGRID_FROM_EMAIL || 'hello@huestudios.company',
		sendgridFromName: process.env.SENDGRID_FROM_NAME || 'Hue Creative Agency',
		SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
		FROM_EMAIL: process.env.SENDGRID_FROM_EMAIL,
		BCC_EMAIL: process.env.SENDGRID_BCC_EMAIL,
		REPLY_TO_EMAIL: process.env.SENDGRID_REPLY_TO_EMAIL,

		// Stripe (server-side only)
		stripeSecretKeyTest: process.env.STRIPE_SECRET_KEY_TEST,
		stripeSecretKeyLive: process.env.STRIPE_SECRET_KEY,
		stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
		social: {
			instagram: {
				appId: process.env.INSTAGRAM_APP_ID || '',
				appSecret: process.env.INSTAGRAM_APP_SECRET || '',
				redirectUri: process.env.INSTAGRAM_REDIRECT_URI || '',
				apiVersion: 'v21.0',
			},
			tiktok: {
				clientKey: process.env.TIKTOK_CLIENT_KEY || '',
				clientSecret: process.env.TIKTOK_CLIENT_SECRET || '',
				redirectUri: process.env.TIKTOK_REDIRECT_URI || '',
			},
			encryptionKey: process.env.SOCIAL_ENCRYPTION_KEY || '',
		},
		// Directus (server-side - NEVER expose to client)
		directus: {
			url: process.env.DIRECTUS_URL || 'https://admin.huestudios.company',
			staticToken: process.env.DIRECTUS_STATIC_TOKEN,
			serverToken: process.env.DIRECTUS_SERVER_TOKEN,
		},
		directusServerToken: process.env.DIRECTUS_SERVER_TOKEN,
		directusStaticToken: process.env.DIRECTUS_STATIC_TOKEN,

		// Twilio
		twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
		twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
		twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER,
		twilioApiKey: process.env.TWILIO_API_KEY,
		twilioApiSecret: process.env.TWILIO_API_SECRET,

		// Google OAuth
		googleClientId: process.env.GOOGLE_CLIENT_ID,
		googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,

		// Azure/Outlook OAuth
		azureClientId: process.env.AZURE_CLIENT_ID,
		azureClientSecret: process.env.AZURE_CLIENT_SECRET,

		// Cron
		cronSecret: process.env.CRON_SECRET,

		// ============================================
		// Public keys (exposed to client)
		// ============================================
		public: {
			// Roles
			adminRole: '3a63a4e1-c82e-46f8-9993-7f11ac6a4b01',
			adminRoleId: process.env.NUXT_PUBLIC_ADMIN_ROLE_ID || '3a63a4e1-c82e-46f8-9993-7f11ac6a4b01',
			clientManagerRoleId: process.env.NUXT_PUBLIC_CLIENT_MANAGER_ROLE_ID || '7b62b285-e3a8-46ff-9e8c-d1445a3c13bb',
			directusRoleUser: process.env.NUXT_PUBLIC_DIRECTUS_ROLE_USER,

			// Stripe public key
			stripePublic: isProduction ? process.env.STRIPE_PUBLIC_KEY : process.env.STRIPE_PUBLIC_KEY_TEST,

			// Company
			companyName: process.env.COMPANY_NAME,

			// Directus URLs (public)
			directus: {
				url: process.env.DIRECTUS_URL || 'https://admin.huestudios.company',
				websocketUrl: process.env.DIRECTUS_WEBSOCKET_URL || 'wss://admin.huestudios.company/websocket',
			},
			directusUrl: process.env.DIRECTUS_URL || 'https://admin.huestudios.company',
			assetsUrl: process.env.DIRECTUS_ASSETS_URL || 'https://admin.huestudios.company/assets/',
			websocketUrl: process.env.DIRECTUS_WEBSOCKET_URL || 'wss://admin.huestudios.company/websocket',
			adminUrl: process.env.DIRECTUS_URL || 'https://admin.huestudios.company',

			// Site
			siteUrl: process.env.SITE_URL || 'https://huestudios.company',
			appUrl: process.env.APP_URL || process.env.SITE_URL || 'https://huestudios.company',

			// Default team
			defaultTeamId: process.env.NUXT_PUBLIC_DEFAULT_TEAM_ID || 'org-default',
		},
	},

	modules: [
		// Authentication - nuxt-auth-utils (replaces @sidebase/nuxt-auth)
		'nuxt-auth-utils',

		// UI & Components
		'shadcn-nuxt',
		'@nuxt/icon',
		'@nuxtjs/color-mode',

		// Utilities
		'@vueuse/nuxt',
		'@vueuse/motion/nuxt',

		// Forms
		'@vee-validate/nuxt',

		// Image optimization
		[
			'@nuxt/image',
			{
				provider: 'directus',
				directus: {
					baseURL: `${process.env.DIRECTUS_URL || 'https://admin.huestudios.company'}/assets/`,
				},
			},
		],

		// Analytics
		'nuxt-gtag',

		// PWA
		'@vite-pwa/nuxt',

		// Dev tools
		'@nuxt/devtools',
	],

	// Vite plugins - Tailwind CSS v4
	vite: {
		plugins: [tailwindcss()],
	},

	// shadcn-vue configuration
	shadcn: {
		prefix: '',
		componentDir: './components/ui',
	},

	// Color mode for dark theme support
	colorMode: {
		preference: 'system',
		classSuffix: '',
	},

	// Icon configuration
	icon: {
		serverBundle: 'remote',
		clientBundle: {
			scan: true,
		},
		collections: [
			'heroicons',
			'heroicons-outline',
			'heroicons-solid',
			'lucide',
			'wi',
			'meteocons',
			'material-symbols',
			'material-symbols-light',
			'logos',
		],
	},

	// VeeValidate configuration
	veeValidate: {
		autoImports: true,
		componentNames: {
			Form: 'VeeForm',
			Field: 'VeeField',
			FieldArray: 'VeeFieldArray',
			ErrorMessage: 'VeeErrorMessage',
		},
	},

	// PWA configuration (preserved from original)
	pwa: {
		registerType: 'autoUpdate',
		manifest: {
			name: 'ahhble',
			short_name: 'ahhble',
			theme_color: '#ffffff',
			icons: [
				{
					src: 'android-icon-192x192.png',
					sizes: '192x192',
					type: 'image/png',
				},
				{
					src: 'icon-512x512.png',
					sizes: '512x512',
					type: 'image/png',
				},
				{
					src: 'icon-512x512.png',
					sizes: '512x512',
					type: 'image/png',
					purpose: 'any maskable',
				},
			],
		},
		workbox: {
			navigateFallback: '/',
			globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
			runtimeCaching: [
				{
					urlPattern: new RegExp('^https://admin.huestudios.company/assets/'),
					handler: 'CacheFirst',
					options: {
						cacheName: 'directus-images',
						expiration: {
							maxEntries: 100,
							maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
						},
					},
				},
			],
		},
		client: {
			installPrompt: true,
		},
		devOptions: {
			enabled: true,
			suppressWarnings: true,
			type: 'module',
		},
	},

	devtools: { enabled: true },

	build: {
		transpile: ['@sendgrid/mail', 'swiper', 'gsap', '@vueuse/core', 'vue-chartjs', 'mjml', 'handlebars'],
	},

	nitro: {
		externals: {
			inline: ['lodash'],
		},
	},
});
