#!/usr/bin/env npx tsx
/**
 * Directus — `held_emails` collection: the money-email DRAFT OUTBOX.
 *
 * WHY: client-facing MONEY email (invoice notices, payment receipts) runs
 * through the default-off money gate (server/utils/outbound-gate.ts). When the
 * gate holds a send, the rendered email was previously only console-logged and
 * returned — there was no place to review it or send it later. This collection
 * persists every held money email as a draft so a human can review it in
 * /email/activity and flush it once the org is ready.
 *
 * One row = one held (or later sent/discarded) money email. `payload` stores the
 * exact SendGrid message object so a re-send transmits byte-for-byte what would
 * have gone out. Denormalized columns (to_email, subject, amount, reason, org,
 * channel, status) exist for cheap listing/filtering without parsing payload.
 *
 * Writes happen via the admin/server token only (persistHeldEmail + the send/
 * discard endpoints proxy through getServerDirectus). No user-policy read perm
 * is granted — the list endpoint reads with the admin token after
 * requireOrgMembership, exactly like email_events / marketing_campaigns.
 *
 * Idempotent — re-running is safe (each field/relation is existence-checked).
 *
 * Usage:
 *   pnpm tsx scripts/setup-held-emails.ts
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

const COLLECTION = 'held_emails';

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
	const res = await directusRequest('/collections', 'POST', {
		collection: COLLECTION,
		meta: {
			icon: 'drafts',
			note: 'Money-email draft outbox. One row per invoice/receipt email held by the money gate (or later sent/discarded).',
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

interface FieldSpec { field: string; type: string; meta?: Record<string, any>; schema?: Record<string, any>; }

const FIELDS: FieldSpec[] = [
	// System stamps.
	{ field: 'date_created', type: 'timestamp', meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true, width: 'half' }, schema: {} },
	{ field: 'date_updated', type: 'timestamp', meta: { special: ['date-updated'], interface: 'datetime', readonly: true, hidden: true, width: 'half' }, schema: {} },

	// Scope — org the money email was for (nullable: a payment notice may fail to
	// resolve its invoice's org; the draft is still worth keeping for audit).
	{ field: 'organization', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], note: 'Owning org (null if the source invoice could not be resolved).', width: 'half' }, schema: { is_nullable: true } },

	// What kind of money email.
	{ field: 'channel', type: 'string', meta: { interface: 'select-dropdown', options: { choices: [{ text: 'Invoice notice', value: 'invoice_notice' }, { text: 'Payment notification', value: 'payment_notification' }] }, note: 'Which money email this draft is.', width: 'half' }, schema: { is_nullable: false } },

	// Denormalized display columns.
	{ field: 'to_email', type: 'string', meta: { interface: 'input', note: 'Primary recipient (TO).', width: 'half' }, schema: { is_nullable: true } },
	{ field: 'subject', type: 'string', meta: { interface: 'input', note: 'Email subject line.', width: 'half' }, schema: { is_nullable: true } },
	{ field: 'amount', type: 'decimal', meta: { interface: 'input', note: 'Money amount for display (dollars).', width: 'half' }, schema: { is_nullable: true, numeric_precision: 12, numeric_scale: 2 } },
	{ field: 'reason', type: 'text', meta: { interface: 'input-multiline', note: 'Why it was held (money-gate reason).', width: 'full' }, schema: { is_nullable: true } },

	// Lifecycle.
	{ field: 'status', type: 'string', meta: { interface: 'select-dropdown', options: { choices: [{ text: 'Held', value: 'held' }, { text: 'Sent', value: 'sent' }, { text: 'Discarded', value: 'discarded' }] }, note: 'held → sent/discarded.', width: 'half' }, schema: { is_nullable: false, default_value: 'held' } },
	{ field: 'sent_at', type: 'timestamp', meta: { interface: 'datetime', note: 'When a human flushed the draft.', width: 'half' }, schema: { is_nullable: true } },
	{ field: 'sent_by', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], note: 'The user who sent the draft.', width: 'half' }, schema: { is_nullable: true } },

	// Exact re-send payload + source ref.
	{ field: 'payload', type: 'json', meta: { interface: 'input-code', note: 'Full SendGrid message object — re-sent byte-for-byte on flush.', width: 'full' }, schema: { is_nullable: true } },
	{ field: 'source_collection', type: 'string', meta: { interface: 'input', note: 'Source doc collection (invoices).', width: 'half' }, schema: { is_nullable: true } },
	{ field: 'source_id', type: 'string', meta: { interface: 'input', note: 'Source doc PK (invoice id).', width: 'half' }, schema: { is_nullable: true } },
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

interface RelSpec { field: string; related: string; onDelete: 'CASCADE' | 'SET NULL'; }

const RELATIONS: RelSpec[] = [
	// Keep the draft even if the org or user is later removed (audit / no silent loss).
	{ field: 'organization', related: 'organizations', onDelete: 'SET NULL' },
	{ field: 'sent_by', related: 'directus_users', onDelete: 'SET NULL' },
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
	console.log('  held_emails — money-email draft outbox');
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
	console.log('Done. Writes use the admin/server token (no user policy read perm —');
	console.log('the list endpoint reads via getServerDirectus after requireOrgMembership).');
	console.log('');
	console.log('Next: pnpm generate:types');
}

main().catch((err) => {
	console.error('Setup failed:', err);
	process.exit(1);
});
