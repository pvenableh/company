#!/usr/bin/env npx tsx
/**
 * Directus organizations.mailing_address — Setup Script
 *
 * Adds the physical-address field required by CAN-SPAM for marketing
 * emails. Rendered in the marketing footer (campaign touches, newsletters)
 * underneath the unsubscribe link.
 *
 * Transactional sends never render this — it's marketing-only.
 *
 * Run once:
 *   pnpm tsx scripts/setup-organizations-mailing-address-field.ts
 * Then:
 *   pnpm generate:types
 *
 * Idempotent: field create skips on 409 / already-exists.
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
	console.log('==========================================');
	console.log('  organizations.mailing_address — Field Setup');
	console.log('==========================================');
	console.log(`Directus URL: ${DIRECTUS_URL}`);

	await createField('organizations', {
		field: 'mailing_address',
		type: 'text',
		meta: {
			interface: 'input-multiline',
			display: 'raw',
			note: 'Physical mailing address rendered in the marketing-email footer (CAN-SPAM requirement). Transactional emails never show it. Free-form text — line breaks preserved.',
			options: { placeholder: '123 Main St, Suite 100\nCity, ST 12345' },
			width: 'full',
		},
		schema: { is_nullable: true },
	});

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
