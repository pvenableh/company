// server/utils/notification-emails.ts
// Generic notification mailer for non-meeting events (comments, ticket/
// project/invoice/contract/proposal status changes, reactions).
//
// Wraps the org-branded shell when an org is supplied — falls back to
// Earnest chrome when one isn't (e.g. a target with no org scope yet).
// Meeting emails keep their bespoke templates in meeting-emails.ts.

import { escapeHtml, type OrgBrandRef } from './email-shell';
import { renderBrandedTemplate } from './email-templates';
import { sendBrandedEmail, fetchOrgBrand } from './email-send';
import type { NotificationCategory } from './notification-categories';

interface SendArgs {
	to: string;
	recipientName: string;
	subject: string;
	heading: string;
	/** Plain-text body; safely HTML-escaped before rendering. */
	body: string;
	link: string | null;
	ctaLabel?: string;
	/** Org context — drives logo/brand color/reply-to. Null → Earnest shell. */
	org?: OrgBrandRef | null;
	/** Convenience: resolve org from id if `org` isn't pre-loaded. */
	orgId?: string | null;
	/** Notification category — refines `email_name` for webhook filtering. */
	category?: NotificationCategory | null;
	/** Source Directus collection (e.g. 'tickets', 'projects', 'invoices'). */
	sourceCollection?: string | null;
	/** Source row id within `sourceCollection`. */
	sourceId?: string | number | null;
	/** Retained for any caller that still passes runtimeConfig; ignored. */
	config?: any;
}

export async function sendNotificationEmail(args: SendArgs): Promise<void> {
	const { to, recipientName, subject, heading, body, link, ctaLabel, category, sourceCollection, sourceId } = args;

	let org: OrgBrandRef | null | undefined = args.org;
	if (!org && args.orgId) {
		org = await fetchOrgBrand(args.orgId);
	}

	const label = ctaLabel || 'View in Earnest';
	// `recipientName` is escaped by the template's {{ }}; the message body is
	// server-built escaped HTML (preserving newlines) injected via {{{ }}}.
	const bodyHtml = escapeHtml(body || '').replace(/\n/g, '<br />');

	const { html, text } = await renderBrandedTemplate('notification', {
		subject,
		preheader: (body || heading || '').slice(0, 140),
		heading,
		recipientName: recipientName || 'there',
		bodyHtml,
		ctaUrl: link || '',
		ctaLabel: label,
		text: `Hi ${recipientName || 'there'},\n\n${body || ''}${link ? `\n\n${label}: ${link}` : ''}`,
	}, { org });

	await sendBrandedEmail({
		to,
		subject,
		html,
		text,
		org,
		categories: ['transactional', 'notification', ...(category ? [category] : [])],
		emailName: category ? `notification-${category}` : 'notification',
		sendCollection: sourceCollection ?? undefined,
		sendId: sourceId ?? null,
	});
}

const CATEGORY_CTA: Record<NotificationCategory, string> = {
	conversations: 'View conversation',
	reactions: 'View item',
	tickets: 'View ticket',
	projects: 'View project',
	invoices: 'View invoice',
	contracts: 'View contract',
	proposals: 'View proposal',
	meetings: 'View meeting',
};

export function ctaLabelFor(category: NotificationCategory): string {
	return CATEGORY_CTA[category] || 'View in Earnest';
}
