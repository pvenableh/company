#!/usr/bin/env npx tsx
/**
 * invoices.refunded_total + invoices.disputed — explicit reconciliation state.
 *
 * Why: a refund or lost dispute nets an invoice back down to
 * 'processing'/'pending' via a negative payments_received row (see
 * server/utils/apply-refund-adjustment.ts + apply-dispute-adjustment.ts). Status
 * alone can't tell "was paid, then refunded" apart from "never paid" — both read
 * 'pending'. These two additive fields carry that distinction for reporting + UI:
 *   - refunded_total  decimal  cumulative refunded/reversed amount (abs of the
 *                              sum of negative adjustment rows), set by recompute.
 *   - disputed        boolean  any dispute is/was open or lost on this invoice.
 *
 * recomputeInvoiceStatus writes both on every recompute. Additive + idempotent —
 * safe to run before the code deploys (recompute tolerates their absence).
 *
 * Run:   pnpm tsx scripts/setup-invoice-refund-fields.ts
 * Then:  pnpm generate:types
 */
import 'dotenv/config';

const DIRECTUS_URL = (process.env.DIRECTUS_URL || 'http://localhost:8055').replace(/\/$/, '');
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!TOKEN) {
	console.error('DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN required');
	process.exit(1);
}

const COLLECTION = 'invoices';

async function req(path: string, method: 'GET' | 'POST' | 'PATCH' = 'GET', body?: unknown) {
	const r = await fetch(`${DIRECTUS_URL}${path}`, {
		method,
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
		body: body ? JSON.stringify(body) : undefined,
	});
	return { ok: r.ok, status: r.status, text: await r.text() };
}

async function fieldExists(field: string): Promise<boolean> {
	const { ok } = await req(`/fields/${COLLECTION}/${field}`);
	return ok;
}

async function addField(field: string, payload: unknown) {
	if (await fieldExists(field)) {
		console.log(`  ✓ ${COLLECTION}.${field} already exists`);
		return;
	}
	const { ok, text } = await req(`/fields/${COLLECTION}`, 'POST', payload);
	if (!ok && !/exists/i.test(text)) {
		console.error(`  ✗ ${field} create failed: ${text}`);
		process.exit(1);
	}
	console.log(`  + ${COLLECTION}.${field} created`);
}

async function main() {
	console.log(`\n── ${COLLECTION} refund/dispute fields ──\n`);
	console.log(`Directus: ${DIRECTUS_URL}\n`);

	await addField('refunded_total', {
		field: 'refunded_total',
		type: 'decimal',
		meta: {
			interface: 'input',
			note: 'Cumulative amount refunded or reversed (chargeback lost). Set by recomputeInvoiceStatus.',
			width: 'half',
			readonly: true,
			display: 'formatted-value',
			display_options: { prefix: '$' },
		},
		schema: { numeric_precision: 12, numeric_scale: 2, default_value: 0, is_nullable: true },
	});

	await addField('disputed', {
		field: 'disputed',
		type: 'boolean',
		meta: {
			interface: 'boolean',
			note: 'A payment on this invoice is/was disputed (chargeback). Set by recomputeInvoiceStatus.',
			width: 'half',
			readonly: true,
		},
		schema: { default_value: false, is_nullable: true },
	});

	console.log('\n── Done ──\n');
	console.log('Next: pnpm generate:types');
}

main().catch((err) => {
	console.error('Setup failed:', err);
	process.exit(1);
});
