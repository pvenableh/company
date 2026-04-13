// nuxt.config.ts
// Migrated to Tailwind CSS v4 + shadcn-vue + Directus with nuxt-auth-utils

import tailwindcss from '@tailwindcss/vite';

const isProduction = process.env.NODE_ENV === 'production';

export default defineNuxtConfig({
	ssr: true,

	compatibilityDate: '2025-07-01',

	app: {
		pageTransition: { name: 'page', mode: 'out-in' },
		head: {
			meta: [
				// iOS PWA — native app feel
				{ name: 'apple-mobile-web-app-capable', content: 'yes' },
				{ name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
				{ name: 'apple-mobile-web-app-title', content: 'Earnest' },
				{ name: 'mobile-web-app-capable', content: 'yes' },
				// Viewport with safe area coverage for notched devices
				{
					name: 'viewport',
					content: 'width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no',
				},
				// Theme color matches Earnest warm background
				{ name: 'theme-color', content: '#faf7f4', media: '(prefers-color-scheme: light)' },
				{ name: 'theme-color', content: '#141210', media: '(prefers-color-scheme: dark)' },
			],
			link: [
				{ rel: 'apple-touch-icon', href: '/android-icon-192x192.png' },
				// Preload critical above-the-fold fonts
				{
					rel: 'preload',
					as: 'font',
					type: 'font/woff2',
					href: '/_nuxt/assets/css/fonts/proxima-nova-regular.woff2',
					crossorigin: 'anonymous',
				},
				{
					rel: 'preload',
					as: 'font',
					type: 'font/woff2',
					href: '/_nuxt/assets/css/fonts/bauer-bodoni-roman.woff2',
					crossorigin: 'anonymous',
				},
			],
		},
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
		sendgridFromEmail: process.env.SENDGRID_FROM_EMAIL || 'hello@earnest.guru',
		sendgridFromName: process.env.SENDGRID_FROM_NAME || 'Earnest',
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
			linkedin: {
				clientId: process.env.LINKEDIN_CLIENT_ID || '',
				clientSecret: process.env.LINKEDIN_CLIENT_SECRET || '',
				redirectUri: process.env.LINKEDIN_REDIRECT_URI || '',
			},
			facebook: {
				// Same Meta app as Instagram — falls back to Instagram credentials
				appId: process.env.FACEBOOK_APP_ID || process.env.INSTAGRAM_APP_ID || '',
				appSecret: process.env.FACEBOOK_APP_SECRET || process.env.INSTAGRAM_APP_SECRET || '',
				redirectUri: process.env.FACEBOOK_REDIRECT_URI || '',
			},
			threads: {
				// Same Meta app — falls back to Instagram credentials
				appId: process.env.THREADS_APP_ID || process.env.INSTAGRAM_APP_ID || '',
				appSecret: process.env.THREADS_APP_SECRET || process.env.INSTAGRAM_APP_SECRET || '',
				redirectUri: process.env.THREADS_REDIRECT_URI || '',
			},
			encryptionKey: process.env.SOCIAL_ENCRYPTION_KEY || '',
		},
		// Directus (server-side - NEVER expose to client)
		directus: {
			url: process.env.DIRECTUS_URL || 'https://admin.earnest.guru',
			staticToken: process.env.DIRECTUS_STATIC_TOKEN,
			serverToken: process.env.DIRECTUS_SERVER_TOKEN,
		},
		directusServerToken: process.env.DIRECTUS_SERVER_TOKEN,
		directusStaticToken: process.env.DIRECTUS_STATIC_TOKEN,

		// Daily.co video conferencing
		dailyApiKey: process.env.DAILY_API_KEY || '',

		// Twilio (SMS/voice — video migrated to Daily.co)
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

		// Redis Queue (BullMQ for async AI jobs)
		redisQueueUrl: process.env.REDIS_QUEUE_URL || 'redis://queue:6379',

		// LLM (AI Chat)
		llm: {
			provider: process.env.LLM_PROVIDER || 'claude',
			apiKey: process.env.LLM_API_KEY || process.env.ANTHROPIC_API_KEY || '',
			model: process.env.LLM_MODEL || 'claude-sonnet-4-20250514',
		},

		// Notification webhook secret
		notificationWebhookSecret: process.env.NOTIFICATION_WEBHOOK_SECRET || '',

		// SendGrid webhook verification key
		sendgridWebhookKey: process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY || '',

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

			// Daily.co domain (your-domain.daily.co)
			dailyDomain: process.env.DAILY_DOMAIN || '',

			// Company
			companyName: process.env.COMPANY_NAME,

			// Directus URLs (public)
			directus: {
				url: process.env.DIRECTUS_URL || 'https://admin.earnest.guru',
				websocketUrl: process.env.DIRECTUS_WEBSOCKET_URL || 'wss://admin.earnest.guru/websocket',
			},
			directusUrl: process.env.DIRECTUS_URL || 'https://admin.earnest.guru',
			assetsUrl: process.env.DIRECTUS_ASSETS_URL || 'https://admin.earnest.guru/assets/',
			websocketUrl: process.env.DIRECTUS_WEBSOCKET_URL || 'wss://admin.earnest.guru/websocket',
			adminUrl: process.env.DIRECTUS_URL || 'https://admin.earnest.guru',

			// Site
			siteUrl: process.env.SITE_URL || 'https://app.earnest.guru',
			appUrl: process.env.APP_URL || process.env.SITE_URL || 'https://app.earnest.guru',
			marketingUrl: process.env.MARKETING_URL || 'https://earnest.guru',

			// SSO provider flags (controls which buttons appear on login)
			appleClientId: process.env.APPLE_CLIENT_ID || '',

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
					baseURL: `${process.env.DIRECTUS_URL || 'https://admin.earnest.guru'}/assets/`,
				},
			},
		],

		// Analytics
		'nuxt-gtag',

		// PWA (disabled in development — uncomment to re-enable)
		// '@vite-pwa/nuxt',

		// Dev tools
		'@nuxt/devtools',
	],

	// Vite plugins - Tailwind CSS v4
	vite: {
		plugins: [tailwindcss()],
		server: {
			watch: {
				ignored: ['**/.claude/worktrees/**'],
			},
		},
	},

	// Ensure all component directories are scanned with path prefixes
	components: [
		{
			path: '~/components',
			pathPrefix: true,
		},
	],

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
			'fluent-emoji-flat',
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

	// PWA — native iOS & Android app experience (disabled in development — uncomment to re-enable)
	// pwa: {
	// 	registerType: 'autoUpdate',
	// 	manifest: {
	// 		name: 'Earnest. Do good work.',
	// 		short_name: 'Earnest',
	// 		description: 'A platform that means it.',
	// 		theme_color: '#faf7f4',
	// 		background_color: '#faf7f4',
	// 		display: 'standalone',
	// 		orientation: 'portrait',
	// 		start_url: '/',
	// 		scope: '/',
	// 		categories: ['business', 'productivity'],
	// 		icons: [
	// 			{
	// 				src: 'android-icon-192x192.png',
	// 				sizes: '192x192',
	// 				type: 'image/png',
	// 			},
	// 			{
	// 				src: 'icon-512x512.png',
	// 				sizes: '512x512',
	// 				type: 'image/png',
	// 			},
	// 			{
	// 				src: 'icon-512x512.png',
	// 				sizes: '512x512',
	// 				type: 'image/png',
	// 				purpose: 'any maskable',
	// 			},
	// 		],
	// 	},
	// 	workbox: {
	// 		navigateFallback: '/',
	// 		globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
	// 		runtimeCaching: [
	// 			{
	// 				urlPattern: new RegExp('^https://admin.earnest.guru/assets/'),
	// 				handler: 'CacheFirst',
	// 				options: {
	// 					cacheName: 'directus-images',
	// 					expiration: {
	// 						maxEntries: 100,
	// 						maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
	// 					},
	// 				},
	// 			},
	// 		],
	// 	},
	// 	client: {
	// 		installPrompt: true,
	// 	},
	// 	devOptions: {
	// 		enabled: false,
	// 		suppressWarnings: true,
	// 		type: 'module',
	// 	},
	// },

	devtools: { enabled: true },

	nitro: {
		externals: {
			inline: [
				'lodash',
				'htmlparser2',
				'dom-serializer',
				'domelementtype',
				'domhandler',
				'domutils',
				'entities',
				'cheerio',
				'cheerio-select',
				'parse5',
				'parse5-htmlparser2-tree-adapter',
			],
			external: [
				'bullmq',
				'ioredis',
				'msgpackr',
			],
		},
		// Increase Vercel function timeout (default 10s is too short for LLM calls)
		vercel: {
			functions: {
				maxDuration: 60,
			},
		},
	},

	build: {
		transpile: ['@sendgrid/mail', 'swiper', 'gsap', '@vueuse/core', 'mjml', 'handlebars'],
	},
});
