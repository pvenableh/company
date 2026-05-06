#!/usr/bin/env npx tsx
/**
 * Directus marketing_touch_variants Collection — Setup Script
 *
 * Stores per-recipient personalized versions of a marketing_touch (email only).
 * One variant per (touch, contact). Send cron prefers a `completed` variant
 * for the recipient when present and falls back to the base touch otherwise.
 *
 * Lifecycle:
 *   pending    — row enqueued by /personalize, not yet picked up by worker
 *   processing — worker has claimed the row (processing_started_at set)
 *   completed  — variant content written, will be used by send cron
 *   failed     — generator threw or validation hard-failed; error_message set
 *
 * Run:
 *   pnpm tsx scripts/setup-marketing-touch-variants-collection.ts
 *
 * Prerequisites:
 *   - marketing_touches + contacts + organizations exist
 *   - DIRECTUS_SERVER_TOKEN env var set
 *
 * Idempotent: re-running is safe.
 *
 * Permissions: no row-level perms — server endpoints route through
 * getTypedDirectus() after requireOrgMembership(), matching the marketing_touches
 * pattern.
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
			if (response.status === 400 && /already exists|already has an associated/i.test(text)) return { data: null, error: 'already_exists' };
			return { data: null, error: `${response.status}: ${text}` };
		}

		const json = text ? JSON.parse(text) : {};
		return { data: json.data ?? null, error: null };
	} catch (err: any) {
		return { data: null, error: err.message };
	}
}

async function createCollection(collection: string, meta: Record<string, any>) {
	console.log(`  Creating collection: ${collection}`);
	const { error } = await directusRequest('/collections', 'POST', { collection, meta, schema: {} });
	if (error === 'already_exists') { console.log(`    -> Already exists, skipping`); return true; }
	if (error) { console.error(`    -> Error: ${error}`); return false; }
	console.log(`    -> Created`);
	return true;
}

async function createField(collection: string, field: Record<string, any>) {
	console.log(`  Creating field: ${collection}.${field.field}`);
	const { error } = await directusRequest(`/fields/${collection}`, 'POST', field);
	if (error === 'already_exists' || error?.includes('already exists')) { console.log(`    -> Already exists, skipping`); return true; }
	if (error) { console.error(`    -> Error: ${error}`); return false; }
	console.log(`    -> Created`);
	return true;
}

async function createRelation(data: Record<string, any>) {
	console.log(`  Creating relation: ${data.collection}.${data.field} -> ${data.related_collection}`);
	const { error } = await directusRequest('/relations', 'POST', data);
	if (error === 'already_exists') { console.log(`    -> Already exists, skipping`); return true; }
	if (error) { console.error(`    -> Error: ${error}`); return false; }
	console.log(`    -> Created`);
	return true;
}

const STATUS_CHOICES = [
	{ text: 'Pending', value: 'pending' },
	{ text: 'Processing', value: 'processing' },
	{ text: 'Completed', value: 'completed' },
	{ text: 'Failed', value: 'failed' },
];

async function setupMarketingTouchVariants() {
	console.log('\n=== marketing_touch_variants ===');

	await createCollection('marketing_touch_variants', {
		icon: 'tune',
		note: 'Per-recipient personalized versions of a marketing_touch (email only).',
		color: '#0891B2',
		hidden: false,
		singleton: false,
		accountability: 'all',
		archive_field: 'status',
		archive_value: 'failed',
		unarchive_value: 'pending',
		display_template: 'variant for {{contact}} — {{status}}',
	});

	// ─── Identity + parents ───────────────────────────────────────────────

	await createField('marketing_touch_variants', {
		field: 'id',
		type: 'integer',
		meta: { interface: 'input', readonly: true, hidden: true },
		schema: { is_primary_key: true, has_auto_increment: true },
	});

	// FK to marketing_touches.id (integer auto-increment).
	await createField('marketing_touch_variants', {
		field: 'touch',
		type: 'integer',
		meta: {
			interface: 'select-dropdown-m2o',
			special: ['m2o'],
			required: true,
			width: 'half',
			options: { template: '{{kind}} #{{sequence_index}}' },
		},
		schema: { is_nullable: false },
	});

	await createField('marketing_touch_variants', {
		field: 'contact',
		type: 'uuid',
		meta: {
			interface: 'select-dropdown-m2o',
			special: ['m2o'],
			required: true,
			width: 'half',
			options: { template: '{{first_name}} {{last_name}} <{{email}}>' },
		},
		schema: { is_nullable: false },
	});

	await createField('marketing_touch_variants', {
		field: 'organization',
		type: 'uuid',
		meta: {
			interface: 'select-dropdown-m2o',
			special: ['m2o'],
			required: true,
			width: 'half',
			note: 'Denormalized from touch.organization for fast org-scoped queries.',
			options: { template: '{{name}}' },
		},
		schema: { is_nullable: false },
	});

	// ─── Status ───────────────────────────────────────────────────────────

	await createField('marketing_touch_variants', {
		field: 'status',
		type: 'string',
		meta: {
			interface: 'select-dropdown',
			required: true,
			options: { choices: STATUS_CHOICES },
			width: 'half',
		},
		schema: { default_value: 'pending', is_nullable: false },
	});

	await createField('marketing_touch_variants', {
		field: 'processing_started_at',
		type: 'timestamp',
		meta: {
			interface: 'datetime',
			width: 'half',
			note: 'Set when worker claims this row. Stale claims (>60s) reclaimable.',
		},
		schema: {},
	});

	await createField('marketing_touch_variants', {
		field: 'generated_at',
		type: 'timestamp',
		meta: { interface: 'datetime', width: 'half', readonly: true },
		schema: {},
	});

	// ─── Personalized email content ───────────────────────────────────────

	await createField('marketing_touch_variants', {
		field: 'email_subject',
		type: 'string',
		meta: { interface: 'input', note: 'Already personalized — no {{first_name}} substitution at send time.' },
		schema: {},
	});

	await createField('marketing_touch_variants', {
		field: 'email_preview_text',
		type: 'string',
		meta: { interface: 'input' },
		schema: {},
	});

	await createField('marketing_touch_variants', {
		field: 'email_body_markdown',
		type: 'text',
		meta: { interface: 'input-rich-text-md' },
		schema: {},
	});

	// ─── Provenance + diagnostics ─────────────────────────────────────────

	await createField('marketing_touch_variants', {
		field: 'tokens_spent',
		type: 'integer',
		meta: { interface: 'input', width: 'half', readonly: true },
		schema: { default_value: 0 },
	});

	await createField('marketing_touch_variants', {
		field: 'prompt_version',
		type: 'string',
		meta: { interface: 'input', width: 'half', readonly: true },
		schema: {},
	});

	await createField('marketing_touch_variants', {
		field: 'error_message',
		type: 'text',
		meta: { interface: 'input-multiline', note: 'Set when status=failed.' },
		schema: {},
	});

	await createField('marketing_touch_variants', {
		field: 'context_used',
		type: 'json',
		meta: {
			interface: 'input-code',
			note: 'Snapshot of per-contact facts fed into the generator (for debug + audit).',
		},
		schema: {},
	});

	// ─── Audit ────────────────────────────────────────────────────────────

	await createField('marketing_touch_variants', {
		field: 'date_created',
		type: 'timestamp',
		meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true, width: 'half' },
		schema: {},
	});

	await createField('marketing_touch_variants', {
		field: 'date_updated',
		type: 'timestamp',
		meta: { special: ['date-updated'], interface: 'datetime', readonly: true, hidden: true, width: 'half' },
		schema: {},
	});

	// ─── Relations ────────────────────────────────────────────────────────

	await createRelation({
		collection: 'marketing_touch_variants',
		field: 'touch',
		related_collection: 'marketing_touches',
		schema: { on_delete: 'CASCADE' },
		meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
	});

	await createRelation({
		collection: 'marketing_touch_variants',
		field: 'contact',
		related_collection: 'contacts',
		schema: { on_delete: 'CASCADE' },
		meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
	});

	await createRelation({
		collection: 'marketing_touch_variants',
		field: 'organization',
		related_collection: 'organizations',
		schema: { on_delete: 'CASCADE' },
		meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
	});

	// ─── Composite UNIQUE on (touch, contact) ────────────────────────────
	// Directus doesn't expose composite-unique through the fields API.
	// Enqueue endpoint enforces uniqueness at the app layer (checks existing
	// rows before insert). For belt-and-suspenders DB-level safety, run:
	//   CREATE UNIQUE INDEX IF NOT EXISTS marketing_touch_variants_touch_contact_uq
	//     ON marketing_touch_variants (touch, contact);
	console.log('  (App-layer uniqueness on (touch, contact) — see enqueue endpoint.)');
}

async function main() {
	console.log('==========================================');
	console.log('  marketing_touch_variants — Setup');
	console.log('==========================================');
	console.log(`Directus URL: ${DIRECTUS_URL}`);

	const { error } = await directusRequest('/server/info');
	if (error) {
		console.error(`\nCannot connect to Directus: ${error}`);
		process.exit(1);
	}
	console.log('Connected\n');

	await setupMarketingTouchVariants();

	console.log('');
	console.log('==========================================');
	console.log('  Done');
	console.log('==========================================');
}

main().catch((err) => {
	console.error('Fatal:', err);
	process.exit(1);
});
