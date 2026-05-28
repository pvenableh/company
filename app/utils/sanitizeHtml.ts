/**
 * Sanitize HTML stored on invoices/line-items before rendering with v-html.
 *
 * Pure-regex allow-list pass — runs identically in Node SSR (Vercel) and
 * the browser. We can't use `isomorphic-dompurify` server-side because its
 * `html-encoding-sniffer` transitive dep is ESM and crashes Vercel's
 * serverless runtime with ERR_REQUIRE_ESM (the public invoice page must
 * SSR for unauthenticated viewers).
 */

const INVOICE_ALLOWED_TAGS = new Set([
	'p', 'br', 'strong', 'em', 'u', 'i', 'b',
	'ul', 'ol', 'li',
	'table', 'thead', 'tbody', 'tr', 'td', 'th',
	'a',
]);

const VOID_TAGS = new Set(['br']);
const SAFE_HREF = /^(https?:|mailto:|tel:|\/|#)/i;

function pickAttrs(rawAttrs: string, tag: string): string {
	const out: string[] = [];
	const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(rawAttrs)) !== null) {
		const name = m[1].toLowerCase();
		const value = m[2] ?? m[3] ?? m[4] ?? '';
		if (name === 'class') {
			const cleaned = value.replace(/[^a-zA-Z0-9 _-]/g, '').trim();
			if (cleaned) out.push(`class="${cleaned}"`);
			continue;
		}
		if (tag === 'a') {
			if (name === 'href') {
				if (SAFE_HREF.test(value.trim())) {
					out.push(`href="${value.replace(/"/g, '&quot;')}"`);
				}
				continue;
			}
			if (name === 'target') {
				out.push('target="_blank"');
				continue;
			}
			if (name === 'rel') {
				out.push('rel="noopener noreferrer"');
				continue;
			}
		}
	}
	if (tag === 'a' && !out.some(a => a.startsWith('rel='))) out.push('rel="noopener noreferrer"');
	return out.length ? ' ' + out.join(' ') : '';
}

export function sanitizeInvoiceHtml(input: string | null | undefined): string {
	if (!input) return '';
	let html = String(input);
	html = html.replace(/<\s*(script|style|iframe|svg|math|object|embed|link|meta)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
	html = html.replace(/<\s*(script|style|iframe|svg|math|object|embed|link|meta)\b[^>]*\/?>/gi, '');
	html = html.replace(/<!--[\s\S]*?-->/g, '');
	html = html.replace(/<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (_match, slash, tagName, rawAttrs) => {
		const t = String(tagName).toLowerCase();
		if (!INVOICE_ALLOWED_TAGS.has(t)) return '';
		if (slash) return `</${t}>`;
		if (VOID_TAGS.has(t)) return `<${t}>`;
		return `<${t}${pickAttrs(rawAttrs, t)}>`;
	});
	return html;
}
