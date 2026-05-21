// server/utils/invite-email.ts
/**
 * Send a branded "you've been invited" email.
 *
 * This is the path Earnest controls — Directus's `inviteUser` also emails the
 * user, but only if Directus's own SMTP/Resend env is configured. Many of our
 * environments don't have that wired, so the Directus path silently no-ops
 * and the invite never reaches the recipient. Sending here through SendGrid
 * (same transport as welcome / notification emails) makes the invite reliable
 * regardless of Directus's mail config.
 *
 * Link shape: `{appUrl}/auth/accept-org-invite?membership=<id>`. For new users
 * the accept-invite server route uses the admin token to set their chosen
 * password directly, so we don't need to thread a Directus token through.
 */

import { renderEarnestEmail, renderOrgEmail, escapeHtml, type OrgBrandRef } from './email-shell';
import { sendBrandedEmail, fetchOrgBrand } from './email-send';

interface InviteEmailParams {
	to: string;
	/** Inviter's display name + email for the body copy + reply-to hint. */
	inviterName?: string | null;
	inviterEmail?: string | null;
	orgId: string;
	orgName: string;
	/** Pre-resolved org brand row. Optional — we'll fetch when missing. */
	orgBrand?: (OrgBrandRef & { email_reply_to?: string | null }) | null;
	/** Either an org_memberships row id or a client_portal_users row id. */
	membershipId: string;
	/** "Member of <Org>" vs "Client portal access for <Client>". */
	roleLabel: string;
	clientName?: string | null;
	isNewUser: boolean;
}

export async function sendOrgInviteEmail(params: InviteEmailParams): Promise<{ sent: boolean; reason?: string }> {
	const config = useRuntimeConfig() as any;
	const appUrl = config.public?.appUrl || config.public?.siteUrl || 'https://app.earnest.guru';
	const acceptUrl = `${appUrl}/auth/accept-org-invite?membership=${encodeURIComponent(params.membershipId)}`;

	const brand = params.orgBrand ?? (await fetchOrgBrand(params.orgId));
	const inviterLine = params.inviterName
		? `<strong>${escapeHtml(params.inviterName)}</strong>${params.inviterEmail ? ` (${escapeHtml(params.inviterEmail)})` : ''}`
		: 'Someone';

	const subject = params.clientName
		? `${params.orgName} invited you to the ${params.clientName} client portal`
		: `${params.orgName} invited you to join their team on Earnest`;

	const heading = params.clientName
		? `You're invited to ${params.clientName}'s portal`
		: `You're invited to ${params.orgName}`;

	const intro = params.isNewUser
		? `${inviterLine} invited you to ${params.clientName ? `the <strong>${escapeHtml(params.clientName)}</strong> client portal on ` : ''}<strong>${escapeHtml(params.orgName)}</strong>. Click below to set your password and finish creating your account.`
		: `${inviterLine} invited you to ${params.clientName ? `the <strong>${escapeHtml(params.clientName)}</strong> client portal on ` : ''}<strong>${escapeHtml(params.orgName)}</strong>. You already have an Earnest account — click below to accept and get access.`;

	const bodyHtml = `
		<p style="margin:0 0 12px;">${intro}</p>
		<p style="margin:0 0 12px;color:#666;font-size:13px;">Role: <strong>${escapeHtml(params.roleLabel)}</strong></p>
		<p style="margin:16px 0 0;font-size:13px;color:#888;">Didn't expect this invitation? You can ignore the email — nothing happens until you click the button.</p>
	`;

	// Use the org-branded shell when we have a brand row (logo + brand_color
	// land in the header). Falls back to the Earnest shell otherwise.
	const rendered = brand
		? renderOrgEmail({
			org: brand,
			subject,
			preheader: `${params.orgName} invited you to Earnest.`,
			heading,
			bodyHtml,
			cta: { label: 'Accept invitation', url: acceptUrl },
		})
		: renderEarnestEmail({
			subject,
			preheader: `${params.orgName} invited you to Earnest.`,
			heading,
			bodyHtml,
			cta: { label: 'Accept invitation', url: acceptUrl },
		});

	const res = await sendBrandedEmail({
		to: params.to,
		subject,
		html: rendered.html,
		text: rendered.text,
		org: brand,
		replyTo: params.inviterEmail || null,
		categories: ['transactional', 'invite'],
		emailName: params.clientName ? 'portal-invite' : 'team-invite',
		sendCollection: params.clientName ? 'client_portal_users' : 'org_memberships',
		sendId: params.membershipId,
	});
	if (!res.sent) {
		console.warn('[invite-email] send failed:', res.reason);
	} else {
		console.log('[invite-email] sent invite to', params.to, 'membership=', params.membershipId);
	}
	return res;
}
