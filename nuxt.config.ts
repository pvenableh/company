// nuxt.config.ts
// Migrated to Tailwind CSS v4 + shadcn-vue + Directus with nuxt-auth-utils

import { execSync } from 'node:child_process';
import tailwindcss from '@tailwindcss/vite';
import { version as pkgVersion } from './package.json';

const isProduction = process.env.NODE_ENV === 'production';

// Build-time app version — the human-facing "Earnest vX.Y.Z" label.
//
// MAJOR.MINOR come from package.json; the PATCH auto-increments with the git
// commit count (`git rev-list --count HEAD`) so the visible version moves on
// every deploy. That is intentional — it's the signal a fresh deploy shipped.
//
// TAG-FREE BY DESIGN. An earlier scheme used `git describe --tags`, which broke
// on Vercel: its authenticated clone of the private remote fetches commits but
// NOT tags, so `describe` failed and the version silently fell back to the
// static package.json value. Counting commits needs only commit history — which
// `--unshallow` restores and which works fine on Vercel — never tags. So this
// survives where the tag scheme didn't.
//
// Deploy freshness (the "Update available — Refresh" toast) is still driven by
// `buildId` = the commit SHA (see runtimeConfig below), independent of this.
function tryGit(cmd: string): string | null {
	try {
		return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000 })
			.toString()
			.trim();
	} catch {
		return null;
	}
}

function resolveAppVersion(): string {
	// Explicit override always wins (CI / manual lever / Vercel env var).
	const envVer = process.env.NUXT_PUBLIC_APP_VERSION?.trim();
	if (envVer) return envVer;

	// MAJOR.MINOR base from package.json; the static patch there is ignored.
	const [major = '0', minor = '0'] = pkgVersion.split('.');
	const base = `${major}.${minor}`;

	// Vercel/CI often hand us a shallow clone (only the tip commit), which would
	// undercount. Deepen the COMMIT history first — no-op on a complete repo.
	if (tryGit('git rev-parse --is-shallow-repository') === 'true') {
		tryGit('git fetch --unshallow --quiet');
		tryGit('git fetch --deepen=2147483647 --quiet');
	}

	const count = tryGit('git rev-list --count HEAD');
	if (count && /^\d+$/.test(count)) return `${base}.${count}`;

	// Git unavailable (some serverless contexts) — fall back to the static
	// package.json version so the app still boots with a sane label.
	return pkgVersion;
}

const appVersion = resolveAppVersion();
// Surface the resolved version in build/deploy logs for at-a-glance sanity.
console.log(`[version] app version resolved to ${appVersion}`);

export default defineNuxtConfig({
	ssr: true,

	compatibilityDate: '2025-07-01',

	app: {
		// Page transition with rAF-starvation fallback. Vue's default nextFrame
		// helper (two requestAnimationFrames) pauses entirely when the tab is
		// hidden, stalling the leave → enter handoff under `mode: 'out-in'` so
		// the incoming page never mounts. The JS hooks below call `done()` via
		// setTimeout (which still fires in hidden tabs) so the state machine
		// advances regardless of rAF.
		pageTransition: {
			name: 'page',
			mode: 'out-in',
			onLeave(el: Element, done: () => void) {
				let called = false;
				const finish = () => {
					if (called) return;
					called = true;
					el.removeEventListener('transitionend', onEnd);
					done();
				};
				function onEnd(e: Event) {
					if (e.target === el) finish();
				}
				el.addEventListener('transitionend', onEnd);
				setTimeout(finish, 300);
			},
			onEnter(el: Element, done: () => void) {
				let called = false;
				const finish = () => {
					if (called) return;
					called = true;
					el.removeEventListener('transitionend', onEnd);
					done();
				};
				function onEnd(e: Event) {
					if (e.target === el) finish();
				}
				el.addEventListener('transitionend', onEnd);
				setTimeout(finish, 450);
			},
		},
		head: {
			meta: [
				// iOS PWA — native app feel
				{ name: 'apple-mobile-web-app-capable', content: 'yes' },
				// black-translucent draws content under the status bar so the
				// app feels truly full-screen; the safe-area inset on the
				// shell wrapper keeps chrome below the notch.
				{ name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
				{ name: 'apple-mobile-web-app-title', content: 'Earnest' },
				{ name: 'mobile-web-app-capable', content: 'yes' },
				{ name: 'application-name', content: 'Earnest' },
				{ name: 'format-detection', content: 'telephone=no' },
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
				// SVG favicon adapts to light/dark via prefers-color-scheme.
				// PNG fallback for browsers without SVG-favicon support (older Safari, Edge legacy).
				// favicon.ico in /public is auto-served as the final fallback.
				{ rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
				{ rel: 'icon', href: '/favicon-32x32.png', type: 'image/png', sizes: '32x32' },
				// iOS home-screen icons across the common sizes — iOS picks
				// the closest match. apple-touch-icon must be a PNG (Safari
				// ignores SVG here).
				{ rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '180x180' },
				{ rel: 'apple-touch-icon', href: '/icon-152x152.png', sizes: '152x152' },
				{ rel: 'apple-touch-icon', href: '/icon-192x192.png', sizes: '192x192' },
				// PWA manifest — required for installability + iOS standalone.
				{ rel: 'manifest', href: '/manifest.json' },
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
		// Keys below match what the send code actually reads (see server/utils/email-send.ts):
		// it looks up `sendgridBccEmail` / `sendgridReplyToEmail`. The old `BCC_EMAIL` /
		// `REPLY_TO_EMAIL` names were dead — nothing read them — so BCC + reply-to never
		// attached. `SENDGRID_API_KEY`/`FROM_EMAIL` stay as legacy fallbacks still referenced.
		sendgridBccEmail: process.env.SENDGRID_BCC_EMAIL,
		sendgridReplyToEmail: process.env.SENDGRID_REPLY_TO_EMAIL,
		SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
		FROM_EMAIL: process.env.SENDGRID_FROM_EMAIL,

		// Stripe (server-side only)
		stripeSecretKeyTest: process.env.STRIPE_SECRET_KEY_TEST,
		stripeSecretKeyLive: process.env.STRIPE_SECRET_KEY,
		stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
		// Stripe Connect (Phase 2+): platform fee in basis points (1 bps = 0.01%).
		// Defaults to 0; set when we decide what to charge orgs on top of Stripe's processing fee.
		stripePlatformFeeBps: process.env.STRIPE_PLATFORM_FEE_BPS || '0',
		// Stripe Connect (Phase 4): signing secret for the Connect webhook endpoint.
		stripeConnectWebhookSecret: process.env.STRIPE_CONNECT_WEBHOOK_SECRET,
		// Stripe Connect OAuth (ca_…): lets an org link a PRE-EXISTING Stripe
		// account instead of creating a fresh one (e.g. Hue's historical account).
		stripeConnectClientId: process.env.STRIPE_CONNECT_CLIENT_ID,
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
				// App A — Sign In with LinkedIn + Share on LinkedIn (personal-profile posting)
				clientId: process.env.LINKEDIN_CLIENT_ID || '',
				clientSecret: process.env.LINKEDIN_CLIENT_SECRET || '',
				redirectUri: process.env.LINKEDIN_REDIRECT_URI || '',
				// App B — Community Management API (company-page posting). Separate
				// app required by LinkedIn legal exclusivity rules.
				orgClientId: process.env.LINKEDIN_ORG_CLIENT_ID || '',
				orgClientSecret: process.env.LINKEDIN_ORG_CLIENT_SECRET || '',
				orgRedirectUri: process.env.LINKEDIN_ORG_REDIRECT_URI || '',
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
			serverToken: process.env.DIRECTUS_SERVER_TOKEN,
		},
		directusServerToken: process.env.DIRECTUS_SERVER_TOKEN,

		// Earnest — internal bug/feedback inbox org id (see
		// scripts/setup-earnest-support-org.ts). /api/support/submit
		// 503s when unset rather than landing tickets in the wrong org.
		earnestSupportOrgId: process.env.EARNEST_SUPPORT_ORG_ID || '',

		// Daily.co video conferencing
		dailyApiKey: process.env.DAILY_API_KEY || '',
		dailyWebhookHmac: process.env.DAILY_WEBHOOK_HMAC || '',

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

		// Redis Queue (BullMQ for async AI jobs) — leave empty to disable the worker
		// and noop enqueues. Async AI is scaffolding only; not wired to real consumers.
		redisQueueUrl: process.env.REDIS_QUEUE_URL || '',

		// LLM (AI Chat)
		llm: {
			provider: process.env.LLM_PROVIDER || 'claude',
			apiKey: process.env.LLM_API_KEY || process.env.ANTHROPIC_API_KEY || '',
			model: process.env.LLM_MODEL || 'claude-sonnet-5',
		},

		// Notification webhook secret
		notificationWebhookSecret: process.env.NOTIFICATION_WEBHOOK_SECRET || '',

		// Early-access welcome-email webhook secret (Directus Flow → /api/early-access/welcome)
		earlyAccessWebhookSecret: process.env.EARLY_ACCESS_WEBHOOK_SECRET || '',

		// Web Push (VAPID)
		vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || '',
		vapidSubject: process.env.VAPID_SUBJECT || 'mailto:hello@earnest.guru',

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

			// Social publishing kill-switch. OFF until the Meta/Facebook + LinkedIn
			// app IDs/keys are approved. While false: external publishing, the
			// scheduled-publish cron, social analytics, and social inbox/messaging
			// are hidden in the UI and the publish endpoints hard-refuse. Studio
			// content creation + the manual River/calendar planner (an Earnest-only
			// planning concept) stay live. Flip to true — or set
			// NUXT_PUBLIC_SOCIAL_PUBLISHING_ENABLED=true — to restore everything.
			socialPublishingEnabled: process.env.NUXT_PUBLIC_SOCIAL_PUBLISHING_ENABLED === 'true',

			// Earnest mascot kill-switch. ON by default; the reactive logo "E" that
			// morphs on real events (see <EarnestMascot> / useEarnestMascot). Set
			// NUXT_PUBLIC_EARNEST_MASCOT_ENABLED=false to hide it everywhere with no
			// code change. A per-user toggle (Account → Appearance) and
			// prefers-reduced-motion further gate it; this flag overrides both.
			earnestMascotEnabled: process.env.NUXT_PUBLIC_EARNEST_MASCOT_ENABLED !== 'false',

			// Demo AI mock kill-switch. ON by default. When on, the shared public
			// demo logins (demo@ / demo-agency@earnest.guru) get canned AI responses
			// instead of hitting the real Anthropic API — so visitors can't burn real
			// tokens on our key — while the AI usage dashboard keeps growing (mock
			// still logs usage). Set NUXT_PUBLIC_DEMO_AI_MOCK=false to flip demo
			// sessions back to real AI with no rebuild (the ~100k/day org cap still
			// bounds spend). Only affects demo-workspace sessions; see
			// server/middleware/demo-ai-mock.ts + server/utils/llm/mock-claude.ts.
			demoAiMock: process.env.NUXT_PUBLIC_DEMO_AI_MOCK !== 'false',

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

			// Web Push (VAPID public key — safe to expose; private key stays server-side)
			vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',

			// SSO provider flags (controls which buttons appear on login)
			appleClientId: process.env.APPLE_CLIENT_ID || '',

			// Default team
			defaultTeamId: process.env.NUXT_PUBLIC_DEFAULT_TEAM_ID || 'org-default',

			// Build identity — used by the deploy-update checker (plugins/app-update.client.ts).
			// Baked into the client bundle at build time; the live /api/version route reports
			// the running server's value. When they diverge, a new deploy is live and we prompt
			// the user to refresh. Vercel sets VERCEL_GIT_COMMIT_SHA on every deploy.
			buildId:
				process.env.NUXT_PUBLIC_BUILD_ID ||
				process.env.VERCEL_GIT_COMMIT_SHA ||
				'dev',

			// Human-readable semantic version, sourced from package.json. Shown
			// in the About panel + avatar menu so a user can confirm at a glance
			// which release they're on. Bump package.json "version" on each release.
			appVersion,

			// Public base URL of the deployed CardDesk app. Used to deep-link a
			// cd_contact to its detail page in CardDesk (`/c/<id>`).
			cardDeskUrl: process.env.NUXT_PUBLIC_CARDDESK_URL || 'https://carddesk.earnest.guru',
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
			'ph',
			'wi',
			'meteocons',
			'material-symbols',
			'material-symbols-light',
			'logos',
			'simple-icons',
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

	// Pin the dev server to IPv4 127.0.0.1. Without this, Nitro's HMR
	// upgrade socket binds IPv6 *:3000 alongside Vite's IPv4 listener
	// — `localhost` then resolves to ::1 first on macOS and hits an
	// HTTP-only request to a WebSocket port (HTTP 426 Upgrade Required),
	// breaking ad-hoc curls and the preview-MCP browser. Single-stack v4
	// makes both `localhost` (after Happy Eyeballs fallback) and
	// `127.0.0.1` work consistently.
	devServer: {
		host: '127.0.0.1',
	},

	routeRules: {
		// Time Tracker now lives inline on the Work app as `?floor=time`
		// (retainer/social Phase 2, 2026-05-18). Keep legacy URLs working
		// as permanent redirects.
		'/time-tracker': { redirect: { to: '/apps/work?floor=time', statusCode: 301 } },
		'/apps/work/time': { redirect: { to: '/apps/work?floor=time', statusCode: 301 } },
		// The booking flow is framed cross-origin — by CardDesk's card embed
		// (carddesk.earnest.guru) and by Earnest's own third-party booking embed.
		// No X-Frame-Options is sent today; set frame-ancestors explicitly so
		// framing stays allowed by intent and survives any future global CSP.
		'/book/**': { headers: { 'Content-Security-Policy': 'frame-ancestors *' } },
	},

	nitro: {
		// Enable AsyncLocalStorage-backed request context so deep server utils
		// (e.g. getLLMProvider in server/utils/llm/factory.ts) can read the current
		// event via useEvent() without threading it through every callsite. Used to
		// route the shared demo logins to the mock AI provider. If context is ever
		// lost across an async boundary, the factory falls back to the real
		// provider — safe because the ~100k/day demo-org token cap bounds spend.
		experimental: {
			asyncContext: true,
		},
		// Transactional MJML templates (server/emails/*.mjml) are imported as
		// strings in server/utils/email-templates.ts. This rollup plugin turns a
		// `.mjml` import into `export default "<raw contents>"` so the templates
		// are bundled + traced into the serverless output. (nitro.serverAssets +
		// useStorage proved unreliable on Vercel — the storage came back empty.)
		rollupConfig: {
			plugins: [
				{
					name: 'raw-mjml',
					transform(code: string, id: string) {
						if (id.endsWith('.mjml')) {
							return { code: `export default ${JSON.stringify(code)};`, map: null };
						}
						return null;
					},
				},
			],
		},
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

	// Disable build sourcemaps to shave peak memory (and time) off the Nitro/
	// rollup build — server sourcemaps default on and are a big contributor to
	// the Vercel build-container OOM. Prod stack traces stay readable enough
	// via Nitro's own error handling; flip back on locally if deep-debugging.
	sourcemap: false,

	build: {
		transpile: ['@sendgrid/mail', 'swiper', 'gsap', '@vueuse/core', 'mjml', 'handlebars'],
	},
});
