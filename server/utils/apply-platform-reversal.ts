/**
 * Platform-account refund & dispute reconciliation.
 *
 * The org-side counterpart lives in apply-refund-adjustment.ts /
 * apply-dispute-adjustment.ts (client INVOICE payments on connected accounts).
 * THIS module handles Earnest's OWN platform charges — AI token purchases and
 * subscription charges — refunded or lost to a chargeback on the platform
 * Stripe account. Called from server/api/stripe/paymentchange.ts.
 *
 * Two economic effects:
 *   - Token purchase reversed  → claw back the credited tokens (inverse of
 *     fulfill-token-purchase.ts): reduce organizations.ai_token_balance by the
 *     refunded PROPORTION of the purchase, clamped so cumulative clawback never
 *     exceeds the tokens granted and the balance never goes below zero.
 *   - Subscription charge reversed → flag + notify the platform admin. We do NOT
 *     auto-downgrade: a refunded month doesn't cancel a subscription, and actual
 *     plan changes already flow through customer.subscription.updated/deleted.
 *     Notifying lets a human decide.
 *
 * Idempotency (Stripe retries + sends cumulative totals):
 *   - Refunds: `charge.amount_refunded` is CUMULATIVE. We sum the `amount_cents`
 *     of prior `token_refund` rows for the payment_intent and only book the
 *     delta. A retry/dupe yields a <= 0 delta and is a no-op.
 *   - Disputes: a chargeback closes once. We guard on `stripe_dispute_id` — if a
 *     reversal row already exists for this dispute, the retry is a no-op.
 *
 * Every reversal writes one `platform_reversals` audit row, which also feeds the
 * /platform refunds/disputes view. Best-effort throughout — never 500 the
 * webhook (the caller wraps in try/catch); a half-applied write must not double
 * on the inevitable Stripe retry, which the idempotency ledger prevents.
 */
import Stripe from 'stripe';
import { createItem, readItems, readUsers, updateItem, createNotification } from '@directus/sdk';

const ADMIN_ROLE_ID = '3a63a4e1-c82e-46f8-9993-7f11ac6a4b01';

const idOf = (ref: any): string | null =>
	ref == null ? null : typeof ref === 'object' ? ref.id ?? null : String(ref);

const sumCents = (rows: Array<{ amount_cents?: number | null }>): number =>
	rows.reduce((s, r) => s + (Number(r.amount_cents) || 0), 0);
const sumTokens = (rows: Array<{ tokens_clawed_back?: number | null }>): number =>
	rows.reduce((s, r) => s + (Number(r.tokens_clawed_back) || 0), 0);

export interface PlatformReversalResult {
	applied: boolean;
	reason?: string;
	kind?: 'token' | 'subscription';
	tokensClawedBack?: number;
	amountCents?: number;
	organizationId?: string | null;
}

type TokenPurchaseRow = {
	id: string;
	organization?: string | null;
	tokens?: number | null;
	amount_cents?: number | null;
	stripe_payment_intent?: string | null;
	status?: string | null;
};

// ── shared helpers ───────────────────────────────────────────────────────────

async function notifyPlatformAdmins(subject: string, message: string) {
	const directus = getTypedDirectus();
	try {
		const admins = (await directus.request(
			readUsers({
				filter: { role: { _eq: ADMIN_ROLE_ID }, status: { _eq: 'active' } } as any,
				fields: ['id'],
				limit: 25,
			}),
		)) as Array<{ id: string }>;
		const recipients = [...new Set(admins.map((a) => a.id).filter(Boolean))];
		await Promise.all(
			recipients.map((recipient) =>
				directus.request(
					createNotification({ recipient, subject, message, collection: 'platform_reversals', status: 'inbox' } as any),
				),
			),
		);
	} catch (e) {
		console.warn('[PlatformReversal] admin notify failed:', e);
	}
}

async function resolveOrgByStripeCustomer(customerId: string | null): Promise<string | null> {
	if (!customerId) return null;
	const directus = getTypedDirectus();
	try {
		// Billing is org-owned post-split: organizations.stripe_customer_id.
		const orgs = (await directus.request(
			readItems('organizations', {
				filter: { stripe_customer_id: { _eq: customerId } },
				fields: ['id'],
				limit: 1,
			}),
		)) as Array<{ id: string }>;
		return orgs?.[0]?.id ?? null;
	} catch {
		return null;
	}
}

/** Reduce an org's AI token balance, clamped at zero. Read-modify-write. */
async function reduceOrgTokenBalance(orgId: string | null, tokens: number): Promise<number | null> {
	if (!orgId || tokens <= 0) return null;
	const directus = getTypedDirectus();
	try {
		const org = (await directus.request(
			readItems('organizations', { filter: { id: { _eq: orgId } }, fields: ['id', 'ai_token_balance'], limit: 1 }),
		)) as Array<{ id: string; ai_token_balance?: number | string | null }>;
		const current = Number(org?.[0]?.ai_token_balance) || 0;
		const next = Math.max(0, current - tokens);
		await directus.request(updateItem('organizations', orgId, { ai_token_balance: next }));
		return next;
	} catch (e) {
		console.warn('[PlatformReversal] could not reduce token balance:', e);
		return null;
	}
}

async function findTokenPurchaseByPi(pi: string | null): Promise<TokenPurchaseRow | null> {
	if (!pi) return null;
	const directus = getTypedDirectus();
	const rows = (await directus.request(
		readItems('token_purchases', {
			filter: { stripe_payment_intent: { _eq: pi } },
			fields: ['id', 'organization', 'tokens', 'amount_cents', 'stripe_payment_intent', 'status'],
			limit: 1,
		}),
	)) as TokenPurchaseRow[];
	return rows?.[0] ?? null;
}

/**
 * Tokens to claw back for `reversedCents` of a purchase, clamped so cumulative
 * clawback across all reversal rows for this PI never exceeds tokens granted.
 */
function clampedTokenClawback(tp: TokenPurchaseRow, reversedCents: number, priorTokensClawed: number): number {
	const amountPaidCents = Number(tp.amount_cents) || 0;
	const tokensGranted = Number(tp.tokens) || 0;
	if (!tokensGranted) return 0;
	const proportional = amountPaidCents > 0 ? Math.round((tokensGranted * reversedCents) / amountPaidCents) : tokensGranted;
	const remaining = Math.max(0, tokensGranted - priorTokensClawed);
	return Math.min(Math.max(0, proportional), remaining);
}

// ── refunds ──────────────────────────────────────────────────────────────────

export async function handlePlatformChargeRefund(charge: Stripe.Charge): Promise<PlatformReversalResult> {
	const directus = getTypedDirectus();
	const pi = idOf(charge.payment_intent);
	const chargeId = charge.id || null;
	if (!pi && !chargeId) return { applied: false, reason: 'no-charge-ref' };

	const tp = await findTokenPurchaseByPi(pi);

	if (tp) {
		// ── token purchase refund → claw back proportional tokens ──
		const targetRefundedCents = charge.amount_refunded || 0;
		const prior = (await directus.request(
			readItems('platform_reversals', {
				filter: { _and: [{ stripe_payment_intent: { _eq: pi } }, { type: { _eq: 'token_refund' } }] },
				fields: ['amount_cents', 'tokens_clawed_back'],
				limit: -1,
			}),
		)) as Array<{ amount_cents?: number | null; tokens_clawed_back?: number | null }>;
		const priorCents = sumCents(prior);
		const deltaCents = targetRefundedCents - priorCents;
		if (deltaCents <= 0) {
			console.log(`[PlatformReversal] token refund no-op for ${pi} (cumulative ${targetRefundedCents}¢, booked ${priorCents}¢)`);
			return { applied: false, reason: 'already-applied', kind: 'token' };
		}

		const priorTokens = sumTokens(prior);
		const tokensDelta = clampedTokenClawback(tp, deltaCents, priorTokens);
		await reduceOrgTokenBalance(tp.organization ?? null, tokensDelta);

		const amountPaidCents = Number(tp.amount_cents) || 0;
		const fully = amountPaidCents > 0 && targetRefundedCents >= amountPaidCents;
		await directus
			.request(updateItem('token_purchases', tp.id, { status: fully ? 'refunded' : 'partially_refunded' }))
			.catch(() => {});

		await directus.request(
			createItem('platform_reversals', {
				type: 'token_refund',
				organization: tp.organization ?? null,
				stripe_charge_id: chargeId,
				stripe_payment_intent: pi,
				amount_cents: deltaCents,
				tokens_clawed_back: tokensDelta,
				reason: 'charge.refunded',
				livemode: charge.livemode ?? null,
				note: `Token purchase refund: −${tokensDelta} tokens ($${(deltaCents / 100).toFixed(2)})`,
			} as any),
		);

		await notifyPlatformAdmins(
			'Token purchase refunded',
			`A token purchase was refunded ($${(deltaCents / 100).toFixed(2)}). Clawed back ${tokensDelta} tokens from the org's balance.`,
		);
		console.log(`[PlatformReversal] token refund booked ${pi}: −${tokensDelta} tokens (${deltaCents}¢)`);
		return { applied: true, kind: 'token', tokensClawedBack: tokensDelta, amountCents: deltaCents, organizationId: tp.organization ?? null };
	}

	// ── not a token purchase → subscription/other platform charge ──
	return flagSubscriptionReversal({
		type: 'subscription_refund',
		chargeId,
		pi,
		customerId: idOf((charge as any).customer),
		amountCents: (charge.amount_refunded || charge.amount || 0) - 0,
		disputeId: null,
		livemode: charge.livemode ?? null,
		reason: 'charge.refunded',
	});
}

// ── disputes ─────────────────────────────────────────────────────────────────

export async function handlePlatformDispute(
	dispute: Stripe.Dispute,
	phase: 'created' | 'closed',
): Promise<PlatformReversalResult> {
	const directus = getTypedDirectus();
	const pi = idOf(dispute.payment_intent);
	const chargeId = idOf(dispute.charge);
	const amount = (dispute.amount / 100).toFixed(2);
	const tp = await findTokenPurchaseByPi(pi);
	const kind: 'token' | 'subscription' = tp ? 'token' : 'subscription';

	if (phase === 'created') {
		// Funds held, not yet lost — alert only, no clawback.
		await notifyPlatformAdmins(
			'Platform charge disputed',
			`A ${kind} charge was disputed ($${amount}, ${dispute.reason}). Funds are held pending resolution — submit evidence in Stripe if invalid.`,
		);
		return { applied: false, reason: 'held', kind };
	}

	// closed
	if (dispute.status === 'won' || dispute.status === 'warning_closed') {
		await notifyPlatformAdmins(
			'Platform dispute resolved in our favor',
			`The $${amount} ${kind} dispute closed as "${dispute.status}". The charge stands.`,
		);
		return { applied: false, reason: dispute.status, kind };
	}

	// lost → reverse. Guard on dispute id (a chargeback closes once).
	const existing = (await directus.request(
		readItems('platform_reversals', {
			filter: { stripe_dispute_id: { _eq: dispute.id } },
			fields: ['id'],
			limit: 1,
		}),
	)) as Array<{ id: string }>;
	if (existing.length) {
		console.log(`[PlatformReversal] dispute ${dispute.id} already reversed — idempotent no-op`);
		return { applied: false, reason: 'already-applied', kind };
	}

	if (tp) {
		// ── token purchase dispute lost → claw back proportional tokens ──
		const prior = (await directus.request(
			readItems('platform_reversals', {
				filter: { stripe_payment_intent: { _eq: pi } },
				fields: ['tokens_clawed_back'],
				limit: -1,
			}),
		)) as Array<{ tokens_clawed_back?: number | null }>;
		const priorTokens = sumTokens(prior);
		const tokensDelta = clampedTokenClawback(tp, dispute.amount, priorTokens);
		await reduceOrgTokenBalance(tp.organization ?? null, tokensDelta);
		await directus.request(updateItem('token_purchases', tp.id, { status: 'dispute_lost' })).catch(() => {});

		await directus.request(
			createItem('platform_reversals', {
				type: 'token_dispute',
				organization: tp.organization ?? null,
				stripe_charge_id: chargeId,
				stripe_payment_intent: pi,
				stripe_dispute_id: dispute.id,
				amount_cents: dispute.amount,
				tokens_clawed_back: tokensDelta,
				reason: dispute.reason,
				livemode: dispute.livemode ?? null,
				note: `Token purchase dispute lost: −${tokensDelta} tokens ($${amount})`,
			} as any),
		);
		await notifyPlatformAdmins(
			'Token purchase dispute lost',
			`A $${amount} token-purchase dispute was lost. Clawed back ${tokensDelta} tokens from the org's balance.`,
		);
		console.log(`[PlatformReversal] token dispute lost ${dispute.id}: −${tokensDelta} tokens`);
		return { applied: true, kind: 'token', tokensClawedBack: tokensDelta, amountCents: dispute.amount, organizationId: tp.organization ?? null };
	}

	// ── subscription dispute lost → flag + notify ──
	return flagSubscriptionReversal({
		type: 'subscription_dispute',
		chargeId,
		pi,
		customerId: null, // dispute has no customer; org resolved best-effort below is skipped
		amountCents: dispute.amount,
		disputeId: dispute.id,
		livemode: dispute.livemode ?? null,
		reason: dispute.reason,
	});
}

// ── subscription reversal (flag + notify, no auto-downgrade) ──────────────────

async function flagSubscriptionReversal(
	p: {
		type: 'subscription_refund' | 'subscription_dispute';
		chargeId: string | null;
		pi: string | null;
		customerId: string | null;
		amountCents: number;
		disputeId: string | null;
		livemode: boolean | null;
		reason: string | null;
	},
): Promise<PlatformReversalResult> {
	const directus = getTypedDirectus();
	// Refund idempotency for subscriptions mirrors tokens: only book the new
	// cumulative delta per PI. Dispute idempotency already guarded by dispute id
	// upstream, but re-check the ledger here for the refund path.
	if (p.type === 'subscription_refund' && p.pi) {
		const prior = (await directus.request(
			readItems('platform_reversals', {
				filter: { _and: [{ stripe_payment_intent: { _eq: p.pi } }, { type: { _eq: 'subscription_refund' } }] },
				fields: ['amount_cents'],
				limit: -1,
			}),
		)) as Array<{ amount_cents?: number | null }>;
		const priorCents = sumCents(prior);
		const deltaCents = p.amountCents - priorCents;
		if (deltaCents <= 0) return { applied: false, reason: 'already-applied', kind: 'subscription' };
		p.amountCents = deltaCents;
	}

	const orgId = await resolveOrgByStripeCustomer(p.customerId);
	const dollars = (p.amountCents / 100).toFixed(2);
	await directus.request(
		createItem('platform_reversals', {
			type: p.type,
			organization: orgId,
			stripe_charge_id: p.chargeId,
			stripe_payment_intent: p.pi,
			stripe_dispute_id: p.disputeId,
			amount_cents: p.amountCents,
			reason: p.reason,
			livemode: p.livemode,
			note: `Subscription ${p.type === 'subscription_dispute' ? 'dispute lost' : 'refund'} ($${dollars}) — review entitlement`,
		} as any),
	);
	await notifyPlatformAdmins(
		p.type === 'subscription_dispute' ? 'Subscription dispute lost' : 'Subscription charge refunded',
		`A subscription charge was ${p.type === 'subscription_dispute' ? 'lost to a chargeback' : 'refunded'} ($${dollars})${orgId ? ` for org ${orgId}` : ''}. Review the org's plan/entitlement in Stripe — no automatic downgrade was applied.`,
	);
	console.log(`[PlatformReversal] ${p.type} flagged ($${dollars}, org ${orgId || 'unknown'})`);
	return { applied: true, kind: 'subscription', amountCents: p.amountCents, organizationId: orgId };
}
