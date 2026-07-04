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

import { escapeHtml, type OrgBrandRef } from './email-shell';
import { renderBrandedTemplate } from './email-templates';
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

	// Plain-text intro mirrors `intro` without the HTML emphasis.
	const who = params.inviterName
		? `${params.inviterName}${params.inviterEmail ? ` (${params.inviterEmail})` : ''}`
		: 'Someone';
	const target = params.clientName
		? `the ${params.clientName} client portal on ${params.orgName}`
		: params.orgName;
	const plainIntro = params.isNewUser
		? `${who} invited you to ${target}. Set your password and finish creating your account:`
		: `${who} invited you to ${target}. You already have an Earnest account — accept to get access:`;

	// `heading` / `roleLabel` are escaped by the template's {{ }}; `introHtml`
	// is server-built escaped HTML injected via {{{ }}}. Passing brand.org
	// picks the org-branded chrome (logo + brand_color); null → Earnest.
	const { html, text } = await renderBrandedTemplate('invite', {
		subject,
		preheader: `${params.orgName} invited you to Earnest.`,
		heading,
		introHtml: intro,
		roleLabel: params.roleLabel,
		ctaUrl: acceptUrl,
		text: `${plainIntro}\n${acceptUrl}\n\nRole: ${params.roleLabel}`,
	}, { org: brand });

	const res = await sendBrandedEmail({
		to: params.to,
		subject,
		html,
		text,
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
