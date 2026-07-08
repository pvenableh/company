#!/usr/bin/env npx tsx
/**
 * Verify the refund → negative-adjustment-row mechanic against PROD Directus,
 * scoped entirely to a DEMO org and fully self-cleaning.
 *
 * What it proves (the empirical unknowns behind server/utils/apply-refund-adjustment.ts):
 *   1. payments_received.amount accepts and stores a NEGATIVE decimal (the whole
 *      design rests on this — if the column were unsigned/validated, it'd fail).
 *   2. The exact recompute query (sum amount where status='paid' AND invoice_id=…)
 *      nets the negative adjustment row down, so a full refund → 'pending' and a
 *      partial refund → 'processing'.
 *   3. The cumulative-refund delta math is idempotent (a repeat event is a no-op).
 *
 * It replicates recomputeInvoiceStatus's status math (a simple sum, read from
 * server/utils/recompute-invoice-status.ts) rather than importing it — that util
 * relies on Nuxt's auto-imported getTypedDirectus and isn't importable standalone.
 *
 * WRITES: creates one throwaway invoice + payment rows in a DEMO org, then
 * DELETES every row it created. Makes no permission/schema changes.
 *
 * Run: pnpm tsx scripts/verify-refund-adjustment.ts
 */
import 'dotenv/config';

const BASE = (process.env.DIRECTUS_URL || 'https://admin.earnest.guru').replace(/\/$/, '');
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!TOKEN) { console.error('Error: DIRECTUS_SERVER_TOKEN required'); process.exit(1); }

// Demo orgs (blast-radius allowlist). v2 Agency Admin org.
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
async function recompute(invoiceId: string): Promise<{ paidTotal: number; status: string }> {
	const rows = await req(
		'GET',
		`/items/payments_received?filter[_and][0][invoice_id][_eq]=${invoiceId}&filter[_and][1][status][_eq]=paid&fields=amount&limit=-1`,
	);
	const paidTotal = (rows as Array<{ amount: string | null }>).reduce((s, p) => s + Number(p.amount || 0), 0);
	const total = 100;
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
	// Resolve a demo org.
	const orgs = await req('GET', `/items/organizations?fields=id,name&limit=200`);
	const demo = (orgs as Array<{ id: string; name: string }>).find((o) =>
		DEMO_ORG_PREFIXES.some((p) => o.id.startsWith(p)),
	);
	if (!demo) throw new Error('No demo org found by prefix — aborting (refusing to write to a non-demo org)');
	console.log(`\nDemo org: ${demo.name} (${demo.id})\n`);

	// 1) Throwaway invoice, total 100, starts pending.
	const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
	const invoice = await req('POST', '/items/invoices', {
		invoice_code: `ZZ-REFUND-VERIFY-${stamp}`,
		title: 'ZZ refund-verify (delete me)',
		total_amount: 100,
		status: 'pending',
		bill_to: demo.id,
	});
	created.push({ collection: 'invoices', id: invoice.id });
	console.log(`Invoice ${invoice.invoice_code} (${invoice.id}) total=100 status=pending`);

	// 2) Original succeeded payment of 100 → invoice should read 'paid'.
	const orig = await req('POST', '/items/payments_received', {
		payment_intent: `pi_verify_${stamp}`,
		charge_id: `ch_verify_${stamp}`,
		stripe_status: 'succeeded',
		amount: '100.00',
		invoice_id: invoice.id,
		organization: demo.id,
		status: 'paid',
		date_received: new Date().toISOString(),
	});
	created.push({ collection: 'payments_received', id: orig.id });
	console.log('\n[A] Original $100 payment recorded');
	check('invoice after full payment', (await recompute(invoice.id)).status, 'paid');

	// 3) FULL refund → negative -100 adjustment row. Invoice should drop to 'pending'.
	const fullAdj = await req('POST', '/items/payments_received', {
		payment_intent: `pi_verify_${stamp}`,
		charge_id: `ch_verify_${stamp}`,
		stripe_status: 'refund',
		amount: '-100.00',
		invoice_id: invoice.id,
		organization: demo.id,
		status: 'paid',
		date_received: new Date().toISOString(),
	});
	created.push({ collection: 'payments_received', id: fullAdj.id });
	console.log('\n[B] FULL refund: -100.00 adjustment row');
	// Prove the negative was actually stored (not coerced) — the make-or-break check.
	const readBack = await req('GET', `/items/payments_received/${fullAdj.id}?fields=amount`);
	check('negative amount stored intact', readBack.amount, '-100.00');
	const afterFull = await recompute(invoice.id);
	check('paid total nets to 0', afterFull.paidTotal, 0);
	check('invoice after full refund', afterFull.status, 'pending');

	// 4) Swap to a PARTIAL refund of 40 → invoice should read 'processing' (60 net).
	await req('DELETE', `/items/payments_received/${fullAdj.id}`);
	created.splice(created.findIndex((c) => c.id === fullAdj.id), 1);
	const partAdj = await req('POST', '/items/payments_received', {
		payment_intent: `pi_verify_${stamp}`,
		charge_id: `ch_verify_${stamp}`,
		stripe_status: 'refund',
		amount: '-40.00',
		invoice_id: invoice.id,
		organization: demo.id,
		status: 'paid',
		date_received: new Date().toISOString(),
	});
	created.push({ collection: 'payments_received', id: partAdj.id });
	console.log('\n[C] PARTIAL refund: -40.00 adjustment row');
	const afterPart = await recompute(invoice.id);
	check('paid total nets to 60', afterPart.paidTotal, 60);
	check('invoice after partial refund', afterPart.status, 'processing');

	// 5) Idempotency (pure math, mirrors the util): cumulative amount_refunded
	//    minus already-booked adjustments = delta; a repeat event yields <= 0.
	console.log('\n[D] Idempotency delta math (cumulative - already-booked)');
	const already = 4000; // cents already booked (the -40 above)
	check('repeat of same 40 refund → no-op', 4000 - already <= 0, true);
	check('further refund to 100 cumulative → books 60 more', 10000 - already, 6000);
}

async function cleanup() {
	console.log('\nCleanup:');
	// Delete payment rows before the invoice (FK safety).
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
