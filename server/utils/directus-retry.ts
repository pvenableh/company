// server/utils/directus-retry.ts
/**
 * withTransientRetry — retry a Directus request through a *transient* failure.
 *
 * Diagnosis (2026-07-22): the post-login 500 cluster wasn't a code/schema/data/
 * permission/token bug — the exact queries return 200 when run individually
 * (verified against prod with the real server token). The failures happen only
 * when ~10 authenticated reads fire in parallel on the home load — the signature
 * of a momentary connection / rate-limit / cold-start blip between the app server
 * and Directus. A single quick retry clears that, so a transient hiccup stops
 * surfacing as a hard 500.
 *
 * ONLY transient failures are retried (network resets/timeouts, HTTP 429/5xx).
 * Deterministic errors (400 bad query, 401/403 auth) throw immediately — retrying
 * them would just delay the inevitable and hammer Directus.
 */

const TRANSIENT_NET_CODES = new Set([
	'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'EPIPE', 'ENOTFOUND',
	'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT',
]);
const TRANSIENT_HTTP = new Set([429, 500, 502, 503, 504]);

export function isTransientError(err: any): boolean {
	const code = err?.code || err?.cause?.code || err?.errno || err?.cause?.errno;
	if (code && TRANSIENT_NET_CODES.has(String(code))) return true;

	const status = Number(err?.response?.status ?? err?.status ?? err?.statusCode ?? NaN);
	if (TRANSIENT_HTTP.has(status)) return true;

	const msg = String(err?.message || '').toLowerCase();
	if (msg.includes('socket hang up') || msg.includes('fetch failed') || msg.includes('network') || msg.includes('timeout') || msg.includes('econnreset')) return true;

	return false;
}

export async function withTransientRetry<T>(
	fn: () => Promise<T>,
	opts: { retries?: number; baseMs?: number; label?: string } = {},
): Promise<T> {
	const retries = opts.retries ?? 2;
	const baseMs = opts.baseMs ?? 150;
	let lastErr: any;
	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			return await fn();
		} catch (err) {
			lastErr = err;
			if (attempt === retries || !isTransientError(err)) throw err;
			const wait = baseMs * 2 ** attempt + Math.floor(Math.random() * 60);
			console.warn(
				`[directus-retry]${opts.label ? ' ' + opts.label : ''} transient failure (attempt ${attempt + 1}/${retries + 1}), retrying in ${wait}ms:`,
				(err as any)?.message || err,
			);
			await new Promise((r) => setTimeout(r, wait));
		}
	}
	throw lastErr;
}
