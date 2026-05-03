#!/usr/bin/env npx tsx
/**
 * Directus marketing_touches Collection — Setup Script
 *
 * Creates the marketing_touches collection — individual emails and social
 * posts that make up a campaign. The Gantt timeline view reads from here;
 * engagement tracking lives here; the personalization layer extends here.
 *
 * Run:
 *   pnpm tsx scripts/setup-marketing-touches-collection.ts
 *
 * Prerequisites:
 *   - Directus instance running with marketing_campaigns + organizations + social_posts
 *   - DIRECTUS_SERVER_TOKEN env var set (admin-level)
 *
 * Idempotent: re-running is safe.
 *
 * Permissions: no row-level perms — server endpoints route through
 * getTypedDirectus() after requireOrgMembership(), matching the existing
 * marketing_campaigns pattern.
 *
 * Note: source_email_send is a plain uuid field (no relation) because email
 * sends in this codebase are not centralized in a single collection yet.
 * Wire the FK later when the schedule-touch transaction is built.
 */

import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';

if (!DIRECTUS_TOKEN) {
	console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN environment variable is required');
	process.exit(1);
}

// ─── API Helper ───────────────────────────────────────────────────────────────

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

// ─── Schema Definition ────────────────────────────────────────────────────────

const KIND_CHOICES = [
	{ text: 'Email', value: 'email' },
	{ text: 'Social', value: 'social' },
];

const AUDIENCE_TARGET_CHOICES = [
	{ text: 'Project Contact', value: 'project_contact' },
	{ text: 'Lookalike Audience', value: 'lookalike_audience' },
	{ text: 'Public', value: 'public' },
];

const STATUS_CHOICES = [
	{ text: 'Pending', value: 'pending' },
	{ text: 'Scheduled', value: 'scheduled' },
	{ text: 'Sent', value: 'sent' },
	{ text: 'Cancelled', value: 'cancelled' },
	{ text: 'Failed', value: 'failed' },
];

const SOCIAL_CHANNEL_CHOICES = [
	{ text: 'LinkedIn', value: 'linkedin' },
	{ text: 'Instagram', value: 'instagram' },
	{ text: 'Twitter', value: 'twitter' },
];

const EMAIL_CTA_CHOICES = [
	{ text: 'Book Call', value: 'book_call' },
	{ text: 'Reply', value: 'reply' },
	{ text: 'View Portfolio', value: 'view_portfolio' },
	{ text: 'View Case Study', value: 'view_case_study' },
	{ text: 'Reply With Question', value: 'reply_with_question' },
];

const PERSONALIZATION_CHOICES = [
	{ text: 'None', value: 'none' },
	{ text: 'Requested', value: 'requested' },
	{ text: 'In Progress', value: 'in_progress' },
	{ text: 'Completed', value: 'completed' },
];

async function setupMarketingTouches() {
	console.log('\n=== marketing_touches ===');

	await createCollection('marketing_touches', {
		icon: 'send',
		note: 'Individual emails and social posts within a marketing campaign.',
		color: '#06B6D4',
		hidden: false,
		singleton: false,
		accountability: 'all',
		sort_field: 'sequence_index',
		archive_field: 'status',
		archive_value: 'cancelled',
		unarchive_value: 'pending',
		display_template: '{{kind}} #{{sequence_index}} — {{status}}',
	});

	// ─── Identity + parents ───────────────────────────────────────────────

	await createField('marketing_touches', {
		field: 'id',
		type: 'uuid',
		meta: { special: ['uuid'], interface: 'input', readonly: true, hidden: true },
		schema: { is_primary_key: true, has_auto_increment: false },
	});

	// NOTE: marketing_campaigns.id is `integer` (auto-increment) in this codebase.
	// The FK type must match — using integer here.
	await createField('marketing_touches', {
		field: 'campaign',
		type: 'integer',
		meta: { interface: 'select-dropdown-m2o', special: ['m2o'], required: true, width: 'half' },
		schema: { is_nullable: false },
	});

	await createField('marketing_touches', {
		field: 'organization',
		type: 'uuid',
		meta: {
			interface: 'select-dropdown-m2o',
			special: ['m2o'],
			required: true,
			width: 'half',
			note: 'Denormalized from campaign for fast org-scoped queries.',
		},
		schema: { is_nullable: false },
	});

	await createField('marketing_touches', {
		field: 'sequence_index',
		type: 'integer',
		meta: { interface: 'input', width: 'half', note: 'Order within campaign (0, 1, 2…).' },
		schema: { default_value: 0 },
	});

	// ─── Type + audience ──────────────────────────────────────────────────

	await createField('marketing_touches', {
		field: 'kind',
		type: 'string',
		meta: {
			interface: 'select-dropdown',
			required: true,
			options: { choices: KIND_CHOICES },
			width: 'half',
		},
		schema: { is_nullable: false },
	});

	await createField('marketing_touches', {
		field: 'audience_target',
		type: 'string',
		meta: {
			interface: 'select-dropdown',
			required: true,
			options: { choices: AUDIENCE_TARGET_CHOICES },
			width: 'half',
		},
		schema: { is_nullable: false },
	});

	await createField('marketing_touches', {
		field: 'audience_filter',
		type: 'string',
		meta: {
			interface: 'input',
			note: "all | opened_previous | unopened_previous | cluster:<label>",
		},
		schema: { default_value: 'all' },
	});

	// ─── Timing + status ──────────────────────────────────────────────────

	await createField('marketing_touches', {
		field: 'send_offset_hours',
		type: 'integer',
		meta: { interface: 'input', width: 'half', note: 'Hours from campaign start.' },
		schema: { default_value: 0 },
	});

	await createField('marketing_touches', {
		field: 'scheduled_for',
		type: 'timestamp',
		meta: { interface: 'datetime', width: 'half', note: 'Computed at schedule time from campaign start + offset.' },
		schema: {},
	});

	await createField('marketing_touches', {
		field: 'sent_at',
		type: 'timestamp',
		meta: { interface: 'datetime', width: 'half', readonly: true },
		schema: {},
	});

	await createField('marketing_touches', {
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

	// ─── Email content ────────────────────────────────────────────────────

	await createField('marketing_touches', {
		field: 'email_subject',
		type: 'string',
		meta: { interface: 'input', note: 'Null when kind=social.' },
		schema: {},
	});

	await createField('marketing_touches', {
		field: 'email_preview_text',
		type: 'string',
		meta: { interface: 'input', note: 'Inbox preview line.' },
		schema: {},
	});

	await createField('marketing_touches', {
		field: 'email_body_markdown',
		type: 'text',
		meta: { interface: 'input-rich-text-md', note: '80-150 words target.' },
		schema: {},
	});

	await createField('marketing_touches', {
		field: 'email_cta',
		type: 'string',
		meta: {
			interface: 'select-dropdown',
			options: { choices: EMAIL_CTA_CHOICES },
			width: 'half',
		},
		schema: {},
	});

	// ─── Social content ───────────────────────────────────────────────────

	await createField('marketing_touches', {
		field: 'social_channel',
		type: 'string',
		meta: {
			interface: 'select-dropdown',
			options: { choices: SOCIAL_CHANNEL_CHOICES },
			width: 'half',
			note: 'Null when kind=email.',
		},
		schema: {},
	});

	await createField('marketing_touches', {
		field: 'social_caption',
		type: 'text',
		meta: { interface: 'input-multiline' },
		schema: {},
	});

	await createField('marketing_touches', {
		field: 'social_image_brief',
		type: 'text',
		meta: { interface: 'input-multiline', note: 'AI-generated description of the desired image.' },
		schema: {},
	});

	await createField('marketing_touches', {
		field: 'social_image_url',
		type: 'string',
		meta: { interface: 'input', note: 'Populated after user uploads/generates an image.' },
		schema: {},
	});

	// ─── Operational FKs (populated at schedule time) ─────────────────────

	await createField('marketing_touches', {
		field: 'source_social_post',
		type: 'uuid',
		meta: {
			interface: 'select-dropdown-m2o',
			special: ['m2o'],
			width: 'half',
			note: 'FK to social_posts created at schedule time.',
		},
		schema: {},
	});

	await createField('marketing_touches', {
		field: 'source_email_send',
		type: 'uuid',
		meta: {
			interface: 'input',
			width: 'half',
			note: 'FK to email send record (no relation yet — wired when email-send infra is centralized).',
		},
		schema: {},
	});

	// ─── Personalization ──────────────────────────────────────────────────

	await createField('marketing_touches', {
		field: 'personalization_state',
		type: 'string',
		meta: {
			interface: 'select-dropdown',
			required: true,
			options: { choices: PERSONALIZATION_CHOICES },
			width: 'half',
		},
		schema: { default_value: 'none' },
	});

	// ─── Engagement (denormalized) ────────────────────────────────────────

	await createField('marketing_touches', {
		field: 'opens_count',
		type: 'integer',
		meta: { interface: 'input', width: 'third', readonly: true },
		schema: {},
	});

	await createField('marketing_touches', {
		field: 'clicks_count',
		type: 'integer',
		meta: { interface: 'input', width: 'third', readonly: true },
		schema: {},
	});

	await createField('marketing_touches', {
		field: 'replies_count',
		type: 'integer',
		meta: { interface: 'input', width: 'third', readonly: true },
		schema: {},
	});

	// ─── Provenance ───────────────────────────────────────────────────────

	await createField('marketing_touches', {
		field: 'tokens_spent',
		type: 'integer',
		meta: { interface: 'input', width: 'half', note: 'Generation + any regenerate spend.' },
		schema: { default_value: 0 },
	});

	await createField('marketing_touches', {
		field: 'regenerate_history',
		type: 'json',
		meta: { interface: 'input-code', note: 'Prior subjects/bodies kept for one-click undo.' },
		schema: {},
	});

	await createField('marketing_touches', {
		field: 'generator_strategy_excerpt',
		type: 'text',
		meta: { interface: 'input-multiline', note: 'Short note from cluster_strategy / phase_strategy at gen time.' },
		schema: {},
	});

	// ─── Audit ────────────────────────────────────────────────────────────

	await createField('marketing_touches', {
		field: 'date_created',
		type: 'timestamp',
		meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true, width: 'half' },
		schema: {},
	});

	await createField('marketing_touches', {
		field: 'date_updated',
		type: 'timestamp',
		meta: { special: ['date-updated'], interface: 'datetime', readonly: true, hidden: true, width: 'half' },
		schema: {},
	});

	await createField('marketing_touches', {
		field: 'user_created',
		type: 'uuid',
		meta: { special: ['user-created'], interface: 'select-dropdown-m2o', readonly: true, hidden: true, width: 'half' },
		schema: {},
	});

	await createField('marketing_touches', {
		field: 'user_updated',
		type: 'uuid',
		meta: { special: ['user-updated'], interface: 'select-dropdown-m2o', readonly: true, hidden: true, width: 'half' },
		schema: {},
	});

	// ─── Relations ────────────────────────────────────────────────────────

	await createRelation({
		collection: 'marketing_touches',
		field: 'campaign',
		related_collection: 'marketing_campaigns',
		schema: { on_delete: 'CASCADE' },
		meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
	});

	await createRelation({
		collection: 'marketing_touches',
		field: 'organization',
		related_collection: 'organizations',
		schema: { on_delete: 'CASCADE' },
		meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
	});

	await createRelation({
		collection: 'marketing_touches',
		field: 'source_social_post',
		related_collection: 'social_posts',
		schema: { on_delete: 'SET NULL' },
		meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
	});
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
	console.log('==========================================');
	console.log('  marketing_touches — Setup');
	console.log('==========================================');
	console.log(`Directus URL: ${DIRECTUS_URL}`);

	const { error } = await directusRequest('/server/info');
	if (error) {
		console.error(`\nCannot connect to Directus: ${error}`);
		process.exit(1);
	}
	console.log('Connected\n');

	await setupMarketingTouches();

	console.log('');
	console.log('==========================================');
	console.log('  Done');
	console.log('==========================================');
	console.log('Next: pnpm tsx scripts/extend-marketing-campaigns-fields.ts');
}

main().catch((err) => {
	console.error('Fatal:', err);
	process.exit(1);
});
