// server/utils/email-send.ts
/**
 * Thin SendGrid wrapper used by every transactional sender in Stage 1.
 *
 * Resolves:
 *   - fromName: org.name when an org is supplied, else SENDGRID_FROM_NAME.
 *   - replyTo: org.email_reply_to → arg.replyTo → SENDGRID_REPLY_TO_EMAIL.
 *   - bcc: SENDGRID_BCC_EMAIL (kept in sync with existing senders).
 *
 * The from-address itself stays global (`hello@earnest.guru`). Per-org
 * sending domains are Stage 4 (Domain Authentication).
 *
 * Returns { sent: boolean, reason? } — every transactional path treats
 * email as best-effort, so this never throws.
 */

import { readItem } from '@directus/sdk';
import type { OrgBrandRef } from './email-shell';

interface SendArgs {
	to: string;
	subject: string;
	html: string;
	text?: string | null;
	/** Optional org context — drives fromName + replyTo. */
	org?: OrgBrandRef | null;
	/** Explicit reply-to override; otherwise falls through org.email_reply_to → global. */
	replyTo?: string | null;
	/** Extra SendGrid `categories`; auto-prepended with 'earnest'. */
	categories?: string[];
	/**
	 * Human-readable name of this email kind (e.g. 'invite', 'meeting-invited',
	 * 'welcome'). Becomes the `email_name` custom arg on the webhook event so
	 * we can filter events without joining back to Directus. When omitted we
	 * derive it from the most-specific (last) category.
	 */
	emailName?: string;
	/**
	 * Directus collection that drove the send (e.g. 'emails' for newsletter,
	 * 'org_memberships' for invite, 'video_meetings' for meeting). Stored as
	 * the `send_collection` custom arg.
	 */
	sendCollection?: string;
	/** Directus row id within `sendCollection`. Stored as the `send_id` custom arg. */
	sendId?: string | number | null;
	/** Extra SendGrid `custom_args`; merged on top of auto-attached args. */
	customArgs?: Record<string, string>;
}

interface SendResult {
	sent: boolean;
	reason?: string;
}

const ORG_BRAND_FIELDS = ['id', 'name', 'logo', 'brand_color', 'whitelabel', 'website', 'email_reply_to', 'mailing_address'] as const;

/**
 * Fetches the minimum brand+reply-to context for an org. Returns null on
 * any failure — callers fall back to Earnest defaults.
 *
 * Uses the server token (getServerDirectus) because most transactional
 * sends happen on flows that don't carry an end-user session (webhooks,
 * cron, reminder loops, internal notify-event fan-out).
 */
export async function fetchOrgBrand(orgId: string | null | undefined): Promise<(OrgBrandRef & { email_reply_to?: string | null }) | null> {
	if (!orgId) return null;
	try {
		const directus = getServerDirectus();
		const row = (await directus.request(
			readItem('organizations' as any, orgId, { fields: ORG_BRAND_FIELDS as any }),
		)) as any;
		if (!row) return null;
		return {
			id: row.id,
			name: row.name ?? null,
			logo: typeof row.logo === 'object' ? row.logo?.id ?? null : row.logo ?? null,
			brand_color: row.brand_color ?? null,
			whitelabel: row.whitelabel ?? null,
			website: row.website ?? null,
			email_reply_to: row.email_reply_to ?? null,
			mailing_address: row.mailing_address ?? null,
		};
	} catch (err) {
		console.warn('[email-send] fetchOrgBrand failed:', (err as any)?.message || err);
		return null;
	}
}

export async function sendBrandedEmail(args: SendArgs): Promise<SendResult> {
	const { to, subject, html, text, org, replyTo, categories, emailName, sendCollection, sendId, customArgs } = args;

	if (!to) return { sent: false, reason: 'no recipient' };
	if (!subject || !html) return { sent: false, reason: 'subject or html missing' };

	const config = useRuntimeConfig() as any;
	const apiKey = config.sendgridApiKey || config.SENDGRID_API_KEY;
	const fromEmail = config.sendgridFromEmail || config.FROM_EMAIL || 'hello@earnest.guru';
	const globalFromName = config.sendgridFromName || 'Earnest';
	const globalReplyTo = config.sendgridReplyToEmail || config.SENDGRID_REPLY_TO_EMAIL;
	const bcc = config.sendgridBccEmail || config.SENDGRID_BCC_EMAIL;

	if (!apiKey) return { sent: false, reason: 'SendGrid API key not configured' };

	const fromName = (org?.name && String(org.name).trim()) || globalFromName;
	const resolvedReplyTo =
		(org as any)?.email_reply_to && String((org as any).email_reply_to).trim()
			|| (replyTo && String(replyTo).trim())
			|| globalReplyTo
			|| null;

	// Always tag Earnest sends with the `earnest` category and an `app: 'earnest'`
	// custom arg. The SendGrid account is shared with other systems; the webhook
	// uses these markers to filter foreign events. `email_name` falls back to the
	// most-specific category so existing callsites (which already use
	// ['transactional', '<type>']) get a sensible label without a code change.
	const extraCategories = (categories || []).filter((c) => c && c !== 'earnest');
	const mergedCategories = ['earnest', ...extraCategories];
	const derivedEmailName = emailName || (extraCategories.length ? extraCategories[extraCategories.length - 1] : null);
	const autoArgs: Record<string, string> = { app: 'earnest' };
	if (org?.id) autoArgs.organization = String(org.id);
	if (derivedEmailName) autoArgs.email_name = derivedEmailName;
	if (sendCollection) autoArgs.send_collection = sendCollection;
	if (sendId != null && sendId !== '') autoArgs.send_id = String(sendId);
	const mergedArgs = { ...autoArgs, ...(customArgs || {}) };

	const message: any = {
		to,
		from: { email: fromEmail, name: fromName },
		subject,
		html,
	};
	if (text) message.text = text;
	if (resolvedReplyTo) message.replyTo = resolvedReplyTo;
	if (bcc && bcc !== to) message.bcc = bcc;
	message.categories = mergedCategories;
	message.customArgs = mergedArgs;

	try {
		const sgMail = await import('@sendgrid/mail');
		sgMail.default.setApiKey(apiKey);
		await sgMail.default.send(message);
		return { sent: true };
	} catch (err: any) {
		console.warn('[email-send] send failed (non-fatal):', err?.message || err, err?.response?.body || '');
		return { sent: false, reason: err?.message || 'unknown error' };
	}
}
