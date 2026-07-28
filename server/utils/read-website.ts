// server/utils/read-website.ts
/**
 * Guarded website reader — fetches a public URL and extracts readable text for
 * use as LLM context (onboarding brand-voice drafting).
 *
 * Safety: this fetches a user-supplied URL server-side, so it MUST guard against
 * SSRF. We only allow http/https, reject localhost / private / link-local /
 * metadata hosts, cap the response size, and time out fast. The extracted text
 * is truncated to a token-friendly budget. Never throws for a bad site — returns
 * `{ ok: false }` so callers degrade gracefully to industry-only drafting.
 */

const MAX_BYTES = 600_000; // ~600KB of HTML is plenty for the readable head
const MAX_TEXT_CHARS = 5000; // token budget for the LLM context excerpt
const TIMEOUT_MS = 8000;

export interface WebsiteRead {
	ok: boolean;
	url?: string;
	title?: string;
	description?: string;
	text?: string;
	reason?: string;
}

/** Block localhost, private, link-local, and cloud-metadata hosts (SSRF guard). */
function isBlockedHost(hostname: string): boolean {
	const h = hostname.toLowerCase();
	if (h === 'localhost' || h.endsWith('.localhost') || h === '::1') return true;
	// Cloud metadata endpoint
	if (h === '169.254.169.254' || h === 'metadata.google.internal') return true;
	// IPv4 literals in private / loopback / link-local ranges
	const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
	if (m) {
		const [a, b] = [Number(m[1]), Number(m[2])];
		if (a === 127 || a === 10 || a === 0) return true; // loopback / private / this-host
		if (a === 192 && b === 168) return true;
		if (a === 172 && b >= 16 && b <= 31) return true;
		if (a === 169 && b === 254) return true; // link-local
	}
	// Obvious internal-only names
	if (!h.includes('.')) return true; // bare hostnames (no TLD) → internal
	return false;
}

function normalizeUrl(raw: string): URL | null {
	let candidate = String(raw || '').trim();
	if (!candidate) return null;
	if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`;
	try {
		const u = new URL(candidate);
		if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
		return u;
	} catch {
		return null;
	}
}

/** Strip tags/scripts and collapse whitespace into readable text. */
function htmlToText(html: string): { title: string; description: string; text: string } {
	const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
	const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
		|| html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i);

	const body = html
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
		.replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
		.replace(/<!--[\s\S]*?-->/g, ' ')
		.replace(/<[^>]+>/g, ' ');

	const decoded = body
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&[a-z]+;/gi, ' ');

	const text = decoded.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_CHARS);
	const clean = (s?: string) => (s || '').replace(/\s+/g, ' ').trim().slice(0, 300);
	return { title: clean(titleMatch?.[1]), description: clean(descMatch?.[1]), text };
}

export async function readWebsite(rawUrl: string): Promise<WebsiteRead> {
	const url = normalizeUrl(rawUrl);
	if (!url) return { ok: false, reason: 'invalid-url' };
	if (isBlockedHost(url.hostname)) return { ok: false, reason: 'blocked-host' };

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		const res = await fetch(url.toString(), {
			method: 'GET',
			redirect: 'follow',
			signal: controller.signal,
			headers: {
				'user-agent': 'EarnestBot/1.0 (+https://earnest.guru; onboarding brand reader)',
				accept: 'text/html,application/xhtml+xml',
			},
		});
		if (!res.ok) return { ok: false, url: url.toString(), reason: `http-${res.status}` };

		const ct = res.headers.get('content-type') || '';
		if (!/text\/html|application\/xhtml/i.test(ct)) {
			return { ok: false, url: url.toString(), reason: 'not-html' };
		}

		// Read up to MAX_BYTES, then abort the stream.
		const reader = res.body?.getReader();
		if (!reader) return { ok: false, url: url.toString(), reason: 'no-body' };
		const chunks: Uint8Array[] = [];
		let received = 0;
		while (received < MAX_BYTES) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value) {
				chunks.push(value);
				received += value.length;
			}
		}
		try { await reader.cancel(); } catch { /* ignore */ }

		const html = new TextDecoder('utf-8').decode(
			chunks.reduce((acc, c) => {
				const merged = new Uint8Array(acc.length + c.length);
				merged.set(acc);
				merged.set(c, acc.length);
				return merged;
			}, new Uint8Array(0)),
		);

		const { title, description, text } = htmlToText(html);
		if (!text || text.length < 40) return { ok: false, url: url.toString(), reason: 'empty' };
		return { ok: true, url: url.toString(), title, description, text };
	} catch (err: any) {
		return { ok: false, url: url.toString(), reason: err?.name === 'AbortError' ? 'timeout' : 'fetch-failed' };
	} finally {
		clearTimeout(timer);
	}
}
