#!/usr/bin/env npx tsx
/**
 * Phase 1 — Stripe Connect Express schema delta.
 *
 * Adds three fields to `organizations` so each org can hold its own
 * connected Stripe account for invoice payments. Hue's platform Stripe
 * (subscriptions, add-ons, token packs) keeps using `stripe_customer_id`;
 * these new fields belong to the org's *own* merchant account.
 *
 *   stripe_account_id      — Stripe Express account id (acct_…)
 *   stripe_account_status  — none | pending | active | restricted
 *   stripe_account_country — ISO-2 country code, default US
 *
 * Idempotent. Run:
 *   pnpm tsx scripts/setup-stripe-connect-fields.ts
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
	console.log('\n── organizations Stripe Connect Setup ──\n');
	console.log(`Directus: ${DIRECTUS_URL}\n`);

	await createField('stripe_account_id', {
		type: 'string',
		meta: {
			interface: 'input',
			note: 'Stripe Express connected-account id (acct_…). Each org has their own; invoice payments route through this account.',
			width: 'half',
			readonly: true,
		},
		schema: { is_nullable: true, default_value: null },
	});

	await createField('stripe_account_status', {
		type: 'string',
		meta: {
			interface: 'select-dropdown',
			display: 'labels',
			note: 'Snapshot of the connected account state. Updated by the Connect webhook on `account.updated`.',
			width: 'half',
			options: {
				choices: [
					{ text: 'None', value: 'none' },
					{ text: 'Pending', value: 'pending' },
					{ text: 'Active', value: 'active' },
					{ text: 'Restricted', value: 'restricted' },
				],
			},
			display_options: {
				choices: [
					{ text: 'None', value: 'none', foreground: '#fff', background: '#9ca3af' },
					{ text: 'Pending', value: 'pending', foreground: '#fff', background: '#f59e0b' },
					{ text: 'Active', value: 'active', foreground: '#fff', background: '#10b981' },
					{ text: 'Restricted', value: 'restricted', foreground: '#fff', background: '#ef4444' },
				],
			},
		},
		schema: { is_nullable: false, default_value: 'none' },
	});

	await createField('stripe_account_country', {
		type: 'string',
		meta: {
			interface: 'input',
			note: 'ISO-2 country code used at account creation. Express onboarding is currently US-only.',
			width: 'half',
		},
		schema: { is_nullable: false, default_value: 'US' },
	});

	console.log('\n── Done ──\n');
	console.log('Next steps:');
	console.log('  1. Regenerate types: pnpm generate:types');
	console.log('  2. Phase 1 routes live under server/api/stripe/connect/.');
}

main().catch((err) => {
	console.error('Setup failed:', err);
	process.exit(1);
});
