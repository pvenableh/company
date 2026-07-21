/**
 * Regression tests for server/utils/apply-refund-adjustment.ts — the invoice
 * refund reconciliation path. Covers the cumulative-delta idempotency contract
 * (Stripe sends `amount_refunded` as a running total, and charge.refunded can
 * fire repeatedly), full vs partial refunds, and the invoice status transition.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createFakeDirectus, mockDirectusSdk, type FakeDirectus } from './_fake-directus';

vi.mock('@directus/sdk', () => mockDirectusSdk());

import { applyRefundAdjustment } from '~~/server/utils/apply-refund-adjustment';

const ORG = 'org-1';
const INVOICE = 'inv-1';
const CHARGE = 'ch_test_1';
const PI = 'pi_test_1';

function seedPaid(total = 100): FakeDirectus {
	const fake = createFakeDirectus({
		invoices: [{ id: INVOICE, status: 'paid', total_amount: total }],
		payments_received: [
			{
				id: 'pay-orig',
				payment_intent: PI,
				charge_id: CHARGE,
				stripe_status: 'succeeded',
				amount: total.toFixed(2),
				invoice_id: INVOICE,
				organization: ORG,
				status: 'paid',
				livemode: false,
			},
		],
	});
	vi.stubGlobal('getTypedDirectus', () => fake);
	return fake;
}

const charge = (amountRefundedCents: number, over: Partial<any> = {}): any => ({
	id: CHARGE,
	payment_intent: PI,
	amount: 10000,
	amount_refunded: amountRefundedCents,
	livemode: false,
	...over,
});

function paidTotal(fake: FakeDirectus): number {
	return fake.db.payments_received
		.filter((r) => r.status === 'paid')
		.reduce((s, r) => s + Number(r.amount || 0), 0);
}

beforeEach(() => {
	vi.restoreAllMocks();
});

describe('applyRefundAdjustment — full refund', () => {
	it('books a full negative row and drops the invoice to pending', async () => {
		const fake = seedPaid();
		const res = await applyRefundAdjustment(charge(10000), ORG);

		expect(res.applied).toBe(true);
		expect(res.fullyRefunded).toBe(true);
		const neg = fake.db.payments_received.find((r) => Number(r.amount) < 0)!;
		expect(neg.amount).toBe('-100.00');
		expect(paidTotal(fake)).toBe(0);
		const inv = fake.db.invoices[0]!;
		expect(inv.status).toBe('pending');
		expect(inv.refunded_total).toBe('100.00');
		expect(inv.disputed).toBe(false);
		expect(fake.db.payments_received.find((r) => r.id === 'pay-orig')!.stripe_status).toBe('refunded');
	});
});

describe('applyRefundAdjustment — partial refund', () => {
	it('books only the delta and drops the invoice to processing', async () => {
		const fake = seedPaid();
		const res = await applyRefundAdjustment(charge(4000), ORG);

		expect(res.applied).toBe(true);
		expect(res.fullyRefunded).toBe(false);
		expect(fake.db.payments_received.find((r) => Number(r.amount) < 0)!.amount).toBe('-40.00');
		expect(paidTotal(fake)).toBe(60);
		expect(fake.db.invoices[0]!.status).toBe('processing');
		expect(fake.db.payments_received.find((r) => r.id === 'pay-orig')!.stripe_status).toBe('partially_refunded');
	});
});

describe('applyRefundAdjustment — cumulative idempotency', () => {
	it('a retried identical charge.refunded event books nothing', async () => {
		const fake = seedPaid();
		await applyRefundAdjustment(charge(4000), ORG);
		const rowsAfterFirst = fake.db.payments_received.length;

		const res2 = await applyRefundAdjustment(charge(4000), ORG);
		expect(res2.applied).toBe(false);
		expect(res2.reason).toBe('already-applied');
		expect(fake.db.payments_received.length).toBe(rowsAfterFirst);
		expect(paidTotal(fake)).toBe(60);
	});

	it('incremental partial refunds only book the new portion each time', async () => {
		const fake = seedPaid();
		// First $40, then a later event reports cumulative $100.
		await applyRefundAdjustment(charge(4000), ORG);
		const res2 = await applyRefundAdjustment(charge(10000), ORG);

		expect(res2.applied).toBe(true);
		expect(res2.adjustmentAmount).toBe(60); // 100 cumulative − 40 already booked
		const negs = fake.db.payments_received.filter((r) => Number(r.amount) < 0).map((r) => r.amount).sort();
		expect(negs).toEqual(['-40.00', '-60.00']);
		expect(paidTotal(fake)).toBe(0);
		expect(fake.db.invoices[0]!.status).toBe('pending');
	});
});
