#!/usr/bin/env npx tsx
/**
 * Stage 5 of the "Me" lens plan — paid bookings.
 *
 * Adds `appointments.payment_session_id` (Stripe Checkout Session id). Used as
 * the idempotency anchor when a paid booking resolves: both the success-URL
 * handler and the connect webhook look up the appointment by this id before
 * (re-)running finalizeBooking().
 *
 * Run:
 *   pnpm tsx scripts/setup-booking-payment.ts
 *
 * Idempotent — re-running is safe.
 */

import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';

if (!DIRECTUS_TOKEN) {
	console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN environment variable is required');
	process.exit(1);
}

async function directusRequest<T = unknown>(
	path: string,
	method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
	body?: unknown,
): Promise<{ data: T | null; error: string | null }> {
	try {
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
			if (response.status === 409) return { data: null, error: 'already_exists' };
			if (response.status === 400 && /already exists/i.test(text)) return { data: null, error: 'already_exists' };
			return { data: null, error: `${response.status}: ${text}` };
		}
		const json = text ? JSON.parse(text) : {};
		return { data: json.data ?? null, error: null };
	} catch (err: any) {
		return { data: null, error: err.message };
	}
}

async function createField(collection: string, field: Record<string, any>) {
	console.log(`  Creating field: ${collection}.${field.field}`);
	const { error } = await directusRequest(`/fields/${collection}`, 'POST', field);
	if (error === 'already_exists' || error?.includes('already exists')) {
		console.log(`    -> Already exists, skipping`);
		return true;
	}
	if (error) {
		console.error(`    -> Error: ${error}`);
		return false;
	}
	console.log(`    -> Created`);
	return true;
}

async function main() {
	console.log('\n=== appointments.payment_session_id ===');

	await createField('appointments', {
		field: 'payment_session_id',
		type: 'string',
		meta: {
			interface: 'input',
			width: 'half',
			note: 'Stripe Checkout Session id for paid bookings (Stage 5). Idempotency key for success URL + webhook.',
			readonly: true,
		},
		schema: { is_nullable: true, is_unique: false },
	});

	console.log('\n✓ Done.');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
