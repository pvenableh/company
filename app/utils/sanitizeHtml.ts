/**
 * Sanitize HTML stored on invoices/line-items before rendering with v-html.
 *
 * Allowlist is intentionally narrow — invoice line-item descriptions and
 * notes only need basic formatting (bold/italic/lists) and the time-block
 * tables that `generateInvoiceFromEntries` produces.
 *
 * `isomorphic-dompurify` works in both Nuxt SSR (Node) and the browser.
 */
import DOMPurify from 'isomorphic-dompurify';

const INVOICE_ALLOWED_TAGS = [
	'p', 'br', 'strong', 'em', 'u', 'i', 'b',
	'ul', 'ol', 'li',
	'table', 'thead', 'tbody', 'tr', 'td', 'th',
	'a',
];

const INVOICE_ALLOWED_ATTRS = ['href', 'target', 'rel', 'class'];

export function sanitizeInvoiceHtml(input: string | null | undefined): string {
	if (!input) return '';
	return DOMPurify.sanitize(input, {
		ALLOWED_TAGS: INVOICE_ALLOWED_TAGS,
		ALLOWED_ATTR: INVOICE_ALLOWED_ATTRS,
		// Normalize anchors so they don't leak referrer
		ADD_ATTR: ['target', 'rel'],
	});
}
