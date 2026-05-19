#!/usr/bin/env npx tsx
/**
 * Directus — ensure the `email_events` collection exists.
 *
 * `server/api/webhooks/sendgrid-events.post.ts` writes one row per SendGrid
 * event (delivered, open, click, bounce, dropped, deferred, processed,
 * spamreport, unsubscribe, …). The collection was added when the SendGrid
 * webhook wiring was fixed (previously the code wrote to a non-existent
 * `email_activity` collection and retries silently 2xx'd back). This script
 * makes sure prod has the collection so events are not dropped on the floor.
 *
 * Shape matches `EmailEvent` in `shared/directus.ts:1556`:
 *   id            int pk (auto)
 *   email_id      m2o → emails (campaign)
 *   sg_event_id   string (unique-ish, used to dedup retries)
 *   sg_message_id string (shared across events from one send)
 *   event         enum
 *   recipient     string
 *   timestamp     timestamp
 *   url           string (click url)
 *   reason        string (failure reason)
 *   raw           json
 *   organization  m2o → organizations (denormalized for filter perf)
 *   contact       m2o → contacts (matched by recipient email at event time)
 *
 * Idempotent — re-running is safe. Existing rows are not touched.
 *
 * Usage:
 *   pnpm tsx scripts/ensure-email-events-collection.ts            # apply
 *   pnpm tsx scripts/ensure-email-events-collection.ts --dry-run  # plan only
 *
 * Then:
 *   pnpm generate:types
 */

import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
const DRY_RUN = process.argv.includes('--dry-run');

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

async function collectionExists(name: string): Promise<boolean> {
	const res = await directusRequest(`/collections/${name}`);
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

type Result = 'created' | 'skipped' | 'failed' | 'planned';

async function ensureCollection(): Promise<Result> {
	if (await collectionExists('email_events')) {
		console.log('  [skip] collection email_events already exists');
		return 'skipped';
	}
	if (DRY_RUN) {
		console.log('  [plan] would create collection email_events');
		return 'planned';
	}
	const res = await directusRequest('/collections', 'POST', {
		collection: 'email_events',
		meta: {
			icon: 'mail',
			note: 'SendGrid event log (deliveries, opens, clicks, bounces). Written by /api/webhooks/sendgrid-events.',
			singleton: false,
			hidden: false,
			sort_field: 'sort',
			archive_field: null,
		},
		schema: { name: 'email_events' },
		fields: [
			{
				field: 'id',
				type: 'integer',
				meta: { hidden: true, interface: 'input', readonly: true },
				schema: { is_primary_key: true, has_auto_increment: true },
			},
			{
				field: 'sort',
				type: 'integer',
				meta: { interface: 'input', hidden: true },
				schema: { is_nullable: true },
			},
			{
				field: 'date_created',
				type: 'timestamp',
				meta: {
					interface: 'datetime',
					special: ['date-created'],
					readonly: true,
					hidden: true,
					width: 'half',
					display: 'datetime',
					display_options: { relative: true },
				},
				schema: { is_nullable: true },
			},
		],
	});
	if (!res.ok) {
		console.error(`  [fail] collection email_events: ${res.error}`);
		return 'failed';
	}
	console.log('  [ok]   collection email_events created');
	return 'created';
}

async function ensureField(
	field: string,
	type: string,
	meta: Record<string, any>,
	schema: Record<string, any> = { is_nullable: true },
): Promise<Result> {
	if (await fieldExists('email_events', field)) {
		console.log(`  [skip] field email_events.${field} already exists`);
		return 'skipped';
	}
	if (DRY_RUN) {
		console.log(`  [plan] would create field email_events.${field} (${type})`);
		return 'planned';
	}
	const res = await directusRequest('/fields/email_events', 'POST', { field, type, meta, schema });
	if (!res.ok) {
		console.error(`  [fail] field email_events.${field}: ${res.error}`);
		return 'failed';
	}
	console.log(`  [ok]   field email_events.${field} created`);
	return 'created';
}

async function ensureRelation(
	field: string,
	related: string,
	onDelete: 'SET NULL' | 'CASCADE' = 'SET NULL',
): Promise<Result> {
	if (await relationExists('email_events', field)) {
		console.log(`  [skip] relation email_events.${field} → ${related} already exists`);
		return 'skipped';
	}
	if (DRY_RUN) {
		console.log(`  [plan] would create relation email_events.${field} → ${related}`);
		return 'planned';
	}
	const res = await directusRequest('/relations', 'POST', {
		collection: 'email_events',
		field,
		related_collection: related,
		meta: { sort_field: null },
		schema: { on_delete: onDelete },
	});
	if (!res.ok) {
		console.error(`  [fail] relation email_events.${field} → ${related}: ${res.error}`);
		return 'failed';
	}
	console.log(`  [ok]   relation email_events.${field} → ${related} created`);
	return 'created';
}

async function main() {
	console.log('=========================================');
	console.log('  email_events collection setup');
	console.log('=========================================');
	console.log(`Target: ${DIRECTUS_URL}`);
	if (DRY_RUN) console.log('Mode:   DRY RUN (no writes)');
	console.log('');

	const ping = await directusRequest('/server/info');
	if (!ping.ok) {
		console.error(`Cannot connect to Directus: ${ping.error}`);
		process.exit(1);
	}
	console.log('Connected to Directus\n');

	console.log('--- collection ---');
	const collRes = await ensureCollection();

	console.log('\n--- scalar fields ---');
	const fields: Result[] = [];
	fields.push(await ensureField('sg_event_id', 'string', {
		interface: 'input',
		note: "SendGrid's unique event id — used to dedupe retries",
		width: 'half',
	}));
	fields.push(await ensureField('sg_message_id', 'string', {
		interface: 'input',
		note: 'SendGrid message id — shared across events from the same send',
		width: 'half',
	}));
	fields.push(await ensureField('event', 'string', {
		interface: 'select-dropdown',
		display: 'labels',
		options: {
			choices: [
				{ text: 'Delivered', value: 'delivered' },
				{ text: 'Open', value: 'open' },
				{ text: 'Click', value: 'click' },
				{ text: 'Bounce', value: 'bounce' },
				{ text: 'Dropped', value: 'dropped' },
				{ text: 'Deferred', value: 'deferred' },
				{ text: 'Processed', value: 'processed' },
				{ text: 'Spam Report', value: 'spamreport' },
				{ text: 'Unsubscribe', value: 'unsubscribe' },
				{ text: 'Group Unsubscribe', value: 'group_unsubscribe' },
				{ text: 'Group Resubscribe', value: 'group_resubscribe' },
			],
			allowOther: true,
		},
		note: 'SendGrid event type',
		width: 'half',
	}));
	fields.push(await ensureField('recipient', 'string', {
		interface: 'input',
		note: 'Recipient email address from the SendGrid event',
		width: 'half',
	}));
	fields.push(await ensureField('timestamp', 'timestamp', {
		interface: 'datetime',
		display: 'datetime',
		display_options: { relative: true },
		note: 'When SendGrid recorded the event',
		width: 'half',
	}));
	fields.push(await ensureField('url', 'string', {
		interface: 'input',
		note: 'Clicked URL (for click events)',
		width: 'full',
	}));
	fields.push(await ensureField('reason', 'text', {
		interface: 'input-multiline',
		note: 'Failure reason from SendGrid (for bounce/dropped/deferred)',
		width: 'full',
	}));
	fields.push(await ensureField('raw', 'json', {
		interface: 'input-code',
		options: { language: 'json' },
		note: 'Full SendGrid event payload for debugging',
		width: 'full',
	}));
	fields.push(await ensureField('contact_id', 'integer', {
		interface: 'input',
		note: 'DEPRECATED — use `contact` (uuid) instead. Unused, kept for back-compat.',
		hidden: true,
		width: 'half',
	}));

	console.log('\n--- FK fields ---');
	fields.push(await ensureField('email_id', 'integer', {
		interface: 'select-dropdown-m2o',
		special: ['m2o'],
		options: { template: '{{subject}}' },
		note: 'Campaign this event belongs to (FK to emails)',
		width: 'half',
	}));
	fields.push(await ensureField('organization', 'uuid', {
		interface: 'select-dropdown-m2o',
		special: ['m2o'],
		options: { template: '{{name}}' },
		note: 'Organization (denormalized from campaign for filter perf)',
		width: 'half',
	}));
	fields.push(await ensureField('contact', 'uuid', {
		interface: 'select-dropdown-m2o',
		special: ['m2o'],
		options: { template: '{{first_name}} {{last_name}}' },
		note: 'Contact matched by recipient email at event time',
		width: 'half',
	}));

	console.log('\n--- relations ---');
	const relations: Result[] = [];
	relations.push(await ensureRelation('email_id', 'emails'));
	relations.push(await ensureRelation('organization', 'organizations'));
	relations.push(await ensureRelation('contact', 'contacts'));

	console.log('\n=========================================');
	console.log('  Summary');
	console.log('=========================================');
	console.log(`  collection:       ${collRes}`);
	console.log(`  fields:           ${fields.join(', ')}`);
	console.log(`  relations:        ${relations.join(', ')}`);

	const all = [collRes, ...fields, ...relations];
	if (all.includes('failed')) {
		process.exit(1);
	}

	console.log('');
	if (DRY_RUN) {
		console.log('Dry run complete — no writes performed.');
	} else {
		console.log('Done. Run `pnpm generate:types` to refresh shared/directus.ts.');
		console.log('Then patch perms so non-admins can read email_events for /email/activity.');
	}
}

main().catch((err) => {
	console.error('Setup failed:', err);
	process.exit(1);
});
