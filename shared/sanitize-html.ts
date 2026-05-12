/**
 * Tiny HTML sanitizer for LLM-produced agenda fragments and other constrained
 * markup. We can't use `isomorphic-dompurify` on Vercel's serverless runtime
 * (its `html-encoding-sniffer` dep blows up with ERR_REQUIRE_ESM), and we
 * don't want to ship DOMPurify just for the client side either — so this
 * allow-list pass runs identically in Node and the browser.
 */

export const AGENDA_ALLOWED_TAGS = ['h3', 'h4', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'br'] as const;

export function sanitizeAgendaHtml(input: string, allowedTags: readonly string[] = AGENDA_ALLOWED_TAGS): string {
	if (!input) return '';
	let html = input;
	html = html.replace(/<\s*(script|style|iframe|svg|math)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
	html = html.replace(/<!--[\s\S]*?-->/g, '');
	const allow = new Set(allowedTags.map(t => t.toLowerCase()));
	html = html.replace(/<\s*\/?\s*([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (match, tagName) => {
		const t = String(tagName).toLowerCase();
		if (!allow.has(t)) return '';
		const isClosing = /^<\s*\//.test(match);
		const isSelfClosing = /\/\s*>$/.test(match);
		if (isClosing) return `</${t}>`;
		if (isSelfClosing || t === 'br') return `<${t}>`;
		return `<${t}>`;
	});
	return html;
}
