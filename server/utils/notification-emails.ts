// server/utils/notification-emails.ts
// Generic notification mailer for non-meeting events (comments, ticket/
// project/invoice/contract/proposal status changes, reactions).
//
// Wraps the org-branded shell when an org is supplied — falls back to
// Earnest chrome when one isn't (e.g. a target with no org scope yet).
// Meeting emails keep their bespoke templates in meeting-emails.ts.

import { renderEarnestEmail, renderOrgEmail, escapeHtml, type OrgBrandRef } from './email-shell';
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
	/** Retained for any caller that still passes runtimeConfig; ignored. */
	config?: any;
}

export async function sendNotificationEmail(args: SendArgs): Promise<void> {
	const { to, recipientName, subject, heading, body, link, ctaLabel } = args;

	let org: OrgBrandRef | null | undefined = args.org;
	if (!org && args.orgId) {
		org = await fetchOrgBrand(args.orgId);
	}

	const safeName = recipientName ? escapeHtml(recipientName) : 'there';
	const safeBody = escapeHtml(body || '').replace(/\n/g, '<br />');
	const bodyHtml = `
		<p style="margin:0 0 12px;">Hi ${safeName},</p>
		<p style="margin:0 0 12px;">${safeBody}</p>
	`;
	const cta = link ? { label: ctaLabel || 'View in Earnest', url: link } : null;

	const rendered = org
		? renderOrgEmail({ org, subject, heading, bodyHtml, cta })
		: renderEarnestEmail({ subject, heading, bodyHtml, cta });

	await sendBrandedEmail({
		to,
		subject,
		html: rendered.html,
		text: rendered.text,
		org,
		categories: ['transactional', 'notification'],
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
