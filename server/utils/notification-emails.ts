// server/utils/notification-emails.ts
// Generic SendGrid template + sender for non-meeting notifications
// (comments, ticket/project/invoice/contract/proposal status changes).
//
// Meeting emails keep their bespoke templates (meeting-emails.ts) because
// they carry meeting-specific details (date/time/duration/join URL). This
// file is for everything else: a branded shell, a heading, a body line,
// and a "View in Earnest" CTA pointing at the item's app/portal page.

import type { NotificationCategory } from './notification-categories';

interface SendArgs {
	to: string;
	recipientName: string;
	subject: string;
	heading: string;
	body: string;
	link: string | null;
	ctaLabel?: string;
	config: any;
}

function shell(inner: string) {
	return `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">${inner}<hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;"><p style="color: #999; font-size: 12px;">This is an automated message from Earnest.</p></div>`;
}

function cta(link: string | null, label: string) {
	if (!link) return '';
	return `<p style="margin-top: 24px;"><a href="${link}" style="display: inline-block; background: #10B981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">${label}</a></p><p style="margin-top: 16px; color: #666; font-size: 13px;">Or open this link: <a href="${link}">${link}</a></p>`;
}

async function sendViaSendGrid(config: any, message: { to: string; subject: string; html: string }) {
	const sgMail = await import('@sendgrid/mail');
	sgMail.default.setApiKey(config.sendgridApiKey);
	await sgMail.default.send({
		to: message.to,
		from: {
			email: config.sendgridFromEmail,
			name: config.sendgridFromName || 'Earnest',
		},
		subject: message.subject,
		html: message.html,
	});
}

export async function sendNotificationEmail(args: SendArgs): Promise<void> {
	const { to, recipientName, subject, heading, body, link, ctaLabel, config } = args;
	if (!config.sendgridApiKey || !config.sendgridFromEmail) return;
	const html = shell(`
		<h2 style="color: #333;">${heading}</h2>
		<p>Hi ${recipientName || 'there'},</p>
		<p>${body}</p>
		${cta(link, ctaLabel || 'View in Earnest')}
	`);
	await sendViaSendGrid(config, { to, subject, html });
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
