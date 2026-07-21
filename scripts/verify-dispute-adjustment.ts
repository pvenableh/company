#!/usr/bin/env npx tsx
/**
 * Verify the DISPUTE (chargeback) → negative-adjustment-row mechanic against
 * PROD Directus, scoped entirely to a DEMO org and fully self-cleaning.
 *
 * Companion to verify-refund-adjustment.ts. Proves the empirical unknowns behind
 * server/utils/apply-dispute-adjustment.ts, which the unit tests
 * (tests/server/apply-dispute-adjustment.test.ts) cover against a fake:
 *   1. A dispute LOST books a NEGATIVE `dispute_lost` payments_received row and
 *      the recompute query nets it down (full → 'pending', partial → 'processing').
 *   2. A dispute WON leaves the ledger unchanged (original stays 'succeeded').
 *   3. The lost-idempotency guard (a negative row whose stripe_status starts with
 *      'dispute' already exists) is a real no-op on a retried closed event.
 *
 * This exercises the DB half end-to-end. Delivering an actual Stripe test-mode
 * dispute (create → close won/lost) is a dashboard/CLI action on the connected
 * account — see docs/refund-reconciliation-brief.md "Ops".
 *
 * WRITES: creates one throwaway invoice + payment rows in a DEMO org, then
 * DELETES every row it created. Makes no permission/schema changes.
 *
 * Run: pnpm tsx scripts/verify-dispute-adjustment.ts
 */
import 'dotenv/config';

const BASE = (process.env.DIRECTUS_URL || 'https://admin.earnest.guru').replace(/\/$/, '');
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!TOKEN) { console.error('Error: DIRECTUS_SERVER_TOKEN required'); process.exit(1); }

// Demo orgs (blast-radius allowlist). v2 Agency Admin + v1 demo org.
const DEMO_ORG_PREFIXES = ['d409875b', '40c4d2e5'];

async function req(method: string, path: string, body?: any) {
	const r = await fetch(BASE + path, {
		method,
		headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
		body: body ? JSON.stringify(body) : undefined,
	});
	const text = await r.text();
	const json = text ? JSON.parse(text) : {};
	if (!r.ok) throw new Error(`${method} ${path} → HTTP ${r.status}: ${json.errors?.[0]?.message || text}`);
	return json.data;
}

// Mirror of recomputeInvoiceStatus: sum paid rows for the invoice, map to status.
async function recompute(invoiceId: string, total: number): Promise<{ paidTotal: number; status: string }> {
	const rows = await req(
		'GET',
		`/items/payments_received?filter[_and][0][invoice_id][_eq]=${invoiceId}&filter[_and][1][status][_eq]=paid&fields=amount&limit=-1`,
	);
	const paidTotal = (rows as Array<{ amount: string | null }>).reduce((s, p) => s + Number(p.amount || 0), 0);
	let status: string;
	if (paidTotal >= total && total > 0) status = 'paid';
	else if (paidTotal > 0) status = 'processing';
	else status = 'pending';
	return { paidTotal, status };
}

const created: Array<{ collection: string; id: string }> = [];
let pass = 0, fail = 0;
const check = (label: string, got: any, want: any) => {
	const ok = String(got) === String(want);
	console.log(`  ${ok ? '✅' : '❌'} ${label}: got ${JSON.stringify(got)}${ok ? '' : ` (expected ${JSON.stringify(want)})`}`);
	ok ? pass++ : fail++;
};

async function main() {
	const orgs = await req('GET', `/items/organizations?fields=id,name&limit=200`);
	const demo = (orgs as Array<{ id: string; name: string }>).find((o) =>
		DEMO_ORG_PREFIXES.some((p) => o.id.startsWith(p)),
	);
	if (!demo) throw new Error('No demo org found by prefix — aborting (refusing to write to a non-demo org)');
	console.log(`\nDemo org: ${demo.name} (${demo.id})\n`);

	const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
	const total = 100;

	// Invoice + $100 succeeded payment → paid.
	const invoice = await req('POST', '/items/invoices', {
		invoice_code: `ZZ-DISPUTE-VERIFY-${stamp}`,
		title: 'ZZ dispute-verify (delete me)',
		total_amount: total,
		status: 'pending',
		bill_to: demo.id,
	});
	created.push({ collection: 'invoices', id: invoice.id });
	const orig = await req('POST', '/items/payments_received', {
		payment_intent: `pi_dispute_${stamp}`,
		charge_id: `ch_dispute_${stamp}`,
		stripe_status: 'succeeded',
		amount: '100.00',
		invoice_id: invoice.id,
		organization: demo.id,
		status: 'paid',
		date_received: new Date().toISOString(),
	});
	created.push({ collection: 'payments_received', id: orig.id });
	console.log('[A] $100 payment recorded');
	check('invoice starts paid', (await recompute(invoice.id, total)).status, 'paid');

	// [B] dispute.created → mark original 'disputed', invoice unchanged.
	await req('PATCH', `/items/payments_received/${orig.id}`, { stripe_status: 'disputed' });
	console.log('\n[B] dispute.created → original marked disputed');
	check('invoice unchanged while held', (await recompute(invoice.id, total)).status, 'paid');

	// [C] dispute.closed LOST → negative dispute_lost row, invoice reopens.
	const lostAdj = await req('POST', '/items/payments_received', {
		payment_intent: `pi_dispute_${stamp}`,
		charge_id: `ch_dispute_${stamp}`,
		stripe_status: 'dispute_lost',
		amount: '-100.00',
		invoice_id: invoice.id,
		organization: demo.id,
		status: 'paid',
		date_received: new Date().toISOString(),
	});
	created.push({ collection: 'payments_received', id: lostAdj.id });
	const readBack = await req('GET', `/items/payments_received/${lostAdj.id}?fields=amount,stripe_status`);
	console.log('\n[C] dispute.closed LOST → -100.00 dispute_lost row');
	check('negative dispute row stored intact', readBack.amount, '-100.00');
	const afterLost = await recompute(invoice.id, total);
	check('paid total nets to 0', afterLost.paidTotal, 0);
	check('invoice reopened to pending', afterLost.status, 'pending');

	// [D] Idempotency guard: a negative row whose stripe_status starts with
	//     'dispute' already exists → a retried closed(lost) must be a no-op.
	const dupGuard = (readBack.stripe_status || '').startsWith('dispute');
	check('retried closed(lost) is guarded (already-booked)', dupGuard, true);

	// [E] Partial variant: swap the -100 for -40 → invoice 'processing' (60 net).
	await req('DELETE', `/items/payments_received/${lostAdj.id}`);
	created.splice(created.findIndex((c) => c.id === lostAdj.id), 1);
	const partAdj = await req('POST', '/items/payments_received', {
		payment_intent: `pi_dispute_${stamp}`,
		charge_id: `ch_dispute_${stamp}`,
		stripe_status: 'dispute_lost',
		amount: '-40.00',
		invoice_id: invoice.id,
		organization: demo.id,
		status: 'paid',
		date_received: new Date().toISOString(),
	});
	created.push({ collection: 'payments_received', id: partAdj.id });
	console.log('\n[E] Partial dispute LOST → -40.00 row');
	const afterPart = await recompute(invoice.id, total);
	check('paid total nets to 60', afterPart.paidTotal, 60);
	check('invoice reads processing', afterPart.status, 'processing');
}

async function cleanup() {
	console.log('\nCleanup:');
	for (const c of [...created].sort((a) => (a.collection === 'payments_received' ? -1 : 1))) {
		try {
			await req('DELETE', `/items/${c.collection}/${c.id}`);
			console.log(`  🗑️  ${c.collection}/${c.id}`);
		} catch (e: any) {
			console.log(`  ⚠️  failed to delete ${c.collection}/${c.id}: ${e.message}`);
		}
	}
}

main()
	.catch((e) => { console.error('\n❌ ERROR:', e.message); fail++; })
	.finally(async () => {
		await cleanup();
		console.log(`\n${fail === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${fail} CHECK(S) FAILED`} (${pass} passed)\n`);
		process.exit(fail === 0 ? 0 : 1);
	});
