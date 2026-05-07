#!/usr/bin/env npx tsx
/**
 * line_items.quantity — integer → decimal
 *
 * The original column type was integer, which made it impossible to invoice
 * fractional hours from time-tracker entries (e.g. 0.32h). The new
 * `generateInvoiceFromEntries` writes the precise hour total per line item,
 * so we need a numeric column.
 *
 * Patch via Directus field API: change `type` from `integer` to `decimal`
 * and update the schema's numeric_precision/numeric_scale. Existing integer
 * values round-trip cleanly (1 → 1.0).
 *
 * Run: pnpm tsx scripts/migrate-line-items-quantity-decimal.ts
 *
 * Idempotent: re-running is safe (Directus no-ops if type already matches).
 */
import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';

if (!DIRECTUS_TOKEN) {
	console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN is required');
	process.exit(1);
}

async function directusRequest(
	path: string,
	method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
	body?: unknown,
): Promise<{ data: any; error: string | null }> {
	const response = await fetch(`${DIRECTUS_URL}${path}`, {
		method,
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${DIRECTUS_TOKEN}`,
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	const text = await response.text();
	if (!response.ok) {
		return { data: null, error: `${response.status}: ${text}` };
	}
	return { data: text ? JSON.parse(text).data : null, error: null };
}

async function main() {
	console.log('==========================================');
	console.log('  line_items.quantity — integer → decimal');
	console.log('==========================================');
	console.log(`Directus URL: ${DIRECTUS_URL}`);

	// Inspect current schema
	const before = await directusRequest('/fields/line_items/quantity');
	if (before.error) {
		console.error(`Cannot read field: ${before.error}`);
		process.exit(1);
	}
	console.log(`Before: type=${before.data?.type}, precision=${before.data?.schema?.numeric_precision}, scale=${before.data?.schema?.numeric_scale}`);

	if (before.data?.type === 'decimal') {
		console.log('Already decimal. Nothing to do.');
		return;
	}

	// Patch
	const patchRes = await directusRequest('/fields/line_items/quantity', 'PATCH', {
		type: 'decimal',
		schema: {
			numeric_precision: 12,
			numeric_scale: 2,
		},
		meta: {
			interface: 'input',
			options: { step: 0.01 },
		},
	});
	if (patchRes.error) {
		console.error(`Patch failed: ${patchRes.error}`);
		process.exit(1);
	}
	console.log('Patched.');

	const after = await directusRequest('/fields/line_items/quantity');
	console.log(`After:  type=${after.data?.type}, precision=${after.data?.schema?.numeric_precision}, scale=${after.data?.schema?.numeric_scale}`);

	console.log('');
	console.log('Done. Existing integer values are preserved (e.g. 1 → 1.00).');
}

main().catch((err) => {
	console.error('Fatal:', err);
	process.exit(1);
});
