/**
 * Regression tests for server/utils/apply-platform-reversal.ts — the PLATFORM
 * account refund/dispute path: AI-token clawback (inverse of
 * fulfill-token-purchase.ts) + subscription flagging.
 *
 * Acceptance criteria covered (docs/refund-reconciliation-brief.md §B):
 *   - token refund reduces the balance by the refunded proportion, clamped at
 *     zero, idempotently, with an audit row
 *   - token dispute lost claws back tokens, idempotent by dispute id
 *   - subscription refund flags + notifies without touching any balance
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createFakeDirectus, mockDirectusSdk, type FakeDirectus } from './_fake-directus';

vi.mock('@directus/sdk', () => mockDirectusSdk());

import { handlePlatformChargeRefund, handlePlatformDispute } from '~~/server/utils/apply-platform-reversal';

const ORG = 'org-1';
const PI = 'pi_tok_1';
const CHARGE = 'ch_tok_1';

function seedTokenPurchase(opts: { balance?: number; tokens?: number; amountCents?: number } = {}): FakeDirectus {
	const { balance = 100_000, tokens = 100_000, amountCents = 900 } = opts;
	const fake = createFakeDirectus({
		organizations: [{ id: ORG, ai_token_balance: balance }],
		token_purchases: [
			{
				id: 'tp-1',
				organization: ORG,
				stripe_payment_intent: PI,
				tokens,
				amount_cents: amountCents,
				status: 'paid',
			},
		],
		directus_users: [
			{ id: 'admin-1', role: '3a63a4e1-c82e-46f8-9993-7f11ac6a4b01', status: 'active' },
		],
	});
	vi.stubGlobal('getTypedDirectus', () => fake);
	return fake;
}

const charge = (amountRefundedCents: number, over: Partial<any> = {}): any => ({
	id: CHARGE,
	payment_intent: PI,
	amount: 900,
	amount_refunded: amountRefundedCents,
	livemode: false,
	customer: 'cus_1',
	...over,
});

const dispute = (over: Partial<any> = {}): any => ({
	id: 'dp_tok_1',
	charge: CHARGE,
	payment_intent: PI,
	amount: 900,
	reason: 'fraudulent',
	status: 'lost',
	livemode: false,
	...over,
});

const balance = (fake: FakeDirectus) => Number(fake.db.organizations[0]!.ai_token_balance);
const reversals = (fake: FakeDirectus) => fake.db.platform_reversals;

beforeEach(() => {
	vi.restoreAllMocks();
});

describe('handlePlatformChargeRefund — token purchase', () => {
	it('full refund claws back all tokens and books an audit row', async () => {
		const fake = seedTokenPurchase();
		const res = await handlePlatformChargeRefund(charge(900));

		expect(res.applied).toBe(true);
		expect(res.kind).toBe('token');
		expect(res.tokensClawedBack).toBe(100_000);
		expect(balance(fake)).toBe(0);
		expect(fake.db.token_purchases[0]!.status).toBe('refunded');
		expect(reversals(fake)).toHaveLength(1);
		expect(reversals(fake)[0]).toMatchObject({ type: 'token_refund', tokens_clawed_back: 100_000, amount_cents: 900 });
	});

	it('partial refund claws back the proportional token amount', async () => {
		const fake = seedTokenPurchase();
		const res = await handlePlatformChargeRefund(charge(450)); // half of $9

		expect(res.tokensClawedBack).toBe(50_000);
		expect(balance(fake)).toBe(50_000);
		expect(fake.db.token_purchases[0]!.status).toBe('partially_refunded');
	});

	it('never drives the balance below zero (tokens already spent)', async () => {
		const fake = seedTokenPurchase({ balance: 20_000 }); // 80k already used
		const res = await handlePlatformChargeRefund(charge(900));

		expect(res.tokensClawedBack).toBe(100_000); // clawback intent is full
		expect(balance(fake)).toBe(0); // but balance clamps at zero
	});

	it('is idempotent under cumulative retries — books only the new delta', async () => {
		const fake = seedTokenPurchase();
		await handlePlatformChargeRefund(charge(450)); // first $4.50 → 50k
		const res2 = await handlePlatformChargeRefund(charge(450)); // same cumulative → no-op
		expect(res2.applied).toBe(false);
		expect(res2.reason).toBe('already-applied');
		expect(balance(fake)).toBe(50_000);

		const res3 = await handlePlatformChargeRefund(charge(900)); // cumulative rises to full
		expect(res3.applied).toBe(true);
		expect(res3.tokensClawedBack).toBe(50_000); // only the remaining 50k
		expect(balance(fake)).toBe(0);
		// Cumulative clawback never exceeds tokens granted.
		const totalClawed = reversals(fake).reduce((s, r) => s + Number(r.tokens_clawed_back || 0), 0);
		expect(totalClawed).toBe(100_000);
	});
});

describe('handlePlatformDispute — token purchase', () => {
	it('created only alerts (funds held) — no clawback', async () => {
		const fake = seedTokenPurchase();
		const res = await handlePlatformDispute(dispute({ status: 'needs_response' }), 'created');
		expect(res.applied).toBe(false);
		expect(balance(fake)).toBe(100_000);
		expect(reversals(fake)).toHaveLength(0);
		expect(fake.notifications.length).toBeGreaterThan(0);
	});

	it('closed(won) restores nothing and books no reversal', async () => {
		const fake = seedTokenPurchase();
		const res = await handlePlatformDispute(dispute({ status: 'won' }), 'closed');
		expect(res.applied).toBe(false);
		expect(balance(fake)).toBe(100_000);
		expect(reversals(fake)).toHaveLength(0);
	});

	it('closed(lost) claws back tokens and is idempotent by dispute id', async () => {
		const fake = seedTokenPurchase();
		const res = await handlePlatformDispute(dispute({ status: 'lost' }), 'closed');
		expect(res.applied).toBe(true);
		expect(res.tokensClawedBack).toBe(100_000);
		expect(balance(fake)).toBe(0);
		expect(reversals(fake)[0]).toMatchObject({ type: 'token_dispute', stripe_dispute_id: 'dp_tok_1' });

		const res2 = await handlePlatformDispute(dispute({ status: 'lost' }), 'closed');
		expect(res2.applied).toBe(false);
		expect(res2.reason).toBe('already-applied');
		expect(reversals(fake)).toHaveLength(1);
	});
});

describe('handlePlatformChargeRefund — subscription (no token purchase)', () => {
	it('flags + notifies without touching any token balance', async () => {
		const fake = createFakeDirectus({
			organizations: [{ id: ORG, stripe_customer_id: 'cus_sub', ai_token_balance: 5000 }],
			directus_users: [{ id: 'admin-1', role: '3a63a4e1-c82e-46f8-9993-7f11ac6a4b01', status: 'active' }],
		});
		vi.stubGlobal('getTypedDirectus', () => fake);

		const res = await handlePlatformChargeRefund(charge(2000, { payment_intent: 'pi_sub_1', customer: 'cus_sub' }));
		expect(res.applied).toBe(true);
		expect(res.kind).toBe('subscription');
		expect(res.organizationId).toBe(ORG);
		expect(balance(fake)).toBe(5000); // untouched
		expect(fake.db.platform_reversals[0]).toMatchObject({ type: 'subscription_refund', organization: ORG });
	});
});
