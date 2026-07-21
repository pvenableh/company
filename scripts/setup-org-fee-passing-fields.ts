#!/usr/bin/env npx tsx
/**
 * organizations.pass_card_fee + organizations.pass_ach_fee — per-org control
 * over whether Stripe's processing fee is passed to the PAYER or absorbed by
 * the org on invoice payments.
 *
 * Why per-org: card surcharging is regulated (some US states cap/prohibit it +
 * require disclosure), so each org needs to set its own policy. Mirrors the
 * `wholesale_pricing` per-org billing flag — set in Directus for now, a billing
 * settings toggle comes later.
 *
 * Defaults preserve today's behavior exactly (so nothing changes until an org
 * opts in): card fee IS passed (true), ACH fee is NOT (false → bank stays free
 * to the payer). Read client-side by app/components/Payment/Methods.vue.
 *
 * Additive + idempotent. Run:  pnpm tsx scripts/setup-org-fee-passing-fields.ts
 * Then:                         pnpm generate:types
 */
import 'dotenv/config';

const DIRECTUS_URL = (process.env.DIRECTUS_URL || 'http://localhost:8055').replace(/\/$/, '');
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!TOKEN) {
	console.error('DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN required');
	process.exit(1);
}

const COLLECTION = 'organizations';

async function req(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown) {
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
	console.log(`\n── ${COLLECTION} fee-passing fields ──\n`);
	console.log(`Directus: ${DIRECTUS_URL}\n`);

	await addField('pass_card_fee', {
		field: 'pass_card_fee',
		type: 'boolean',
		meta: {
			interface: 'boolean',
			note: "Add the card processing fee (2.9% + $0.30) to the payer's total. Off = the org absorbs it.",
			width: 'half',
			options: { label: 'Pass card fee to payer' },
		},
		schema: { default_value: true, is_nullable: true },
	});

	await addField('pass_ach_fee', {
		field: 'pass_ach_fee',
		type: 'boolean',
		meta: {
			interface: 'boolean',
			note: "Add the ACH fee (0.8%, max $5) to the payer's total. Off = the org absorbs it (bank shows 'no fees').",
			width: 'half',
			options: { label: 'Pass ACH fee to payer' },
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
