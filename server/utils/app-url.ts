import type { H3Event } from 'h3';

/**
 * Absolute base URL for building Stripe redirect / success / cancel URLs and
 * Connect OAuth redirect URIs.
 *
 * Prefers the origin the request actually came from — correct in production
 * (custom domain), preview, and local dev — so we NEVER hard-code a host or fall
 * back to `http://localhost:3000` in production. The old `process.env.APP_URL ||
 * 'http://localhost:3000'` pattern sent live token purchases and Connect OAuth to
 * localhost whenever APP_URL was unset in the deploy env.
 *
 * Falls back to the configured public appUrl (APP_URL → SITE_URL →
 * https://app.earnest.guru) when the request origin can't be determined, and
 * refuses to return a localhost origin in production (host-header edge cases) —
 * the value must match Stripe's registered redirect URIs.
 */
export function getAppBaseUrl(event: H3Event): string {
	const configured = ((useRuntimeConfig(event).public as any)?.appUrl as string) || 'https://app.earnest.guru';
	try {
		const origin = getRequestURL(event).origin;
		if (origin && !(process.env.NODE_ENV === 'production' && /localhost|127\.0\.0\.1/.test(origin))) {
			return origin;
		}
	} catch {
		// fall through to configured
	}
	return configured;
}
