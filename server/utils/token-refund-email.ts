// server/utils/token-refund-email.ts
/**
 * Send a branded "refund issued" receipt after an AI-token purchase is refunded.
 * Mirrors sendTokenPurchaseEmail — an Earnest platform receipt (Earnest → the
 * buying org), so it renders with Earnest chrome regardless of the org's brand.
 *
 * Called from the refund endpoint AFTER the Stripe refund + ledger flip succeed,
 * so the `status='refunded'` guard means it fires at most once per purchase.
 * Best-effort: a send failure must never fail the refund (the money has already
 * moved), so the caller invokes this fire-and-forget.
 *
 * GOTCHA: the MJML compiler runs with noEscape:true, so `{{var}}` values are NOT
 * HTML-escaped. Any value that could carry user-controlled markup (org name,
 * buyer first name) is escaped here. Numbers/currency are pre-formatted locale
 * strings, which are safe.
 */

import { escapeHtml } from './email-shell';
import { renderBrandedTemplate } from './email-templates';
import { sendBrandedEmail } from './email-send';

interface TokenRefundEmailParams {
	/** Buyer email — the purchasing user on the original token purchase. */
	to: string;
	/** Buyer display name (first name is derived for the greeting). */
	buyerName?: string | null;
	organizationId: string;
	orgName?: string | null;
	/** Human package label, e.g. "500K Tokens" (from TOKEN_PACKAGES). */
	packageName: string;
	/** Amount refunded, in cents. */
	amountRefundedCents: number;
	/** Tokens removed from the org balance by this refund. */
	tokensReversed: number;
	/** Org's ai_token_balance after the reversal. */
	newBalance: number;
	/** token_purchases row id, for the send audit trail. */
	purchaseId?: string | null;
}

export async function sendTokenRefundEmail(
	params: TokenRefundEmailParams,
): Promise<{ sent: boolean; reason?: string }> {
	if (!params.to) return { sent: false, reason: 'no recipient' };

	const config = useRuntimeConfig() as any;
	const appUrl = config.public?.appUrl || config.public?.siteUrl || 'https://app.earnest.guru';
	const ctaUrl = `${appUrl}/apps/organization?floor=ai`;

	const orgName = (params.orgName && String(params.orgName).trim()) || 'your organization';
	const firstName = (params.buyerName && String(params.buyerName).trim().split(/\s+/)[0]) || '';

	const amountFormatted = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
	}).format((Number(params.amountRefundedCents) || 0) / 100);
	const tokensReversedFormatted = `${Number(params.tokensReversed).toLocaleString('en-US')} tokens`;
	const newBalanceFormatted = `${Number(params.newBalance).toLocaleString('en-US')} tokens`;

	const subject = 'Your Earnest token refund is confirmed';
	const heading = 'Your refund is on its way';

	const { html, text } = await renderBrandedTemplate(
		'token-refund',
		{
			subject,
			preheader: `${amountFormatted} refunded to ${orgName}.`,
			heading,
			firstName: firstName ? escapeHtml(firstName) : '',
			orgName: escapeHtml(orgName),
			packageName: params.packageName,
			amountFormatted,
			tokensReversedFormatted,
			newBalanceFormatted,
			ctaUrl,
			text: `${firstName ? `Hi ${firstName},\n\n` : ''}We've refunded ${amountFormatted} for the ${params.packageName} purchase on ${orgName}. Most banks post it within 5-10 business days.\n\n${tokensReversedFormatted} have been removed from your organization's balance.\nNew balance: ${newBalanceFormatted}\n\nView AI usage: ${ctaUrl}`,
		},
		// Earnest chrome (platform receipt), and Earnest from-name / reply-to.
		{ org: null },
	);

	const res = await sendBrandedEmail({
		to: params.to,
		subject,
		html,
		text,
		org: null,
		categories: ['transactional', 'token-refund'],
		emailName: 'token-refund',
		sendCollection: 'token_purchases',
		sendId: params.purchaseId ?? null,
	});
	if (!res.sent) {
		console.warn('[token-refund-email] send failed:', res.reason);
	} else {
		console.log('[token-refund-email] sent receipt to', params.to, 'org=', params.organizationId);
	}
	return res;
}
