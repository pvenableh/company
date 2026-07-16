// server/utils/fulfill-token-purchase.ts
//
// Single source of truth for crediting an AI-token purchase to an org after a
// successful one-time Stripe Checkout (mode:'payment', metadata.type:
// 'token_purchase'). Idempotent via the `token_purchases` ledger: the UNIQUE
// stripe_session_id is the exactly-once gate, so it's safe to call from BOTH:
//   - the platform webhook (checkout.session.completed) — the reliable path,
//     fires even if the buyer closes the success tab, and
//   - the client success page hitting /api/stripe/tokens/fulfill (fast path).
//
// Exactly-once crediting: insert the ledger row first (only one insert wins the
// unique constraint). If crediting then fails, delete the gate row and rethrow
// so the caller returns non-2xx, Stripe retries, and crediting is reattempted.
// The row exists only once the credit has succeeded. This mirrors CardDesk's
// cd_credit_purchases pattern (server/utils/credit-fulfillment.ts).
import type Stripe from 'stripe';
import { createItem, deleteItem, readItem, updateItem } from '@directus/sdk';

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
 * session object (the webhook already has it) to avoid a redundant retrieve.
 */
export async function fulfillTokenPurchase(session: Stripe.Checkout.Session): Promise<TokenFulfillmentResult> {
	const metadata = session.metadata || {};

	if (metadata.type !== 'token_purchase') {
		return { success: false, skipped: true, reason: 'not_token_purchase' };
	}
	if (session.payment_status !== 'paid') {
		return { success: false, skipped: true, reason: 'not_paid' };
	}

	const tokensToAdd = Number(metadata.tokens);
	const organizationId = metadata.organization_id;
	if (!tokensToAdd || !organizationId) {
		return { success: false, skipped: true, reason: 'invalid_metadata' };
	}

	const directus = getTypedDirectus();
	const paymentIntent =
		typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null;

	// Idempotency gate: insert the ledger row keyed by the unique stripe_session_id.
	// A duplicate means another caller (webhook vs success-page fast-path, or a
	// webhook retry) already fulfilled this session — no-op.
	let purchaseId: string;
	try {
		const created = (await directus.request(
			createItem('token_purchases', {
				organization: organizationId,
				user_id: metadata.user_id ?? null,
				stripe_session_id: session.id,
				stripe_payment_intent: paymentIntent,
				package_id: metadata.package_id ?? null,
				tokens: tokensToAdd,
				amount_cents: session.amount_total ?? 0,
				currency: session.currency ?? 'usd',
				status: 'paid',
			} as any),
		)) as { id: string };
		purchaseId = created.id;
	} catch (err: any) {
		const msg = JSON.stringify(err?.errors ?? err?.message ?? err);
		if (/unique|duplicate|RECORD_NOT_UNIQUE/i.test(msg)) {
			return { success: true, alreadyFulfilled: true, tokensAdded: tokensToAdd, organizationId };
		}
		throw err;
	}

	// Credit the balance. If it fails, remove the gate row so a retry re-credits
	// (otherwise the duplicate-insert short-circuit would strand the payment).
	try {
		const org = (await directus.request(
			readItem('organizations', organizationId, { fields: ['ai_token_balance'] }),
		)) as { ai_token_balance?: number | string } | null;

		const currentBalance = Number(org?.ai_token_balance) || 0;
		const newBalance = currentBalance + tokensToAdd;

		await directus.request(updateItem('organizations', organizationId, { ai_token_balance: newBalance }));

		return { success: true, tokensAdded: tokensToAdd, newBalance, organizationId };
	} catch (err: any) {
		try {
			await directus.request(deleteItem('token_purchases', purchaseId));
		} catch (delErr: any) {
			console.error('[fulfillTokenPurchase] failed to roll back gate row', purchaseId, delErr?.message ?? delErr);
		}
		throw err;
	}
}
