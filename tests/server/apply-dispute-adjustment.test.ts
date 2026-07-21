/**
 * Regression tests for server/utils/apply-dispute-adjustment.ts — the invoice
 * dispute (chargeback) reconciliation path, exercised against the real
 * recomputeInvoiceStatus so the invoice status transitions are covered too.
 *
 * Scenarios (mirrors the acceptance criteria in docs/refund-reconciliation-brief.md):
 *   - created                 → payment marked disputed, invoice untouched, admins notified
 *   - created → closed(won)    → payment restored to succeeded, no ledger change
 *   - created → closed(lost)   → negative reversal row booked, invoice reopens, idempotent
 *   - partial dispute lost      → invoice drops to processing (partial reversal)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createFakeDirectus, mockDirectusSdk, type FakeDirectus } from './_fake-directus';

vi.mock('@directus/sdk', () => mockDirectusSdk());

// Imported after the mock is registered.
import { handleDisputeCreated, handleDisputeClosed } from '~~/server/utils/apply-dispute-adjustment';

const ORG = 'org-1';
const INVOICE = 'inv-1';
const CHARGE = 'ch_test_1';
const PI = 'pi_test_1';

function seedPaid(total = 100, paid = 100): FakeDirectus {
	const fake = createFakeDirectus({
		invoices: [{ id: INVOICE, status: paid >= total ? 'paid' : 'processing', total_amount: total }],
		payments_received: [
			{
				id: 'pay-orig',
				payment_intent: PI,
				charge_id: CHARGE,
				stripe_status: 'succeeded',
				amount: paid.toFixed(2),
				invoice_id: INVOICE,
				organization: ORG,
				status: 'paid',
				livemode: false,
			},
		],
		org_memberships: [
			{ id: 'm1', organization: ORG, status: 'active', role: { slug: 'owner' }, user: 'user-owner' },
			{ id: 'm2', organization: ORG, status: 'active', role: { slug: 'admin' }, user: 'user-admin' },
			{ id: 'm3', organization: ORG, status: 'active', role: { slug: 'member' }, user: 'user-member' },
		],
	});
	vi.stubGlobal('getTypedDirectus', () => fake);
	return fake;
}

const dispute = (over: Partial<any> = {}): any => ({
	id: 'dp_1',
	charge: CHARGE,
	payment_intent: PI,
	amount: 10000, // cents
	reason: 'fraudulent',
	status: 'needs_response',
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

describe('handleDisputeCreated', () => {
	it('marks the original payment disputed, leaves the invoice + ledger untouched, notifies admins', async () => {
		const fake = seedPaid();
		const res = await handleDisputeCreated(dispute(), ORG);

		expect(res.marked).toBe(true);
		const orig = fake.db.payments_received.find((r) => r.id === 'pay-orig')!;
		expect(orig.stripe_status).toBe('disputed');
		// No negative reversal row yet — funds only held.
		expect(fake.db.payments_received).toHaveLength(1);
		// Invoice stays paid until the dispute closes.
		expect(fake.db.invoices[0]!.status).toBe('paid');
		// Owner + admin notified, not the plain member.
		expect(fake.notifications).toHaveLength(2);
	});

	it('is a no-op on retry (already disputed → no duplicate note/write)', async () => {
		const fake = seedPaid();
		await handleDisputeCreated(dispute(), ORG);
		const notesAfterFirst = fake.db.payments_received.find((r) => r.id === 'pay-orig')!.note;
		const updatesAfterFirst = fake.writes.update;

		await handleDisputeCreated(dispute(), ORG);
		const orig = fake.db.payments_received.find((r) => r.id === 'pay-orig')!;
		// Note not appended a second time; the guard skips the update.
		expect(orig.note).toBe(notesAfterFirst);
		expect(fake.writes.update).toBe(updatesAfterFirst);
	});
});

describe('handleDisputeClosed — won', () => {
	it('restores the payment to succeeded and books no reversal', async () => {
		const fake = seedPaid();
		await handleDisputeCreated(dispute(), ORG);
		const res = await handleDisputeClosed(dispute({ status: 'won' }), ORG);

		expect(res.applied).toBe(false);
		const orig = fake.db.payments_received.find((r) => r.id === 'pay-orig')!;
		expect(orig.stripe_status).toBe('succeeded');
		expect(fake.db.payments_received).toHaveLength(1);
		expect(fake.db.invoices[0]!.status).toBe('paid');
	});
});

describe('handleDisputeClosed — lost (full)', () => {
	it('books a negative reversal row and reopens the invoice', async () => {
		const fake = seedPaid();
		await handleDisputeCreated(dispute(), ORG);
		const res = await handleDisputeClosed(dispute({ status: 'lost' }), ORG);

		expect(res.applied).toBe(true);
		expect(res.newInvoiceStatus).toBe('pending');

		const rows = fake.db.payments_received;
		expect(rows).toHaveLength(2);
		const neg = rows.find((r) => Number(r.amount) < 0)!;
		expect(neg.amount).toBe('-100.00');
		expect(neg.stripe_status).toBe('dispute_lost');
		expect(neg.status).toBe('paid'); // must be 'paid' so recompute nets it

		// Net paid total is zero → invoice pending.
		expect(paidTotal(fake)).toBe(0);
		const inv = fake.db.invoices[0]!;
		expect(inv.status).toBe('pending');
		// Reconciliation state distinguishes "reversed" from "never paid".
		expect(inv.refunded_total).toBe('100.00');
		expect(inv.disputed).toBe(true);
	});

	it('is idempotent — a retried closed(lost) event books no second reversal', async () => {
		const fake = seedPaid();
		await handleDisputeClosed(dispute({ status: 'lost' }), ORG);
		const rowsAfterFirst = fake.db.payments_received.length;

		const res2 = await handleDisputeClosed(dispute({ status: 'lost' }), ORG);
		expect(res2.applied).toBe(false);
		expect(fake.db.payments_received.length).toBe(rowsAfterFirst);
		expect(paidTotal(fake)).toBe(0);
	});
});

describe('handleDisputeClosed — lost (partial)', () => {
	it('reverses only the disputed amount and drops the invoice to processing', async () => {
		const fake = seedPaid(100, 100);
		// $40 partial chargeback of a $100 charge.
		const res = await handleDisputeClosed(dispute({ status: 'lost', amount: 4000 }), ORG);

		expect(res.applied).toBe(true);
		const neg = fake.db.payments_received.find((r) => Number(r.amount) < 0)!;
		expect(neg.amount).toBe('-40.00');
		expect(paidTotal(fake)).toBe(60);
		expect(fake.db.invoices[0]!.status).toBe('processing');
		expect(res.newInvoiceStatus).toBe('processing');
	});
});
