#!/usr/bin/env npx tsx
/**
 * Wholesale-pricing schema delta.
 *
 * Adds one field to `organizations`:
 *   wholesale_pricing — boolean, default false.
 *
 * Granted by an Earnest platform admin (Directus super-admin). When true:
 *   - AI token / CardDesk purchases use the wholesale price table (cost, no margin)
 *   - the org's connected-account invoice payments carry NO platform application fee
 *
 * Fulfillment is unchanged — wholesale changes price only, never the tokens
 * granted or the money that settles to the merchant.
 *
 * Idempotent. Run:
 *   pnpm tsx scripts/setup-wholesale-field.ts
 *
 * After running, regenerate types:
 *   pnpm generate:types
 */
import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!DIRECTUS_TOKEN) {
	console.error('DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN required');
	process.exit(1);
}

async function directusRequest(
	path: string,
	method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
	body?: unknown,
): Promise<{ ok: boolean; status: number; text: string }> {
	const r = await fetch(`${DIRECTUS_URL}${path}`, {
		method,
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DIRECTUS_TOKEN}` },
		body: body ? JSON.stringify(body) : undefined,
	});
	return { ok: r.ok, status: r.status, text: await r.text() };
}

async function fieldExists(collection: string, field: string): Promise<boolean> {
	const { ok } = await directusRequest(`/fields/${collection}/${field}`);
	return ok;
}

async function createField(field: string, config: any): Promise<void> {
	if (await fieldExists('organizations', field)) {
		console.log(`  ✓ organizations.${field} already exists`);
		return;
	}
	const { ok, text } = await directusRequest('/fields/organizations', 'POST', { field, ...config });
	if (!ok) {
		console.error(`  ✗ organizations.${field} failed: ${text}`);
		process.exit(1);
	}
	console.log(`  + organizations.${field} created`);
}

async function main() {
	console.log('\n── organizations Wholesale-Pricing Setup ──\n');
	console.log(`Directus: ${DIRECTUS_URL}\n`);

	await createField('wholesale_pricing', {
		type: 'boolean',
		meta: {
			interface: 'boolean',
			display: 'boolean',
			note: 'Earnest-admin grant. When on: wholesale token/credit pricing + zero platform fee on this org’s invoice payments. Fulfillment unchanged.',
			width: 'half',
			options: { label: 'Wholesale pricing enabled' },
		},
		schema: { is_nullable: false, default_value: false },
	});

	console.log('\n── Done ──\n');
	console.log('Next steps:');
	console.log('  1. Regenerate types: pnpm generate:types');
	console.log('  2. Grant to Hue via PATCH /api/admin/organizations/:id/wholesale (platform admin only).');
}

main().catch((err) => {
	console.error('Setup failed:', err);
	process.exit(1);
});
