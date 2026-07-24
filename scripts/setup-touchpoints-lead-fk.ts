#!/usr/bin/env npx tsx
/**
 * Touchpoints unification — absorb lead_activities into the general touchpoints
 * collection so a "touch" is one record whether it's about a lead, contact, or
 * client (and carries forward on lead conversion).
 *
 * Adds to `touchpoints`:
 *   lead              m2o  → leads (nullable, SET NULL)   — the missing link
 *   outcome           str  (select)                        — from lead_activities.outcome
 *   next_action       text                                 — planned follow-up
 *   next_action_date  timestamp                            — when to do it
 *
 * All additive + nullable = non-breaking. Idempotent — re-running is safe.
 *
 * Usage:
 *   pnpm tsx scripts/setup-touchpoints-lead-fk.ts
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
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DIRECTUS_TOKEN}` },
		body: body ? JSON.stringify(body) : undefined,
	});
	const text = await response.text();
	let json: any = {};
	try { json = text ? JSON.parse(text) : {}; } catch { /* non-JSON error body */ }
	return { ok: response.ok, status: response.status, data: response.ok ? ((json.data ?? null) as T) : null, error: response.ok ? null : text };
}

async function fieldExists(collection: string, field: string): Promise<boolean> {
	return (await directusRequest(`/fields/${collection}/${field}`)).ok;
}
async function relationExists(collection: string, field: string): Promise<boolean> {
	return (await directusRequest(`/relations/${collection}/${field}`)).ok;
}

async function ensureField(field: string, body: Record<string, unknown>): Promise<'created' | 'skipped' | 'failed'> {
	if (await fieldExists('touchpoints', field)) {
		console.log(`  [skip] field touchpoints.${field} already exists`);
		return 'skipped';
	}
	const res = await directusRequest('/fields/touchpoints', 'POST', body);
	if (!res.ok) { console.error(`  [fail] field touchpoints.${field}: ${res.error}`); return 'failed'; }
	console.log(`  [ok]   field touchpoints.${field} created`);
	return 'created';
}

async function ensureLeadRelation(): Promise<'created' | 'skipped' | 'failed'> {
	if (await relationExists('touchpoints', 'lead')) {
		console.log('  [skip] relation touchpoints.lead → leads already exists');
		return 'skipped';
	}
	const res = await directusRequest('/relations', 'POST', {
		collection: 'touchpoints',
		field: 'lead',
		related_collection: 'leads',
		meta: { sort_field: null },
		schema: { on_delete: 'SET NULL' },
	});
	if (!res.ok) { console.error(`  [fail] relation touchpoints.lead → leads: ${res.error}`); return 'failed'; }
	console.log('  [ok]   relation touchpoints.lead → leads created');
	return 'created';
}

async function main() {
	console.log('==========================================');
	console.log('  touchpoints — absorb lead_activities');
	console.log(`  Directus: ${DIRECTUS_URL}`);
	console.log('==========================================\n');

	await ensureField('lead', {
		field: 'lead',
		type: 'integer',
		meta: {
			interface: 'select-dropdown-m2o',
			special: ['m2o'],
			options: { template: '{{related_contact.first_name}} {{related_contact.last_name}}' },
			note: 'Lead this touch is about (nullable). Lets a touchpoint attach to a lead — not just a client/project — so pursuit history is continuous and carries forward on conversion.',
			width: 'half',
		},
		schema: { is_nullable: true },
	});
	await ensureLeadRelation();

	await ensureField('outcome', {
		field: 'outcome',
		type: 'string',
		meta: {
			interface: 'select-dropdown',
			options: { choices: [
				{ text: 'Positive', value: 'positive' },
				{ text: 'Neutral', value: 'neutral' },
				{ text: 'Negative', value: 'negative' },
				{ text: 'No response', value: 'no_response' },
			] },
			note: 'How the touch landed (absorbed from lead_activities.outcome).',
			width: 'half',
		},
		schema: { is_nullable: true },
	});

	await ensureField('next_action', {
		field: 'next_action',
		type: 'text',
		meta: { interface: 'input-multiline', note: 'Planned next follow-up for this pursuit.', width: 'full' },
		schema: { is_nullable: true },
	});

	await ensureField('next_action_date', {
		field: 'next_action_date',
		type: 'timestamp',
		meta: { interface: 'datetime', note: 'When the next follow-up is due.', width: 'half' },
		schema: { is_nullable: true },
	});

	console.log('\n  Done. Run `pnpm generate:types` to refresh shared/directus.ts.');
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
