#!/usr/bin/env npx tsx
/**
 * Directus — marketing_touches.mailing_list FK.
 *
 * Adds an optional m2o from marketing_touches to mailing_lists so the
 * Composition Canvas's email composer can target a specific list. Until
 * this lands, canvas-created one-off emails resolve audience via the
 * parent campaign's `audience_snapshot` — which is null for one-off
 * campaigns, so recipients always come back empty and the send is
 * SKIPPED. The mailing-list FK is the first audience source that
 * actually unblocks canvas email sends end-to-end.
 *
 * Shape:
 *   marketing_touches.mailing_list    m2o → mailing_lists (integer PK), nullable, SET NULL
 *
 * Mutex at the application layer: a touch is targeted via EITHER
 * mailing_list OR audience_filter, never both. The DB allows both to be
 * set (no constraint) — the canvas composer + send path enforce the XOR.
 *
 * Idempotent — re-running is safe.
 *
 * Usage:
 *   pnpm tsx scripts/setup-touch-mailing-list-fk.ts
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

async function ensureMailingListField(): Promise<'created' | 'skipped' | 'failed'> {
	if (await fieldExists('marketing_touches', 'mailing_list')) {
		console.log('  [skip] field marketing_touches.mailing_list already exists');
		return 'skipped';
	}
	const res = await directusRequest('/fields/marketing_touches', 'POST', {
		field: 'mailing_list',
		type: 'integer',
		meta: {
			interface: 'select-dropdown-m2o',
			special: ['m2o'],
			options: { template: '{{name}}' },
			note: 'Mailing list this touch targets. When set, the send path resolves recipients from mailing_list_contacts (bypasses campaign.audience_snapshot). XOR with audience_filter at the app layer.',
			width: 'half',
		},
		schema: { is_nullable: true },
	});
	if (!res.ok) {
		console.error(`  [fail] field marketing_touches.mailing_list: ${res.error}`);
		return 'failed';
	}
	console.log('  [ok]   field marketing_touches.mailing_list created');
	return 'created';
}

async function ensureMailingListRelation(): Promise<'created' | 'skipped' | 'failed'> {
	if (await relationExists('marketing_touches', 'mailing_list')) {
		console.log('  [skip] relation marketing_touches.mailing_list → mailing_lists already exists');
		return 'skipped';
	}
	const res = await directusRequest('/relations', 'POST', {
		collection: 'marketing_touches',
		field: 'mailing_list',
		related_collection: 'mailing_lists',
		meta: { sort_field: null },
		schema: { on_delete: 'SET NULL' },
	});
	if (!res.ok) {
		console.error(`  [fail] relation marketing_touches.mailing_list → mailing_lists: ${res.error}`);
		return 'failed';
	}
	console.log('  [ok]   relation marketing_touches.mailing_list → mailing_lists created');
	return 'created';
}

async function main() {
	console.log('=========================================');
	console.log('  marketing_touches → mailing_lists FK');
	console.log('=========================================');
	console.log(`Target: ${DIRECTUS_URL}\n`);

	const ping = await directusRequest('/server/info');
	if (!ping.ok) {
		console.error(`Cannot connect to Directus: ${ping.error}`);
		process.exit(1);
	}
	console.log('Connected to Directus\n');

	console.log('--- marketing_touches.mailing_list ---');
	const field = await ensureMailingListField();
	const rel = await ensureMailingListRelation();

	console.log('\n=========================================');
	console.log('  Summary');
	console.log('=========================================');
	console.log(`  marketing_touches.mailing_list field:    ${field}`);
	console.log(`  marketing_touches.mailing_list relation: ${rel}`);

	const anyFailed = [field, rel].includes('failed');
	if (anyFailed) {
		process.exit(1);
	}

	console.log('');
	console.log('Done. The marketing_touches policy uses fields=["*"]');
	console.log('so the new column is covered automatically.');
	console.log('');
	console.log('Next: pnpm generate:types');
}

main().catch((err) => {
	console.error('Setup failed:', err);
	process.exit(1);
});
