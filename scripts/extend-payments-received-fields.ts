#!/usr/bin/env npx tsx
/**
 * Directus payments_received — Extend Fields for Manual Reconciliation
 *
 * Adds 4 columns so admins can record check / Zelle / Venmo / cash
 * payments by hand alongside the existing Stripe-driven rows:
 *   - reference        check #, Zelle confirmation, Venmo handle
 *   - note             free-text note
 *   - check_image      M2O to directus_files (per-payment, separate from
 *                      the legacy invoices.check_image)
 *   - deposit_date     date the check was deposited (for the
 *                      "checks awaiting deposit" workflow later)
 *
 * Run:
 *   pnpm tsx scripts/extend-payments-received-fields.ts
 *
 * Idempotent: re-running is safe.
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
			if (response.status === 400 && /already exists|already has an associated/i.test(text)) {
				return { data: null, error: 'already_exists' };
			}
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

async function createRelation(data: Record<string, any>) {
	console.log(`  Creating relation: ${data.collection}.${data.field} -> ${data.related_collection}`);
	const { error } = await directusRequest('/relations', 'POST', data);
	if (error === 'already_exists') {
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

async function ensureCollectionExists(collection: string) {
	const { data, error } = await directusRequest(`/collections/${collection}`);
	if (error) {
		console.error(`\nPrerequisite missing: collection "${collection}" does not exist (${error}).`);
		process.exit(1);
	}
	if (!data) {
		console.error(`\nPrerequisite missing: collection "${collection}" returned no data.`);
		process.exit(1);
	}
}

async function extendPaymentsReceived() {
	console.log('\n=== payments_received — extend ===');

	await createField('payments_received', {
		field: 'reference',
		type: 'string',
		meta: {
			interface: 'input',
			width: 'half',
			note: 'Check #, Zelle confirmation, Venmo handle, etc.',
		},
		schema: {},
	});

	await createField('payments_received', {
		field: 'note',
		type: 'text',
		meta: {
			interface: 'input-multiline',
			note: 'Optional free-text note about this payment.',
		},
		schema: {},
	});

	await createField('payments_received', {
		field: 'check_image',
		type: 'uuid',
		meta: {
			interface: 'file-image',
			special: ['file'],
			width: 'half',
			note: 'Photo of the check or screenshot of the Zelle/Venmo confirmation.',
		},
		schema: {},
	});

	await createField('payments_received', {
		field: 'deposit_date',
		type: 'date',
		meta: {
			interface: 'datetime',
			width: 'half',
			note: 'Date the check was deposited (for the "checks awaiting deposit" workflow).',
		},
		schema: {},
	});

	await createRelation({
		collection: 'payments_received',
		field: 'check_image',
		related_collection: 'directus_files',
		schema: { on_delete: 'SET NULL' },
		meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
	});
}

async function main() {
	console.log('==========================================');
	console.log('  payments_received — Extend Fields');
	console.log('==========================================');
	console.log(`Directus URL: ${DIRECTUS_URL}`);

	const { error } = await directusRequest('/server/info');
	if (error) {
		console.error(`\nCannot connect to Directus: ${error}`);
		process.exit(1);
	}
	console.log('Connected');

	await ensureCollectionExists('payments_received');

	await extendPaymentsReceived();

	console.log('');
	console.log('==========================================');
	console.log('  Done');
	console.log('==========================================');
	console.log('Verify in Directus admin → payments_received → 4 new fields:');
	console.log('  - reference (string)');
	console.log('  - note (text)');
	console.log('  - check_image (M2O to directus_files)');
	console.log('  - deposit_date (date)');
}

main().catch((err) => {
	console.error('Fatal:', err);
	process.exit(1);
});
