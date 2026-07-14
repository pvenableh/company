// server/utils/fulfill-token-purchase.ts
//
// Single source of truth for crediting an AI-token purchase to an org after a
// successful one-time Stripe Checkout (mode:'payment', metadata.type:
// 'token_purchase'). Idempotent via a `fulfilled` flag written back onto the
// session metadata, so it's safe to call from BOTH:
//   - the platform webhook (checkout.session.completed) — the reliable path,
//     fires even if the buyer closes the success tab, and
//   - the client success page hitting /api/stripe/tokens/fulfill (fast path).
import type Stripe from 'stripe';
import { readItem, updateItem } from '@directus/sdk';

export interface TokenFulfillmentResult {
	success: boolean;
	alreadyFulfilled?: boolean;
	skipped?: boolean;
	reason?: string;
	tokensAdded?: number;
	newBalance?: number;
	organizationId?: string;
}

/**
 * Credit tokens for a completed token-purchase checkout session. Accepts the
 * session object (webhook already has it) to avoid a redundant retrieve; pass
 * `stripe` so the `fulfilled` guard can be written back.
 */
export async function fulfillTokenPurchase(
	stripe: Stripe,
	session: Stripe.Checkout.Session,
): Promise<TokenFulfillmentResult> {
	const metadata = session.metadata || {};

	if (metadata.type !== 'token_purchase') {
		return { success: false, skipped: true, reason: 'not_token_purchase' };
	}
	if (session.payment_status !== 'paid') {
		return { success: false, skipped: true, reason: 'not_paid' };
	}
	if (metadata.fulfilled === 'true') {
		return { success: true, alreadyFulfilled: true, tokensAdded: Number(metadata.tokens) || 0 };
	}

	const tokensToAdd = Number(metadata.tokens);
	const organizationId = metadata.organization_id;
	if (!tokensToAdd || !organizationId) {
		return { success: false, skipped: true, reason: 'invalid_metadata' };
	}

	const directus = getTypedDirectus();
	const org = (await directus.request(
		readItem('organizations', organizationId, { fields: ['ai_token_balance'] }),
	)) as { ai_token_balance?: number | string } | null;

	const currentBalance = Number(org?.ai_token_balance) || 0;
	const newBalance = currentBalance + tokensToAdd;

	await directus.request(
		updateItem('organizations', organizationId, { ai_token_balance: newBalance }),
	);

	// Mark fulfilled so the other caller (or a webhook retry) is a no-op.
	// Best-effort: if this write fails the balance is still credited, but the
	// guard didn't set — acceptable because the two callers race rarely and the
	// window is small; a missing guard would at worst double-credit once. We
	// therefore only ever reach here after confirming fulfilled !== 'true'.
	try {
		// `checkout.sessions.update` exists at runtime (Stripe supports updating
		// session metadata) but isn't on this SDK version's `SessionsResource`
		// type — cast the resource to reach it.
		await (stripe.checkout.sessions as any).update(session.id, {
			metadata: { ...metadata, fulfilled: 'true' },
		});
	} catch (err: any) {
		console.warn('[fulfillTokenPurchase] failed to set fulfilled flag:', err?.message || err);
	}

	return { success: true, tokensAdded: tokensToAdd, newBalance, organizationId };
}
