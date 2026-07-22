// server/utils/referral-reward.ts
/**
 * Org-referral rewards.
 *
 * When a current subscriber refers a NEW organization (via a `?ref=<orgId>`
 * signup link), the new org's Stripe customer is stamped at registration with
 * `referred_by_org` metadata (see server/api/auth/register.post.ts). When that
 * org later converts to a PAID subscription, both sides earn bonus AI tokens.
 *
 * Design notes:
 * - Rewarding on PAID CONVERSION (not signup) is the fraud-resistant trigger —
 *   a referral only pays out once the referred org is actually a customer.
 * - Attribution + the idempotency flag both live in Stripe CUSTOMER METADATA,
 *   so this whole feature needs NO Directus schema change. `referral_rewarded`
 *   is set on the referred org's customer after payout, so repeated
 *   subscription.updated webhooks never double-pay.
 * - The only Directus write is an additive bump of `ai_token_balance` on each
 *   org (an existing, server-writable field). Everything here is best-effort
 *   and MUST NOT throw — it runs inside the Stripe webhook and can never be
 *   allowed to break billing sync.
 */

import { readItem, updateItem } from '@directus/sdk';
import type Stripe from 'stripe';

// Bonus AI tokens granted on a successful referral conversion. 100K mirrors the
// smallest sold token pack (~$9 of value) — meaningful but not exploitable.
export const REFERRER_BONUS_TOKENS = 100_000;
export const REFEREE_BONUS_TOKENS = 100_000;

// Subscription states that count as "converted / paying".
const PAID_STATUSES = new Set(['active', 'trialing']);

/**
 * Additively grant bonus AI tokens to an org. Reads the current balance and
 * writes balance + bonus. Returns true on success. Never throws.
 */
async function grantBonusTokens(directus: ReturnType<typeof getTypedDirectus>, orgId: string, bonus: number): Promise<boolean> {
	try {
		const org = (await directus.request(
			readItem('organizations', orgId, { fields: ['id', 'ai_token_balance'] }),
		)) as any;
		if (!org) return false;
		const current = Number(org.ai_token_balance) || 0;
		await directus.request(
			updateItem('organizations', orgId, { ai_token_balance: current + bonus }),
		);
		return true;
	} catch (err: any) {
		console.error(`[referral] grantBonusTokens failed for org ${orgId}:`, err?.message || err);
		return false;
	}
}

/**
 * If the just-converted org was referred, pay out the referral once.
 *
 * @param directus     server Directus client (typed)
 * @param orgId        the referred (newly-subscribing) org
 * @param customerId   that org's Stripe customer id (carries the attribution)
 * @param subscription the Stripe subscription that triggered this
 */
export async function maybeGrantReferralReward(opts: {
	directus: ReturnType<typeof getTypedDirectus>;
	orgId: string | null;
	customerId: string | null;
	subscription: Stripe.Subscription;
}): Promise<void> {
	const { directus, orgId, customerId, subscription } = opts;
	try {
		if (!orgId || !customerId) return;
		if (!PAID_STATUSES.has(subscription.status)) return;

		const stripe = useStripe();
		const customer = await stripe.customers.retrieve(customerId);
		if (!customer || (customer as any).deleted) return;

		const meta = ((customer as Stripe.Customer).metadata || {}) as Record<string, string>;
		const referrerId = meta.referred_by_org;

		if (!referrerId) return; // not a referred org
		if (referrerId === orgId) return; // guard against self-referral
		if (meta.referral_rewarded === '1') return; // already paid — idempotent

		// Confirm the referrer still exists before crediting.
		let referrerOk = false;
		try {
			const referrer = (await directus.request(
				readItem('organizations', referrerId, { fields: ['id'] }),
			)) as any;
			referrerOk = !!referrer?.id;
		} catch {
			referrerOk = false;
		}
		if (!referrerOk) return;

		const rewardedReferrer = await grantBonusTokens(directus, referrerId, REFERRER_BONUS_TOKENS);
		await grantBonusTokens(directus, orgId, REFEREE_BONUS_TOKENS);

		// Mark paid on the customer metadata so we never double-reward, even if
		// the crediting above partially failed (we don't want a retry storm to
		// keep bumping balances). Preserve existing metadata.
		await stripe.customers.update(customerId, {
			metadata: {
				...meta,
				referral_rewarded: '1',
				referral_rewarded_at: new Date().toISOString(),
			},
		});

		console.log(
			`[referral] rewarded conversion: org ${orgId} referred by ${referrerId} ` +
				`(referrer credited: ${rewardedReferrer})`,
		);
	} catch (err: any) {
		// Never let a reward failure affect billing sync.
		console.error('[referral] maybeGrantReferralReward failed (non-fatal):', err?.message || err);
	}
}
