#!/usr/bin/env npx tsx
/**
 * Directus — proposals/contracts → projects bridge.
 *
 * Adds the FKs that let the Documents tab on ProjectWorkspace scope
 * proposals + contracts to a specific project (instead of the
 * lead.resulting_client / contact.client walks the Client + Lead tabs
 * use). Mirror of `setup-carddesk-promote-fk.ts`.
 *
 *   proposals.project    m2o → projects (nullable, SET NULL)
 *   contracts.project    m2o → projects (nullable, SET NULL)
 *
 * Idempotent — re-running is safe. Both fields stay nullable so legacy
 * proposals/contracts (lead- or client-scoped only) continue to work.
 * No perm changes needed: both collections' policies grant `fields=['*']`
 * so the new columns are covered automatically.
 *
 * Usage:
 *   pnpm tsx scripts/setup-doc-project-fk.ts
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

async function ensureProjectField(collection: 'proposals' | 'contracts'): Promise<'created' | 'skipped' | 'failed'> {
	if (await fieldExists(collection, 'project')) {
		console.log(`  [skip] field ${collection}.project already exists`);
		return 'skipped';
	}
	const res = await directusRequest(`/fields/${collection}`, 'POST', {
		field: 'project',
		type: 'uuid',
		meta: {
			interface: 'select-dropdown-m2o',
			special: ['m2o'],
			options: { template: '{{title}}' },
			note: `Project this ${collection.slice(0, -1)} is attached to. Null when not yet linked to a project.`,
			width: 'half',
		},
		schema: { is_nullable: true },
	});
	if (!res.ok) {
		console.error(`  [fail] field ${collection}.project: ${res.error}`);
		return 'failed';
	}
	console.log(`  [ok]   field ${collection}.project created`);
	return 'created';
}

async function ensureProjectRelation(collection: 'proposals' | 'contracts'): Promise<'created' | 'skipped' | 'failed'> {
	if (await relationExists(collection, 'project')) {
		console.log(`  [skip] relation ${collection}.project → projects already exists`);
		return 'skipped';
	}
	const res = await directusRequest('/relations', 'POST', {
		collection,
		field: 'project',
		related_collection: 'projects',
		meta: { sort_field: null },
		schema: { on_delete: 'SET NULL' },
	});
	if (!res.ok) {
		console.error(`  [fail] relation ${collection}.project → projects: ${res.error}`);
		return 'failed';
	}
	console.log(`  [ok]   relation ${collection}.project → projects created`);
	return 'created';
}

async function main() {
	console.log('=========================================');
	console.log('  Proposals/Contracts → Project bridge');
	console.log('=========================================');
	console.log(`Target: ${DIRECTUS_URL}\n`);

	const ping = await directusRequest('/server/info');
	if (!ping.ok) {
		console.error(`Cannot connect to Directus: ${ping.error}`);
		process.exit(1);
	}
	console.log('Connected to Directus\n');

	console.log('--- proposals.project ---');
	const proposalsField = await ensureProjectField('proposals');
	const proposalsRel = await ensureProjectRelation('proposals');

	console.log('\n--- contracts.project ---');
	const contractsField = await ensureProjectField('contracts');
	const contractsRel = await ensureProjectRelation('contracts');

	console.log('\n=========================================');
	console.log('  Summary');
	console.log('=========================================');
	console.log(`  proposals.project field:    ${proposalsField}`);
	console.log(`  proposals.project relation: ${proposalsRel}`);
	console.log(`  contracts.project field:    ${contractsField}`);
	console.log(`  contracts.project relation: ${contractsRel}`);

	const anyFailed = [proposalsField, proposalsRel, contractsField, contractsRel].includes('failed');
	if (anyFailed) {
		process.exit(1);
	}

	console.log('');
	console.log('Done. Existing proposals + contracts policies use fields=["*"]');
	console.log('so the new columns are covered automatically.');
	console.log('');
	console.log('Next: pnpm generate:types');
}

main().catch((err) => {
	console.error('Setup failed:', err);
	process.exit(1);
});
