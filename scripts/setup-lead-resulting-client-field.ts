#!/usr/bin/env npx tsx
/**
 * Directus — leads.resulting_client
 *
 * Adds a nullable M2O from `leads` to `clients` capturing which Client a
 * won lead converted into. Used for partner-ROI attribution on
 * /contacts/[id] ("Leads Sourced" card) and in the AI context-broker
 * ([Source: Sourced Attribution]).
 *
 * Why an explicit FK instead of inferring via Lead.related_contact.client?
 * Contact re-linking degrades inference — if the sourcing contact is later
 * pointed at a different client, historical attribution is lost. An explicit
 * FK survives contact re-linking.
 *
 * Also: best-effort backfill for already-won leads. For each lead where
 * stage='won' and resulting_client is null, infers from
 * Lead.related_contact.client (the memo's Path A fallback) — reasonable
 * while the system has only test data.
 *
 * Idempotent: checks for existing field/relation before creating.
 *
 * Usage:
 *   pnpm tsx scripts/setup-lead-resulting-client-field.ts
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
	const json = text ? JSON.parse(text) : {};
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
	// /relations ignores filter params, so check the exact relation endpoint instead.
	const res = await directusRequest(`/relations/${collection}/${field}`);
	return res.ok;
}

async function ensureField(): Promise<'created' | 'skipped' | 'failed'> {
	if (await fieldExists('leads', 'resulting_client')) {
		console.log('  [skip] field leads.resulting_client already exists');
		return 'skipped';
	}

	const res = await directusRequest('/fields/leads', 'POST', {
		field: 'resulting_client',
		type: 'uuid',
		meta: {
			interface: 'select-dropdown-m2o',
			special: ['m2o'],
			options: { template: '{{name}}' },
			note: 'Client this lead converted into (set on conversion). Used for partner-ROI attribution.',
			width: 'half',
			sort: 30,
		},
		schema: { is_nullable: true },
	});

	if (!res.ok) {
		console.error(`  [fail] field leads.resulting_client: ${res.error}`);
		return 'failed';
	}
	console.log('  [ok]   field leads.resulting_client created');
	return 'created';
}

async function ensureRelation(): Promise<'created' | 'skipped' | 'failed'> {
	if (await relationExists('leads', 'resulting_client')) {
		console.log('  [skip] relation leads.resulting_client -> clients already exists');
		return 'skipped';
	}

	const res = await directusRequest('/relations', 'POST', {
		collection: 'leads',
		field: 'resulting_client',
		related_collection: 'clients',
		meta: { sort_field: null },
		schema: { on_delete: 'SET NULL' },
	});

	if (!res.ok) {
		console.error(`  [fail] relation leads.resulting_client -> clients: ${res.error}`);
		return 'failed';
	}
	console.log('  [ok]   relation leads.resulting_client -> clients created');
	return 'created';
}

async function backfillWonLeads(): Promise<{ updated: number; skipped: number; failed: number }> {
	const stats = { updated: 0, skipped: 0, failed: 0 };

	const list = await directusRequest<any[]>(
		`/items/leads?filter[stage][_eq]=won&filter[resulting_client][_null]=true&fields=id,related_contact.id,related_contact.client.id,related_contact.client.name&limit=500`,
	);
	if (!list.ok || !Array.isArray(list.data)) {
		console.error(`  [fail] list won leads: ${list.error}`);
		stats.failed++;
		return stats;
	}
	if (list.data.length === 0) {
		console.log('  [skip] no won leads missing resulting_client');
		return stats;
	}

	console.log(`  Found ${list.data.length} won leads missing resulting_client`);

	for (const lead of list.data) {
		const clientId = lead?.related_contact?.client?.id;
		const clientName = lead?.related_contact?.client?.name;
		if (!clientId) {
			console.log(`  [skip] lead #${lead.id}: related_contact has no client — manual assignment needed`);
			stats.skipped++;
			continue;
		}
		const patch = await directusRequest(`/items/leads/${lead.id}`, 'PATCH', { resulting_client: clientId });
		if (!patch.ok) {
			console.error(`  [fail] lead #${lead.id}: ${patch.error}`);
			stats.failed++;
			continue;
		}
		console.log(`  [ok]   lead #${lead.id} -> client "${clientName}" (${clientId})`);
		stats.updated++;
	}

	return stats;
}

async function main() {
	console.log('=========================================');
	console.log('  leads.resulting_client field + relation');
	console.log('=========================================');
	console.log(`Target: ${DIRECTUS_URL}\n`);

	const ping = await directusRequest('/server/info');
	if (!ping.ok) {
		console.error(`Cannot connect to Directus: ${ping.error}`);
		process.exit(1);
	}
	console.log('Connected to Directus\n');

	console.log('--- leads.resulting_client ---');
	const fieldResult = await ensureField();
	const relResult = await ensureRelation();

	console.log('\n--- backfill won leads ---');
	const backfill = await backfillWonLeads();

	console.log('\n=========================================');
	console.log('  Summary');
	console.log('=========================================');
	console.log(`  Field:    ${fieldResult}`);
	console.log(`  Relation: ${relResult}`);
	console.log(`  Backfill: ${backfill.updated} updated · ${backfill.skipped} skipped · ${backfill.failed} failed`);

	if (fieldResult === 'failed' || relResult === 'failed' || backfill.failed > 0) {
		process.exit(1);
	}

	console.log('');
	console.log('Done. Existing leads policies use fields=["*"] so the new');
	console.log('field is covered automatically — no permission changes needed.');
}

main().catch((err) => {
	console.error('Setup failed:', err);
	process.exit(1);
});
