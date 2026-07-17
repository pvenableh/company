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
import { EARNEST_LOGO_URL, type OrgBrandRef } from './email-shell';

// Templates are imported as strings (the raw-mjml rollup plugin in
// nuxt.config.ts turns each `.mjml` into `export default "<contents>"`), so
// they're bundled + traced into the serverless output. This replaced
// nitro.serverAssets, which came back empty at runtime on Vercel.
import layoutMjml from '../emails/_layout.mjml';
import headerMjml from '../emails/_header.mjml';
import footerMjml from '../emails/_footer.mjml';
import welcomeMjml from '../emails/welcome.mjml';
import earlyAccessWelcomeMjml from '../emails/early-access-welcome.mjml';
import inviteMjml from '../emails/invite.mjml';
import notificationMjml from '../emails/notification.mjml';
import passwordResetMjml from '../emails/password-reset.mjml';
import tokenPurchaseMjml from '../emails/token-purchase.mjml';
import tokenRefundMjml from '../emails/token-refund.mjml';
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
	'early-access-welcome': earlyAccessWelcomeMjml,
	invite: inviteMjml,
	notification: notificationMjml,
	'password-reset': passwordResetMjml,
	'token-purchase': tokenPurchaseMjml,
	'token-refund': tokenRefundMjml,
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

// Header logo sizing. Org logos vary wildly in aspect ratio, so we can't force
// one box — the old fixed 220×40 stretched anything that wasn't 5.5:1 (the
// reported bug). Instead we read the file's real dimensions and scale to a
// consistent display HEIGHT, capping absurdly wide wordmarks by width.
const TARGET_LOGO_HEIGHT = 50; // px, display height of the header logo
const MAX_LOGO_WIDTH = 240; // px, cap for very wide wordmarks

const orgLogoCache = new Map<string, { url: string; width: number; height: number }>();

/**
 * Resolve an org logo to a URL + an aspect-correct display box {width,height}.
 * width/height always match the image's true ratio, so nothing stretches in any
 * client (Outlook included — we emit explicit px, not CSS max-width). Falls back
 * to a letterboxed fixed box only when the file's real dimensions can't be read.
 */
async function resolveOrgLogo(logoId: string | null | undefined): Promise<{ url: string; width: number; height: number } | null> {
	if (!logoId) return null;
	const cached = orgLogoCache.get(logoId);
	if (cached) return cached;

	const config = useRuntimeConfig() as any;
	const directusUrl = config.directus?.url || config.public?.directusUrl;
	if (!directusUrl) return null;
	const base = String(directusUrl).replace(/\/$/, '');
	const id = encodeURIComponent(logoId);

	let width = 180;
	let height = TARGET_LOGO_HEIGHT;
	let boxed = true; // letterbox fallback when true dimensions are unknown

	try {
		const token = config.directusServerToken;
		const meta: any = await $fetch(`${base}/files/${id}`, {
			query: { fields: 'width,height' },
			headers: token ? { Authorization: `Bearer ${token}` } : undefined,
		});
		const w = Number(meta?.data?.width);
		const h = Number(meta?.data?.height);
		if (w > 0 && h > 0) {
			boxed = false;
			width = Math.min(MAX_LOGO_WIDTH, Math.round(TARGET_LOGO_HEIGHT * (w / h)));
			height = Math.round(width * (h / w)); // recompute if width was capped
		}
	} catch {
		// Metadata unavailable — fall through to the letterboxed fixed box.
	}

	// 2× source for retina. When boxed, request a contain-fit box so a fixed
	// display size letterboxes (pads) instead of stretching an unknown aspect.
	const q = boxed
		? `width=${MAX_LOGO_WIDTH * 2}&height=${TARGET_LOGO_HEIGHT * 2}&fit=contain`
		: `height=${height * 2}&fit=contain`;
	const resolved = { url: `${base}/assets/${id}?${q}`, width: boxed ? MAX_LOGO_WIDTH : width, height };
	orgLogoCache.set(logoId, resolved);
	return resolved;
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
		// Keep the destination for links (CTAs especially) — otherwise a
		// plain-text reader sees the button label with no way to reach it.
		.replace(/<a\b[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, inner) => {
			const label = String(inner).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
			if (!/^https?:\/\//i.test(href)) return label;
			return label && label !== href ? `${label}: ${href}` : href;
		})
		.replace(/<[^>]+>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/[ \t]+/g, ' ')
		// MJML's nested-table output leaves hundreds of whitespace-only lines.
		// Trim the spaces hugging every newline so those lines become empty,
		// THEN collapse runs — otherwise `\n{3,}` never matches (each blank
		// line still holds a stray space) and the plain-text part is unreadable.
		.replace(/ *\n */g, '\n')
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

async function brandVars(brand: BrandContext): Promise<Record<string, any>> {
	const org = brand.org;
	const useOrg = !!org;
	const orgName = (org?.name && String(org.name).trim()) || 'Your team';
	const brandColor = (org?.brand_color && String(org.brand_color).trim()) || EARNEST_BRAND_COLOR;
	const logo = await resolveOrgLogo(org?.logo ?? null);
	return {
		useOrg,
		orgName,
		brandColor,
		logoUrl: logo?.url ?? null,
		// Aspect-correct display box for the header logo (no stretch).
		logoWidth: logo?.width ?? MAX_LOGO_WIDTH,
		logoHeight: logo?.height ?? TARGET_LOGO_HEIGHT,
		// Earnest wordmark lockup for the email header (Earnest-chrome sends).
		// Single source of truth lives in email-shell.ts (EARNEST_LOGO_URL) so the
		// MJML shell and the legacy inline shell always render the same logo. It's
		// an absolute public URL, so it also renders in local previews.
		earnestLogoUrl: EARNEST_LOGO_URL,
		glassBgUrl: appAsset('/email/bg-glass.jpg'),
		// Early-access welcome imagery (ignored by other templates). Hosted on
		// Directus (like earnestLogoUrl) rather than app /public, so the email
		// renders in every environment with no app deploy and marketing can swap a
		// file without shipping code. Source PNGs live in public/email/ (+ icons/)
		// as the regeneration source of truth — the crop/chip recipes are in the
		// template's design-notes comment; re-upload to Directus and update the
		// asset id here if they change.
		//   hero  aaf911bc-5784-4708-965a-e758d1db7aba (public/email/hero-command-center.png)
		//   rail  8ddd686a-8372-4cf0-9287-89fe36a16318 (public/email/detail-app-rail.png)
		//   icons public/email/icons/<app>.png
		eaHeroUrl: 'https://admin.earnest.guru/assets/aaf911bc-5784-4708-965a-e758d1db7aba',
		eaRailUrl: 'https://admin.earnest.guru/assets/8ddd686a-8372-4cf0-9287-89fe36a16318',
		eaIconHome: 'https://admin.earnest.guru/assets/838e8e51-611e-4080-9fe2-9431a2379022',
		eaIconPeople: 'https://admin.earnest.guru/assets/100119aa-d42e-4994-b4e2-e2bfaf1b43b1',
		eaIconWork: 'https://admin.earnest.guru/assets/67bee3a7-1b2c-4ad7-8629-1125f9f1756d',
		eaIconChannels: 'https://admin.earnest.guru/assets/fb0afea8-52c8-441b-945e-2b47ae9beca1',
		eaIconMoney: 'https://admin.earnest.guru/assets/723857d9-dde8-44c0-ab95-92e4171b8a6f',
		eaIconMarketing: 'https://admin.earnest.guru/assets/5916955d-7638-493a-94aa-7be1252a191e',
		eaIconAi: 'https://admin.earnest.guru/assets/b6b77a9e-c3ce-41ed-b870-89459b11f767',
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
	const mergedVars = { ...(await brandVars(brand)), ...vars };

	const { html, errors } = compileMjml(combined, mergedVars);
	if (errors.length) {
		console.warn(`[email-templates] "${name}" compiled with warnings:`, errors.join('; '));
	}

	const text = typeof vars.text === 'string' && vars.text.trim()
		? vars.text
		: htmlToText(html);

	return { html, text, errors };
}
