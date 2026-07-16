#!/usr/bin/env npx tsx
/**
 * token_purchases — idempotency ledger + audit for AI-token purchases.
 *
 * Mirrors CardDesk's cd_credit_purchases pattern. The UNIQUE stripe_session_id
 * is the exactly-once gate: fulfillTokenPurchase inserts a row before crediting
 * organizations.ai_token_balance, so the webhook and the success-page fast-path
 * (and any webhook retry) can only credit once — the duplicate insert loses on
 * the unique constraint and short-circuits.
 *
 * Idempotent. Run:
 *   pnpm tsx scripts/setup-token-purchases.ts
 * Then regenerate types:
 *   pnpm generate:types
 */
import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!DIRECTUS_TOKEN) {
	console.error('DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN required');
	process.exit(1);
}

const COLLECTION = 'token_purchases';

async function req(path: string, method: 'GET' | 'POST' | 'PATCH' = 'GET', body?: unknown) {
	const r = await fetch(`${DIRECTUS_URL}${path}`, {
		method,
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DIRECTUS_TOKEN}` },
		body: body ? JSON.stringify(body) : undefined,
	});
	return { ok: r.ok, status: r.status, text: await r.text() };
}

async function collectionExists(): Promise<boolean> {
	const { ok } = await req(`/collections/${COLLECTION}`);
	return ok;
}

async function main() {
	console.log(`\n── ${COLLECTION} setup ──\n`);
	console.log(`Directus: ${DIRECTUS_URL}\n`);

	if (await collectionExists()) {
		console.log(`  ✓ ${COLLECTION} already exists — nothing to do`);
		console.log('\n── Done ──\n');
		return;
	}

	const payload = {
		collection: COLLECTION,
		meta: {
			icon: 'toll',
			note: 'Idempotency ledger + audit for AI-token purchases. Unique stripe_session_id enforces exactly-once crediting of organizations.ai_token_balance.',
			hidden: false,
			singleton: false,
		},
		schema: { name: COLLECTION },
		fields: [
			{
				field: 'id',
				type: 'uuid',
				meta: { hidden: true, readonly: true, interface: 'input', special: ['uuid'] },
				schema: { is_primary_key: true, length: 36, has_auto_increment: false },
			},
			{
				field: 'date_created',
				type: 'timestamp',
				meta: {
					special: ['date-created'],
					interface: 'datetime',
					readonly: true,
					hidden: true,
					width: 'half',
					display: 'datetime',
					display_options: { relative: true },
				},
				schema: {},
			},
			{
				field: 'organization',
				type: 'uuid',
				meta: { interface: 'input', note: 'Org credited (organizations.id)', width: 'half' },
				schema: { is_nullable: true },
			},
			{
				field: 'user_id',
				type: 'uuid',
				meta: { interface: 'input', note: 'Buyer (directus_users.id)', width: 'half' },
				schema: { is_nullable: true },
			},
			{
				field: 'stripe_session_id',
				type: 'string',
				meta: { interface: 'input', note: 'Idempotency key — UNIQUE. One row per paid Checkout Session.' },
				schema: { is_unique: true, is_nullable: true },
			},
			{
				field: 'stripe_payment_intent',
				type: 'string',
				meta: { interface: 'input', width: 'half' },
				schema: { is_nullable: true },
			},
			{
				field: 'package_id',
				type: 'string',
				meta: { interface: 'input', width: 'half' },
				schema: { is_nullable: true },
			},
			{
				field: 'tokens',
				type: 'integer',
				meta: { interface: 'input', note: 'Tokens granted', width: 'half' },
				schema: { is_nullable: true },
			},
			{
				field: 'amount_cents',
				type: 'integer',
				meta: { interface: 'input', width: 'half' },
				schema: { is_nullable: true },
			},
			{
				field: 'currency',
				type: 'string',
				meta: { interface: 'input', width: 'half' },
				schema: { is_nullable: true },
			},
			{
				field: 'status',
				type: 'string',
				meta: { interface: 'input', width: 'half' },
				schema: { is_nullable: true },
			},
		],
	};

	const { ok, text } = await req('/collections', 'POST', payload);
	if (!ok) {
		if (/already exists|exists/i.test(text)) {
			console.log(`  ✓ ${COLLECTION} already exists (create raced) — ok`);
		} else {
			console.error(`  ✗ create failed: ${text}`);
			process.exit(1);
		}
	} else {
		console.log(`  + ${COLLECTION} created with unique stripe_session_id`);
	}

	console.log('\n── Done ──\n');
	console.log('Next: pnpm generate:types');
}

main().catch((err) => {
	console.error('Setup failed:', err);
	process.exit(1);
});
