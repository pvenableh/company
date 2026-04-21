#!/usr/bin/env npx tsx
/**
 * Directus leads.is_junk field — Setup Script
 *
 * Adds a boolean `is_junk` field to the `leads` collection so that "junk"
 * (spam / unqualified) becomes a disposition orthogonal to the lifecycle
 * `status` enum (published/draft/archived). Previously `junkLead()` wrote
 * `status='junk'` which wasn't in the TS type.
 *
 * Run once:
 *
 *   pnpm tsx scripts/setup-lead-is-junk-field.ts
 *
 * Then regenerate types:
 *
 *   pnpm generate:types
 *
 * Prerequisites:
 *   - Directus instance running with `leads` collection in schema
 *   - DIRECTUS_SERVER_TOKEN env var set (admin-level)
 *
 * Idempotent: re-running is safe, field create skips on 409 / already-exists.
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

async function setupIsJunkField() {
	console.log('\n=== leads.is_junk ===');

	await createField('leads', {
		field: 'is_junk',
		type: 'boolean',
		meta: {
			interface: 'boolean',
			special: ['cast-boolean'],
			note: 'Disposition flag for spam / unqualified leads. Orthogonal to status lifecycle.',
			options: { label: 'Junk' },
			width: 'half',
		},
		schema: {
			default_value: false,
			is_nullable: false,
		},
	});
}

async function main() {
	console.log('==========================================');
	console.log('  leads.is_junk — Field Setup');
	console.log('==========================================');
	console.log(`Directus URL: ${DIRECTUS_URL}`);
	console.log('');

	await setupIsJunkField();

	console.log('');
	console.log('==========================================');
	console.log('  Done');
	console.log('==========================================');
	console.log('Next: pnpm generate:types');
}

main().catch((err) => {
	console.error('Fatal:', err);
	process.exit(1);
});
