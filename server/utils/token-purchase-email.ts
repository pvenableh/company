// server/utils/token-purchase-email.ts
/**
 * Send a branded "tokens added" confirmation email after a successful AI-token
 * purchase. This is an Earnest platform receipt (Earnest → the buying org), so
 * it renders with Earnest chrome regardless of the org's brand.
 *
 * Called from the fresh-credit branch of fulfillTokenPurchase ONLY (never the
 * alreadyFulfilled no-op), so the ledger's exactly-once gate guarantees it
 * fires at most once per purchase. Best-effort: a send failure must never break
 * fulfillment, so the caller invokes this fire-and-forget.
 *
 * GOTCHA: the MJML compiler runs with noEscape:true, so `{{var}}` values are
 * NOT HTML-escaped. Any value that could carry user-controlled markup (org name,
 * buyer first name) is escaped here before it reaches the template. Numbers are
 * pre-formatted to locale strings, which are safe.
 */

import { escapeHtml } from './email-shell';
import { renderBrandedTemplate } from './email-templates';
import { sendBrandedEmail } from './email-send';

interface TokenPurchaseEmailParams {
	/** Buyer email — the Stripe customer / purchasing user. */
	to: string;
	/** Buyer display name (first name is derived for the greeting). */
	buyerName?: string | null;
	organizationId: string;
	orgName?: string | null;
	/** Human package label, e.g. "500K Tokens" (from TOKEN_PACKAGES). */
	packageName: string;
	/** Tokens credited by this purchase. */
	tokensAdded: number;
	/** Org's new ai_token_balance after crediting. */
	newBalance: number;
	/** Stripe checkout session id, for the send audit trail. */
	sessionId?: string | null;
}

export async function sendTokenPurchaseEmail(
	params: TokenPurchaseEmailParams,
): Promise<{ sent: boolean; reason?: string }> {
	if (!params.to) return { sent: false, reason: 'no recipient' };

	const config = useRuntimeConfig() as any;
	const appUrl = config.public?.appUrl || config.public?.siteUrl || 'https://app.earnest.guru';
	const ctaUrl = `${appUrl}/organization?tab=ai-usage`;

	const orgName = (params.orgName && String(params.orgName).trim()) || 'your organization';
	const firstName = (params.buyerName && String(params.buyerName).trim().split(/\s+/)[0]) || '';

	const tokensAddedFormatted = `${Number(params.tokensAdded).toLocaleString('en-US')} tokens`;
	const newBalanceFormatted = `${Number(params.newBalance).toLocaleString('en-US')} tokens`;

	const subject = 'Your Earnest token top-up is confirmed';
	const heading = 'Your tokens are ready';

	// `firstName`, `orgName`, `packageName` are injected via {{ }} but noEscape is
	// on — escape the two that can carry user-controlled text. packageName comes
	// from our own catalog (safe); numbers are locale strings (safe).
	const { html, text } = await renderBrandedTemplate(
		'token-purchase',
		{
			subject,
			preheader: `${tokensAddedFormatted} added to ${orgName}.`,
			heading,
			firstName: firstName ? escapeHtml(firstName) : '',
			orgName: escapeHtml(orgName),
			packageName: params.packageName,
			tokensAddedFormatted,
			newBalanceFormatted,
			ctaUrl,
			text: `${firstName ? `Hi ${firstName},\n\n` : ''}Your ${params.packageName} purchase is complete — ${tokensAddedFormatted} have been added to ${orgName}.\n\nNew balance: ${newBalanceFormatted}\n\nView AI usage: ${ctaUrl}`,
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
		categories: ['transactional', 'token-purchase'],
		emailName: 'token-purchase',
		sendCollection: 'token_purchases',
		sendId: params.sessionId ?? null,
	});
	if (!res.sent) {
		console.warn('[token-purchase-email] send failed:', res.reason);
	} else {
		console.log('[token-purchase-email] sent receipt to', params.to, 'org=', params.organizationId);
	}
	return res;
}
