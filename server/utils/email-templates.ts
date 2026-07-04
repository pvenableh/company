// server/utils/email-templates.ts
/**
 * Renderer for the local MJML transactional email templates.
 *
 * Templates live as editable `.mjml` files under `server/emails/` (bundled
 * into the server output via nitro.serverAssets → `assets:emails`):
 *   - `_layout.mjml`     → shared branded chrome (Earnest vs org header/footer)
 *   - `<name>.mjml`      → per-email content sections injected at `<!-- @CONTENT -->`
 *
 * A sender calls `renderBrandedTemplate('welcome', vars, { org })` and gets
 * `{ html, text }` back — same `sendBrandedEmail` transport as before, so
 * delivery is unchanged; only the authoring surface moved to MJML.
 *
 * Branding: pass `brand.org` to render the org-branded variant (logo +
 * brand_color + whitelabel-aware footer). Omit it for Earnest chrome.
 *
 * Dynamic content: plain `{{var}}` values are HTML-escaped by Handlebars.
 * For server-built, already-escaped HTML fragments (e.g. a body with <br>
 * or <strong>), name the var `*Html` and reference it with `{{{fooHtml}}}`
 * in the template.
 */

import { compileMjml } from './mjml-compiler';
import type { OrgBrandRef } from './email-shell';

// Templates are imported as strings (the raw-mjml rollup plugin in
// nuxt.config.ts turns each `.mjml` into `export default "<contents>"`), so
// they're bundled + traced into the serverless output. This replaced
// nitro.serverAssets, which came back empty at runtime on Vercel.
import layoutMjml from '../emails/_layout.mjml';
import headerMjml from '../emails/_header.mjml';
import footerMjml from '../emails/_footer.mjml';
import welcomeMjml from '../emails/welcome.mjml';
import inviteMjml from '../emails/invite.mjml';
import notificationMjml from '../emails/notification.mjml';
import passwordResetMjml from '../emails/password-reset.mjml';
import videoInviteMjml from '../emails/video-invite.mjml';
import genericMjml from '../emails/generic.mjml';
import meetingInvitedMjml from '../emails/meeting-invited.mjml';
import meetingTimeChangedMjml from '../emails/meeting-time-changed.mjml';
import meetingRemovedMjml from '../emails/meeting-removed.mjml';
import meetingCancelledMjml from '../emails/meeting-cancelled.mjml';
import meetingReminderMjml from '../emails/meeting-reminder.mjml';

const TEMPLATES: Record<string, string> = {
	_layout: layoutMjml,
	_header: headerMjml,
	_footer: footerMjml,
	welcome: welcomeMjml,
	invite: inviteMjml,
	notification: notificationMjml,
	'password-reset': passwordResetMjml,
	'video-invite': videoInviteMjml,
	generic: genericMjml,
	'meeting-invited': meetingInvitedMjml,
	'meeting-time-changed': meetingTimeChangedMjml,
	'meeting-removed': meetingRemovedMjml,
	'meeting-cancelled': meetingCancelledMjml,
	'meeting-reminder': meetingReminderMjml,
};

export interface BrandContext {
	org?: (OrgBrandRef & { email_reply_to?: string | null }) | null;
	/** Marketing/CAN-SPAM only — transactional sends omit these. */
	unsubscribeUrl?: string | null;
	physicalAddress?: string | null;
}

export interface RenderedTemplate {
	html: string;
	text: string;
	errors: string[];
}

const EARNEST_BRAND_COLOR = '#141210';

// Cache raw template strings for the process lifetime — the files are
// immutable at runtime (bundled assets); re-reading per send is wasteful.
// Dev HMR replaces the module, so edits still take effect on save.
const templateCache = new Map<string, string>();

async function loadTemplate(name: string): Promise<string> {
	const cached = templateCache.get(name);
	if (cached != null) return cached;

	// Primary: the bundled string import (works in dev + prod).
	let str: string | null = TEMPLATES[name] ?? null;

	// Fallback: read from the source tree on disk. Only reachable if the
	// rollup import somehow didn't inline (e.g. an ad-hoc template name); in
	// dev cwd === project root so this still resolves.
	if (str == null) {
		try {
			const { readFile } = await import('node:fs/promises');
			str = await readFile(`${process.cwd()}/server/emails/${name}.mjml`, 'utf8');
		} catch {
			// reported below
		}
	}
	if (str == null) {
		throw new Error(`[email-templates] template not found: ${name}.mjml`);
	}
	templateCache.set(name, str);
	return str;
}

function safeUrl(url: string | null | undefined): string | null {
	if (!url) return null;
	const trimmed = String(url).trim();
	if (!/^https?:\/\//i.test(trimmed)) return null;
	return trimmed;
}

function directusAssetUrl(logoId: string | null | undefined): string | null {
	if (!logoId) return null;
	const config = useRuntimeConfig() as any;
	const directusUrl = config.directus?.url || config.public?.directusUrl;
	if (!directusUrl) return null;
	return `${String(directusUrl).replace(/\/$/, '')}/assets/${encodeURIComponent(logoId)}?height=80&fit=contain`;
}

/**
 * Minimal HTML→text fallback for the text/plain alternative. Senders may
 * pass an explicit `text` (preferred) — this only runs when they don't.
 */
function htmlToText(html: string): string {
	return html
		.replace(/<style[\s\S]*?<\/style>/gi, '')
		.replace(/<head[\s\S]*?<\/head>/gi, '')
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/(p|div|h1|h2|h3|li|tr|td)>/gi, '\n')
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

function appAsset(path: string): string {
	// Absolute URL to a file under public/ — email needs absolute URLs. The
	// logomark + liquid-glass background are pre-rendered rasters (email clients
	// strip SVG and can't do backdrop-filter); regenerate them with
	// scripts/generate-email-logo.ts and scripts/generate-email-bg.ts.
	const config = useRuntimeConfig() as any;
	const appUrl = config.public?.appUrl || config.public?.siteUrl || 'https://app.earnest.guru';
	return `${String(appUrl).replace(/\/$/, '')}${path}`;
}

function brandVars(brand: BrandContext): Record<string, any> {
	const org = brand.org;
	const useOrg = !!org;
	const orgName = (org?.name && String(org.name).trim()) || 'Your team';
	const brandColor = (org?.brand_color && String(org.brand_color).trim()) || EARNEST_BRAND_COLOR;
	return {
		useOrg,
		orgName,
		brandColor,
		logoUrl: directusAssetUrl(org?.logo ?? null),
		earnestLogoUrl: appAsset('/email/earnest-logo.png'),
		glassBgUrl: appAsset('/email/bg-glass.jpg'),
		orgWebsite: safeUrl(org?.website),
		whitelabel: org?.whitelabel === true,
		unsubscribeUrl: safeUrl(brand.unsubscribeUrl),
		physicalAddress: (brand.physicalAddress && String(brand.physicalAddress).trim()) || null,
	};
}

/**
 * Render a transactional MJML template into { html, text }.
 *
 * @param name  Template basename under server/emails (without `.mjml`).
 * @param vars  Content variables. `subject` + `preheader` drive the <head>;
 *              `text` (optional) overrides the auto-derived plain-text part.
 * @param brand Org/compliance context for the chrome.
 */
export async function renderBrandedTemplate(
	name: string,
	vars: Record<string, any> = {},
	brand: BrandContext = {},
): Promise<RenderedTemplate> {
	const [layout, header, footer, content] = await Promise.all([
		loadTemplate('_layout'),
		loadTemplate('_header'),
		loadTemplate('_footer'),
		loadTemplate(name),
	]);

	// Compose the shell from its partials, then inject the per-email content.
	const combined = layout
		.replace('<!-- @HEADER -->', header)
		.replace('<!-- @CONTENT -->', content)
		.replace('<!-- @FOOTER -->', footer);
	const mergedVars = { ...brandVars(brand), ...vars };

	const { html, errors } = compileMjml(combined, mergedVars);
	if (errors.length) {
		console.warn(`[email-templates] "${name}" compiled with warnings:`, errors.join('; '));
	}

	const text = typeof vars.text === 'string' && vars.text.trim()
		? vars.text
		: htmlToText(html);

	return { html, text, errors };
}
