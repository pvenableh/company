#!/usr/bin/env npx tsx
/**
 * Directus — `client_timeline` CRM timeline collection.
 *
 * The append-only log the "return leg" writes to: when a client signs a
 * contract, pays an invoice, accepts a proposal, approves a plan, or rates
 * delivered work, one row lands here (actor=client, a verb, the source doc
 * ref, and — for money events — an amount).
 *
 * NOTE: distinct from `clients.last_activity_at` (see setup-client-activity.ts,
 * which drives the "Recent" client sort). This is a full event log, not a
 * single denormalized timestamp.
 *
 * Reads are served by the admin token from
 * `server/api/apps/clients/[id]/activity.get.ts`, which UNIONs these rows
 * with the existing read-time composition. So NO backfill is needed — the
 * table simply starts accumulating from go-live, and historical events keep
 * showing via the composer.
 *
 * Idempotent — re-running is safe (each field/relation is existence-checked).
 * Writes happen via the admin/server token only; no user-policy perms are
 * granted (the read endpoint proxies through getTypedDirectus).
 *
 * Usage:
 *   pnpm tsx scripts/setup-client-timeline.ts
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

const COLLECTION = 'client_timeline';

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

async function collectionExists(collection: string): Promise<boolean> {
	const res = await directusRequest(`/collections/${collection}`);
	return res.ok;
}

async function fieldExists(collection: string, field: string): Promise<boolean> {
	const res = await directusRequest(`/fields/${collection}/${field}`);
	return res.ok;
}

async function relationExists(collection: string, field: string): Promise<boolean> {
	const res = await directusRequest(`/relations/${collection}/${field}`);
	return res.ok;
}

async function ensureCollection(): Promise<'created' | 'skipped' | 'failed'> {
	if (await collectionExists(COLLECTION)) {
		console.log(`  [skip] collection ${COLLECTION} already exists`);
		return 'skipped';
	}
	// Create with the PK field only; the rest are added as fields below so we
	// can re-run this script to patch missing columns onto an older table.
	const res = await directusRequest('/collections', 'POST', {
		collection: COLLECTION,
		meta: {
			icon: 'history',
			note: 'Append-only CRM timeline. One row per client-side action (sign/pay/approve/rate).',
			hidden: false,
			singleton: false,
			sort_field: null,
		},
		schema: {},
		fields: [
			{
				field: 'id',
				type: 'uuid',
				meta: { hidden: true, readonly: true, interface: 'input', special: ['uuid'] },
				schema: { is_primary_key: true, has_auto_increment: false },
			},
		],
	});
	if (!res.ok) {
		console.error(`  [fail] collection ${COLLECTION}: ${res.error}`);
		return 'failed';
	}
	console.log(`  [ok]   collection ${COLLECTION} created`);
	return 'created';
}

interface FieldSpec {
	field: string;
	type: string;
	meta?: Record<string, any>;
	schema?: Record<string, any>;
}

const FIELDS: FieldSpec[] = [
	// System — created stamp.
	{ field: 'date_created', type: 'timestamp', meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true, width: 'half' }, schema: {} },

	// Scope — every read filters by (organization, client).
	{ field: 'organization', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], note: 'Owning org.', width: 'half' }, schema: { is_nullable: false } },
	{ field: 'client', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], options: { template: '{{name}}' }, note: 'Client this event belongs to.', width: 'half' }, schema: { is_nullable: false } },

	// What happened.
	{ field: 'verb', type: 'string', meta: { interface: 'input', note: 'e.g. contract.signed, invoice.paid, proposal.accepted, plan.approved, csat.submitted, changes.requested.', width: 'half' }, schema: { is_nullable: false } },
	{ field: 'title', type: 'string', meta: { interface: 'input', note: 'Human-readable one-liner shown on the timeline.', width: 'full' }, schema: { is_nullable: false } },
	{ field: 'subtitle', type: 'text', meta: { interface: 'input-multiline', note: 'Optional secondary detail (note text, amount label).', width: 'full' }, schema: { is_nullable: true } },

	// Actor — usually the client (portal/anon), sometimes staff/system.
	{ field: 'actor_type', type: 'string', meta: { interface: 'select-dropdown', options: { choices: [{ text: 'Client', value: 'client' }, { text: 'Staff', value: 'staff' }, { text: 'System', value: 'system' }] }, note: 'Who performed the action.', width: 'half' }, schema: { is_nullable: true, default_value: 'client' } },
	{ field: 'actor_name', type: 'string', meta: { interface: 'input', note: 'Display name of the actor (signer name, portal user).', width: 'half' }, schema: { is_nullable: true } },
	{ field: 'actor_user', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], note: 'The directus user, when the actor was authenticated. Null for anonymous portal actions.', width: 'half' }, schema: { is_nullable: true } },

	// Source doc reference + money.
	{ field: 'source_collection', type: 'string', meta: { interface: 'input', note: 'Collection of the doc that triggered this (contracts, invoices, ...).', width: 'half' }, schema: { is_nullable: true } },
	{ field: 'source_id', type: 'string', meta: { interface: 'input', note: 'PK of the source doc.', width: 'half' }, schema: { is_nullable: true } },
	{ field: 'amount', type: 'decimal', meta: { interface: 'input', note: 'Money amount for payment events (dollars).', width: 'half' }, schema: { is_nullable: true, numeric_precision: 12, numeric_scale: 2 } },
	{ field: 'href', type: 'string', meta: { interface: 'input', note: 'App-relative link the timeline row points at.', width: 'half' }, schema: { is_nullable: true } },
	{ field: 'icon', type: 'string', meta: { interface: 'input', note: 'Lucide icon name for the timeline row.', width: 'half' }, schema: { is_nullable: true } },
	{ field: 'metadata', type: 'json', meta: { interface: 'input-code', note: 'Freeform extra data.', width: 'full' }, schema: { is_nullable: true } },
];

async function ensureField(spec: FieldSpec): Promise<'created' | 'skipped' | 'failed'> {
	if (await fieldExists(COLLECTION, spec.field)) {
		console.log(`  [skip] field ${COLLECTION}.${spec.field} already exists`);
		return 'skipped';
	}
	const res = await directusRequest(`/fields/${COLLECTION}`, 'POST', spec);
	if (!res.ok) {
		console.error(`  [fail] field ${COLLECTION}.${spec.field}: ${res.error}`);
		return 'failed';
	}
	console.log(`  [ok]   field ${COLLECTION}.${spec.field} created`);
	return 'created';
}

interface RelSpec {
	field: string;
	related: string;
	onDelete: 'CASCADE' | 'SET NULL';
}

const RELATIONS: RelSpec[] = [
	// Timeline is scoped to a client/org — if either is deleted the rows go too.
	{ field: 'organization', related: 'organizations', onDelete: 'CASCADE' },
	{ field: 'client', related: 'clients', onDelete: 'CASCADE' },
	// Keep the audit row even if the actor user is later removed.
	{ field: 'actor_user', related: 'directus_users', onDelete: 'SET NULL' },
];

async function ensureRelation(rel: RelSpec): Promise<'created' | 'skipped' | 'failed'> {
	if (await relationExists(COLLECTION, rel.field)) {
		console.log(`  [skip] relation ${COLLECTION}.${rel.field} → ${rel.related} already exists`);
		return 'skipped';
	}
	const res = await directusRequest('/relations', 'POST', {
		collection: COLLECTION,
		field: rel.field,
		related_collection: rel.related,
		meta: { sort_field: null },
		schema: { on_delete: rel.onDelete },
	});
	if (!res.ok) {
		console.error(`  [fail] relation ${COLLECTION}.${rel.field} → ${rel.related}: ${res.error}`);
		return 'failed';
	}
	console.log(`  [ok]   relation ${COLLECTION}.${rel.field} → ${rel.related} created`);
	return 'created';
}

async function main() {
	console.log('=========================================');
	console.log('  client_timeline — CRM timeline');
	console.log('=========================================');
	console.log(`Target: ${DIRECTUS_URL}\n`);

	const ping = await directusRequest('/server/info');
	if (!ping.ok) {
		console.error(`Cannot connect to Directus: ${ping.error}`);
		process.exit(1);
	}
	console.log('Connected to Directus\n');

	const results: string[] = [];

	console.log('--- collection ---');
	results.push(await ensureCollection());

	console.log('\n--- fields ---');
	for (const spec of FIELDS) results.push(await ensureField(spec));

	console.log('\n--- relations ---');
	for (const rel of RELATIONS) results.push(await ensureRelation(rel));

	console.log('\n=========================================');
	console.log('  Summary');
	console.log('=========================================');
	const created = results.filter((r) => r === 'created').length;
	const skipped = results.filter((r) => r === 'skipped').length;
	const failed = results.filter((r) => r === 'failed').length;
	console.log(`  created: ${created}  skipped: ${skipped}  failed: ${failed}`);

	if (failed > 0) process.exit(1);

	console.log('');
	console.log('Done. Writes use the admin/server token (no user policy perms).');
	console.log('The read endpoint UNIONs these rows with the read-time composer,');
	console.log('so no backfill is required.');
	console.log('');
	console.log('Next: pnpm generate:types');
}

main().catch((err) => {
	console.error('Setup failed:', err);
	process.exit(1);
});
