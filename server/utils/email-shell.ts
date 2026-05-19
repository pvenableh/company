// server/utils/email-shell.ts
/**
 * Branded transactional email shells.
 *
 * Two-tier branding:
 *   - renderEarnestEmail()  → Earnest is the sender (welcome, future billing)
 *   - renderOrgEmail()      → org-to-client (notifications, meeting/video invites)
 *
 * Marketing emails are intentionally out of scope — they have their own
 * shells (marketing-send.ts MJML newsletter, mdToHtml campaigns) and will
 * be wrapped in Stage 2.
 *
 * HTML rules (email-client compat):
 *   - Inline CSS only, no <style> blocks, no CSS variables.
 *   - max-width 560px container; sans-serif system stack; 16px body.
 *   - No flexbox, no background-image, no media queries.
 *   - Logo: 40px tall, 200px max wide.
 *   - Footer 12px / #888; "Powered by Earnest" suppressed when
 *     org.whitelabel === true.
 */

interface CtaSpec {
	label: string;
	url: string;
}

interface EarnestShellArgs {
	subject: string;
	preheader?: string | null;
	heading?: string | null;
	bodyHtml: string;
	cta?: CtaSpec | null;
}

export interface OrgBrandRef {
	id: string;
	name?: string | null;
	logo?: string | null;
	brand_color?: string | null;
	whitelabel?: boolean | null;
	website?: string | null;
	mailing_address?: string | null;
}

interface OrgShellArgs extends EarnestShellArgs {
	org: OrgBrandRef | null | undefined;
	/**
	 * Marketing-only fields (CAN-SPAM). When present, the footer adds an
	 * unsubscribe link and the org's physical mailing address. Transactional
	 * sends omit both.
	 */
	unsubscribeUrl?: string | null;
	physicalAddress?: string | null;
}

interface RenderedEmail {
	html: string;
	text: string;
}

const EARNEST_BRAND_COLOR = '#141210';
const EARNEST_HOME = 'https://earnest.guru';

function escapeHtml(input: unknown): string {
	return String(input ?? '').replace(/[&<>"']/g, (c) => ({
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#39;',
	}[c]!));
}

function escapeAttr(input: unknown): string {
	return escapeHtml(input);
}

/**
 * Best-effort URL sanity check — only http/https URLs get rendered as links.
 * Anything else (mailto, javascript:, malformed) becomes plain text.
 */
function safeUrl(url: string | null | undefined): string | null {
	if (!url) return null;
	const trimmed = String(url).trim();
	if (!/^https?:\/\//i.test(trimmed)) return null;
	return trimmed;
}

function htmlToText(html: string): string {
	return html
		.replace(/<style[\s\S]*?<\/style>/gi, '')
		.replace(/<script[\s\S]*?<\/script>/gi, '')
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/(p|div|h1|h2|h3|li|tr)>/gi, '\n')
		.replace(/<li[^>]*>/gi, '- ')
		.replace(/<[^>]+>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/[ \t]+/g, ' ')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

function getDirectusAssetUrl(logoId: string | null | undefined): string | null {
	if (!logoId) return null;
	const config = useRuntimeConfig();
	const directusUrl = (config as any).directus?.url || config.public?.directusUrl;
	if (!directusUrl) return null;
	return `${String(directusUrl).replace(/\/$/, '')}/assets/${encodeURIComponent(logoId)}?height=80&fit=contain`;
}

function preheaderBlock(text: string | null | undefined): string {
	if (!text) return '';
	// Hidden preheader — shows in the inbox preview without rendering in-body.
	return `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#fff;opacity:0;">${escapeHtml(text)}</div>`;
}

function ctaBlock(cta: CtaSpec | null | undefined, accent: string): string {
	if (!cta) return '';
	const url = safeUrl(cta.url);
	if (!url) return '';
	const bg = accent || EARNEST_BRAND_COLOR;
	return `
		<p style="margin:28px 0 12px;">
			<a href="${escapeAttr(url)}" style="display:inline-block;background:${escapeAttr(bg)};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:14px;font-weight:600;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">${escapeHtml(cta.label)}</a>
		</p>
		<p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:#888;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">Or open this link: <a href="${escapeAttr(url)}" style="color:#888;">${escapeHtml(url)}</a></p>
	`;
}

function earnestHeaderBlock(): string {
	return `
		<tr>
			<td style="padding:24px 32px 8px 32px;text-align:left;">
				<a href="${EARNEST_HOME}" style="text-decoration:none;color:${EARNEST_BRAND_COLOR};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:18px;font-weight:700;letter-spacing:-0.01em;">Earnest</a>
			</td>
		</tr>
	`;
}

function orgHeaderBlock(org: OrgBrandRef | null | undefined): string {
	const accent = org?.brand_color || EARNEST_BRAND_COLOR;
	const logoUrl = getDirectusAssetUrl(org?.logo ?? null);
	const orgWebsite = safeUrl(org?.website);
	const orgName = (org?.name && String(org.name).trim()) || 'Your team';

	let inner: string;
	if (logoUrl) {
		const img = `<img src="${escapeAttr(logoUrl)}" alt="${escapeAttr(orgName)}" height="40" style="display:block;height:40px;max-height:40px;width:auto;max-width:200px;border:0;outline:none;" />`;
		inner = orgWebsite
			? `<a href="${escapeAttr(orgWebsite)}" style="text-decoration:none;">${img}</a>`
			: img;
	} else {
		const nameMarkup = `<span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:18px;font-weight:700;letter-spacing:-0.01em;color:${escapeAttr(accent)};">${escapeHtml(orgName)}</span>`;
		inner = orgWebsite
			? `<a href="${escapeAttr(orgWebsite)}" style="text-decoration:none;">${nameMarkup}</a>`
			: nameMarkup;
	}

	return `
		<tr>
			<td style="padding:24px 32px 8px 32px;text-align:left;">${inner}</td>
		</tr>
	`;
}

function earnestFooterBlock(): string {
	return `
		<tr>
			<td style="padding:24px 32px 32px 32px;border-top:1px solid #eeeeee;">
				<p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:12px;line-height:1.6;color:#888888;">
					This is an automated message from <a href="${EARNEST_HOME}" style="color:#888888;text-decoration:underline;">Earnest</a>.
				</p>
			</td>
		</tr>
	`;
}

function orgFooterBlock(
	org: OrgBrandRef | null | undefined,
	unsubscribeUrl?: string | null,
	physicalAddress?: string | null,
): string {
	const orgName = (org?.name && String(org.name).trim()) || 'this team';
	const whitelabel = org?.whitelabel === true;
	const tag = whitelabel
		? `This is an automated message from ${escapeHtml(orgName)}.`
		: `This is an automated message from ${escapeHtml(orgName)}. <span style="color:#aaaaaa;">Powered by <a href="${EARNEST_HOME}" style="color:#aaaaaa;text-decoration:underline;">Earnest</a>.</span>`;

	const unsubUrl = safeUrl(unsubscribeUrl);
	const addr = (physicalAddress && String(physicalAddress).trim()) || '';
	const addrHtml = addr ? escapeHtml(addr).replace(/\n/g, '<br />') : '';
	const marketingBlock = unsubUrl || addr
		? `
			<p style="margin:12px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:12px;line-height:1.6;color:#888888;">
				${unsubUrl ? `<a href="${escapeAttr(unsubUrl)}" style="color:#888888;text-decoration:underline;">Unsubscribe</a>${addr ? '<br />' : ''}` : ''}${addrHtml}
			</p>
		`
		: '';

	return `
		<tr>
			<td style="padding:24px 32px 32px 32px;border-top:1px solid #eeeeee;">
				<p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:12px;line-height:1.6;color:#888888;">${tag}</p>
				${marketingBlock}
			</td>
		</tr>
	`;
}

function bodyBlock(heading: string | null | undefined, bodyHtml: string, cta: CtaSpec | null | undefined, accent: string): string {
	const headingMarkup = heading && String(heading).trim()
		? `<h1 style="margin:16px 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:24px;line-height:1.3;font-weight:600;color:#141210;">${escapeHtml(heading)}</h1>`
		: '';
	return `
		<tr>
			<td style="padding:8px 32px 16px 32px;">
				${headingMarkup}
				<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:16px;line-height:1.6;color:#333333;">${bodyHtml}</div>
				${ctaBlock(cta, accent)}
			</td>
		</tr>
	`;
}

function wrap(args: { subject: string; preheader?: string | null; header: string; body: string; footer: string }): string {
	const { subject, preheader, header, body, footer } = args;
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="x-apple-disable-message-reformatting" />
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#faf7f4;">
${preheaderBlock(preheader)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#faf7f4;padding:24px 12px;">
	<tr>
		<td align="center">
			<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background-color:#ffffff;border-radius:12px;">
				${header}
				${body}
				${footer}
			</table>
		</td>
	</tr>
</table>
</body>
</html>`;
}

export function renderEarnestEmail(args: EarnestShellArgs): RenderedEmail {
	const html = wrap({
		subject: args.subject,
		preheader: args.preheader,
		header: earnestHeaderBlock(),
		body: bodyBlock(args.heading, args.bodyHtml, args.cta, EARNEST_BRAND_COLOR),
		footer: earnestFooterBlock(),
	});
	const text = htmlToText([args.heading, '', args.bodyHtml, args.cta?.url ? `\n${args.cta.label}: ${args.cta.url}` : ''].join('\n'));
	return { html, text };
}

export function renderOrgEmail(args: OrgShellArgs): RenderedEmail {
	const accent = args.org?.brand_color || EARNEST_BRAND_COLOR;
	const html = wrap({
		subject: args.subject,
		preheader: args.preheader,
		header: orgHeaderBlock(args.org),
		body: bodyBlock(args.heading, args.bodyHtml, args.cta, accent),
		footer: orgFooterBlock(args.org, args.unsubscribeUrl, args.physicalAddress),
	});
	const textLines = [args.heading || '', '', args.bodyHtml, args.cta?.url ? `\n${args.cta.label}: ${args.cta.url}` : ''];
	if (args.unsubscribeUrl) textLines.push('', `Unsubscribe: ${args.unsubscribeUrl}`);
	if (args.physicalAddress) textLines.push(args.physicalAddress);
	const text = htmlToText(textLines.join('\n'));
	return { html, text };
}

/**
 * Re-exported so callers can sanitize untrusted body fragments before
 * stitching them into bodyHtml.
 */
export { escapeHtml };

/**
 * Inject a CAN-SPAM compliance footer (unsubscribe link + physical
 * mailing address + optional "Powered by Earnest" attribution) directly
 * into a fully-rendered MJML email body, immediately before the closing
 * `</body>` tag.
 *
 * Use this for marketing sends where the body is a complete MJML output
 * doc: wrapping such a doc inside renderOrgEmail's transactional shell
 * strips the MJML `<head>` (responsive media queries gone) and nests a
 * 600px content table inside a 560px container. Sends arrive but render
 * broken. This helper keeps the MJML output intact and only appends the
 * legally-required marketing footer.
 *
 * For fragment-bodied sends (markdown → simple paragraphs) keep using
 * renderOrgEmail — the shell is the only thing carrying the chrome.
 */
export function injectMarketingFooter(
	html: string,
	args: {
		org: OrgBrandRef | null | undefined;
		unsubscribeUrl?: string | null;
		physicalAddress?: string | null;
	},
): string {
	const orgName = (args.org?.name && String(args.org.name).trim()) || 'this team';
	const whitelabel = args.org?.whitelabel === true;
	const unsubUrl = safeUrl(args.unsubscribeUrl);
	const addr = (args.physicalAddress && String(args.physicalAddress).trim()) || '';
	const addrHtml = addr ? escapeHtml(addr).replace(/\n/g, '<br />') : '';

	const tag = whitelabel
		? `This is an automated message from ${escapeHtml(orgName)}.`
		: `This is an automated message from ${escapeHtml(orgName)}. <span style="color:#aaaaaa;">Powered by <a href="${EARNEST_HOME}" style="color:#aaaaaa;text-decoration:underline;">Earnest</a>.</span>`;

	const footerHtml = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f4;">
	<tr>
		<td align="center" style="padding:24px 12px;">
			<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
				<tr>
					<td style="padding:16px 24px;border-top:1px solid #e5e5e5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:12px;line-height:1.6;color:#888888;text-align:center;">
						<p style="margin:0 0 8px;">${tag}</p>
						${unsubUrl ? `<p style="margin:0 0 4px;"><a href="${escapeAttr(unsubUrl)}" style="color:#888888;text-decoration:underline;">Unsubscribe</a></p>` : ''}
						${addrHtml ? `<p style="margin:0;color:#aaaaaa;font-size:11px;">${addrHtml}</p>` : ''}
					</td>
				</tr>
			</table>
		</td>
	</tr>
</table>
`;

	// Inject before </body>. If no </body> tag exists (defensive — MJML
	// output always has one), append the footer to the end so the legally
	// required content is still delivered.
	if (/<\/body\s*>/i.test(html)) {
		return html.replace(/<\/body\s*>/i, `${footerHtml}</body>`);
	}
	return html + footerHtml;
}
