#!/usr/bin/env npx tsx
/**
 * platform_reversals — audit ledger for PLATFORM-account refunds & disputes.
 *
 * When Earnest's own platform charges (AI token purchases + subscription
 * charges) are refunded or lost to a chargeback, we book one row here. It is
 * BOTH:
 *   - the idempotency ledger (a retried/cumulative Stripe event only books the
 *     delta not already recorded for the payment_intent), and
 *   - the audit trail + data source for the /platform refunds/disputes view.
 *
 * Row semantics:
 *   type                 token_refund | token_dispute | subscription_refund | subscription_dispute
 *   organization         org whose entitlement was affected (nullable)
 *   stripe_payment_intent the charge's PI — the join key for cumulative idempotency
 *   stripe_dispute_id    set for dispute rows — the per-dispute idempotency guard
 *   amount_cents         money reversed by THIS row (the delta), always > 0
 *   tokens_clawed_back   tokens removed from the org balance (token_* rows)
 *
 * Idempotent. Run:  pnpm tsx scripts/setup-platform-reversals.ts
 * Then:             pnpm generate:types
 */
import 'dotenv/config';

const DIRECTUS_URL = (process.env.DIRECTUS_URL || 'http://localhost:8055').replace(/\/$/, '');
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!TOKEN) {
	console.error('DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN required');
	process.exit(1);
}

const COLLECTION = 'platform_reversals';

async function req(path: string, method: 'GET' | 'POST' | 'PATCH' = 'GET', body?: unknown) {
	const r = await fetch(`${DIRECTUS_URL}${path}`, {
		method,
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
		body: body ? JSON.stringify(body) : undefined,
	});
	return { ok: r.ok, status: r.status, text: await r.text() };
}

async function main() {
	console.log(`\n── ${COLLECTION} setup ──\n`);
	console.log(`Directus: ${DIRECTUS_URL}\n`);

	const { ok: exists } = await req(`/collections/${COLLECTION}`);
	if (exists) {
		console.log(`  ✓ ${COLLECTION} already exists — nothing to do`);
		console.log('\n── Done ──\n');
		return;
	}

	const payload = {
		collection: COLLECTION,
		meta: {
			icon: 'currency_exchange',
			note: 'Audit + idempotency ledger for platform-account refunds/disputes (token + subscription).',
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
				field: 'type',
				type: 'string',
				meta: {
					interface: 'select-dropdown',
					note: 'token_refund | token_dispute | subscription_refund | subscription_dispute',
					options: {
						choices: [
							{ text: 'Token refund', value: 'token_refund' },
							{ text: 'Token dispute', value: 'token_dispute' },
							{ text: 'Subscription refund', value: 'subscription_refund' },
							{ text: 'Subscription dispute', value: 'subscription_dispute' },
						],
					},
					width: 'half',
				},
				schema: { is_nullable: true },
			},
			{
				field: 'organization',
				type: 'uuid',
				meta: { interface: 'input', note: 'Org affected (organizations.id)', width: 'half' },
				schema: { is_nullable: true },
			},
			{
				field: 'stripe_charge_id',
				type: 'string',
				meta: { interface: 'input', width: 'half' },
				schema: { is_nullable: true },
			},
			{
				field: 'stripe_payment_intent',
				type: 'string',
				meta: { interface: 'input', note: 'Join key for cumulative idempotency', width: 'half' },
				schema: { is_nullable: true },
			},
			{
				field: 'stripe_dispute_id',
				type: 'string',
				meta: { interface: 'input', note: 'Per-dispute idempotency guard (dispute rows only)', width: 'half' },
				schema: { is_nullable: true },
			},
			{
				field: 'amount_cents',
				type: 'integer',
				meta: { interface: 'input', note: 'Money reversed by THIS row (delta), cents', width: 'half' },
				schema: { is_nullable: true },
			},
			{
				field: 'tokens_clawed_back',
				type: 'integer',
				meta: { interface: 'input', note: 'Tokens removed from org balance (token rows)', width: 'half' },
				schema: { is_nullable: true },
			},
			{
				field: 'reason',
				type: 'string',
				meta: { interface: 'input', width: 'half' },
				schema: { is_nullable: true },
			},
			{
				field: 'livemode',
				type: 'boolean',
				meta: { interface: 'boolean', width: 'half' },
				schema: { default_value: false, is_nullable: true },
			},
			{
				field: 'note',
				type: 'text',
				meta: { interface: 'input-multiline' },
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
		console.log(`  + ${COLLECTION} created`);
	}

	console.log('\n── Done ──\n');
	console.log('Next: pnpm generate:types');
}

main().catch((err) => {
	console.error('Setup failed:', err);
	process.exit(1);
});
