#!/usr/bin/env npx tsx
/**
 * Directus — Card Desk promote bridge.
 *
 * Adds the two columns that turn a Card Desk "card" into an Earnest CRM
 * contact. Designed to be idempotent — re-running is safe.
 *
 *   cd_contacts.promoted_contact    m2o → contacts (nullable, SET NULL)
 *   contacts.source                 string (nullable: 'carddesk' | 'manual'
 *                                   | 'import' | 'email')
 *
 * The FK survives delete-of-contact (SET NULL on delete) so a cd_contact
 * cleanly reverts to "unpromoted" if its Earnest counterpart is deleted.
 *
 * No perm changes needed: existing cd_contacts and contacts policies use
 * fields=['*'], so the new columns are covered automatically.
 *
 * Usage:
 *   pnpm tsx scripts/setup-carddesk-promote-fk.ts
 *
 * Then:
 *   pnpm generate:types
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
): Promise<{ ok: boolean; status: number; data: T | null; error: string | null }> {
	const response = await fetch(`${DIRECTUS_URL}${path}`, {
		method,
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${DIRECTUS_TOKEN}`,
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	const text = await response.text();
	let json: any = {};
	try { json = text ? JSON.parse(text) : {}; } catch { /* non-JSON error body */ }
	return {
		ok: response.ok,
		status: response.status,
		data: response.ok ? ((json.data ?? null) as T) : null,
		error: response.ok ? null : text,
	};
}

async function fieldExists(collection: string, field: string): Promise<boolean> {
	const res = await directusRequest(`/fields/${collection}/${field}`);
	return res.ok;
}

async function relationExists(collection: string, field: string): Promise<boolean> {
	const res = await directusRequest(`/relations/${collection}/${field}`);
	return res.ok;
}

async function ensurePromotedContactField(): Promise<'created' | 'skipped' | 'failed'> {
	if (await fieldExists('cd_contacts', 'promoted_contact')) {
		console.log('  [skip] field cd_contacts.promoted_contact already exists');
		return 'skipped';
	}
	const res = await directusRequest('/fields/cd_contacts', 'POST', {
		field: 'promoted_contact',
		type: 'uuid',
		meta: {
			interface: 'select-dropdown-m2o',
			special: ['m2o'],
			options: { template: '{{first_name}} {{last_name}}' },
			note: 'Earnest CRM contact this Card Desk card was promoted into. Null = unpromoted.',
			width: 'half',
		},
		schema: { is_nullable: true },
	});
	if (!res.ok) {
		console.error(`  [fail] field cd_contacts.promoted_contact: ${res.error}`);
		return 'failed';
	}
	console.log('  [ok]   field cd_contacts.promoted_contact created');
	return 'created';
}

async function ensurePromotedContactRelation(): Promise<'created' | 'skipped' | 'failed'> {
	if (await relationExists('cd_contacts', 'promoted_contact')) {
		console.log('  [skip] relation cd_contacts.promoted_contact → contacts already exists');
		return 'skipped';
	}
	const res = await directusRequest('/relations', 'POST', {
		collection: 'cd_contacts',
		field: 'promoted_contact',
		related_collection: 'contacts',
		meta: { sort_field: null },
		schema: { on_delete: 'SET NULL' },
	});
	if (!res.ok) {
		console.error(`  [fail] relation cd_contacts.promoted_contact → contacts: ${res.error}`);
		return 'failed';
	}
	console.log('  [ok]   relation cd_contacts.promoted_contact → contacts created');
	return 'created';
}

async function ensureContactSourceField(): Promise<'created' | 'skipped' | 'failed'> {
	if (await fieldExists('contacts', 'source')) {
		console.log('  [skip] field contacts.source already exists');
		return 'skipped';
	}
	const res = await directusRequest('/fields/contacts', 'POST', {
		field: 'source',
		type: 'string',
		meta: {
			interface: 'select-dropdown',
			display: 'labels',
			options: {
				choices: [
					{ text: 'Card Desk', value: 'carddesk' },
					{ text: 'Manual', value: 'manual' },
					{ text: 'CSV Import', value: 'import' },
					{ text: 'Email', value: 'email' },
				],
				allowOther: true,
			},
			note: 'Which surface created this contact. Drives provenance chips on /contacts/[id].',
			width: 'half',
		},
		schema: { is_nullable: true },
	});
	if (!res.ok) {
		console.error(`  [fail] field contacts.source: ${res.error}`);
		return 'failed';
	}
	console.log('  [ok]   field contacts.source created');
	return 'created';
}

async function main() {
	console.log('=========================================');
	console.log('  Card Desk → Earnest promote bridge');
	console.log('=========================================');
	console.log(`Target: ${DIRECTUS_URL}\n`);

	const ping = await directusRequest('/server/info');
	if (!ping.ok) {
		console.error(`Cannot connect to Directus: ${ping.error}`);
		process.exit(1);
	}
	console.log('Connected to Directus\n');

	console.log('--- cd_contacts.promoted_contact ---');
	const fieldRes = await ensurePromotedContactField();
	const relRes = await ensurePromotedContactRelation();

	console.log('\n--- contacts.source ---');
	const sourceRes = await ensureContactSourceField();

	console.log('\n=========================================');
	console.log('  Summary');
	console.log('=========================================');
	console.log(`  cd_contacts.promoted_contact field:    ${fieldRes}`);
	console.log(`  cd_contacts.promoted_contact relation: ${relRes}`);
	console.log(`  contacts.source field:                 ${sourceRes}`);

	if (fieldRes === 'failed' || relRes === 'failed' || sourceRes === 'failed') {
		process.exit(1);
	}

	console.log('');
	console.log('Done. Existing cd_contacts and contacts policies use fields=["*"]');
	console.log('so the new columns are covered automatically.');
	console.log('');
	console.log('Next: pnpm generate:types');
}

main().catch((err) => {
	console.error('Setup failed:', err);
	process.exit(1);
});
