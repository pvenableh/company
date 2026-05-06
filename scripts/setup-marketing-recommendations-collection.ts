#!/usr/bin/env npx tsx
/**
 * Directus marketing_recommendations Collection — Setup Script
 *
 * Creates the marketing_recommendations collection — feed entries (cards)
 * surfaced on /marketing. One row per recommendation; lifecycle ends when
 * approved (creates a campaign), skipped, or expired.
 *
 * Run:
 *   pnpm tsx scripts/setup-marketing-recommendations-collection.ts
 *
 * Prerequisites:
 *   - Directus instance running with marketing_campaigns + organizations
 *   - DIRECTUS_SERVER_TOKEN env var set (admin-level)
 *
 * Idempotent: re-running is safe, all creates skip on 409 / already-exists.
 *
 * Permissions: this collection has no row-level perms — server endpoints
 * route reads + writes through getTypedDirectus() after requireOrgMembership(),
 * matching the existing marketing_campaigns pattern.
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

const CARD_TYPE_CHOICES = [
	{ text: 'Dormant Clients', value: 'dormant_clients' },
	{ text: 'Project Complete', value: 'project_complete' },
	{ text: 'Lead Re-engagement', value: 'lead_reengagement' },
	{ text: 'New Client Welcome', value: 'new_client_welcome' },
	{ text: 'Service Promo', value: 'service_promo' },
	{ text: 'Campaign Clone', value: 'campaign_clone' },
	{ text: 'Partner Anniversary', value: 'partner_anniversary' },
	{ text: 'Event Teaser', value: 'event_teaser' },
];

const STATUS_CHOICES = [
	{ text: 'Pending', value: 'pending' },
	{ text: 'Generating', value: 'generating' },
	{ text: 'Drafted', value: 'drafted' },
	{ text: 'Approved', value: 'approved' },
	{ text: 'Skipped', value: 'skipped' },
	{ text: 'Expired', value: 'expired' },
];

async function setupMarketingRecommendations() {
	console.log('\n=== marketing_recommendations ===');

	await createCollection('marketing_recommendations', {
		icon: 'recommend',
		note: 'Marketing-feed cards surfaced to users; lifecycle ends when approved (→ campaign), skipped, or expired.',
		color: '#8B5CF6',
		hidden: false,
		singleton: false,
		accountability: 'all',
		sort_field: null,
		archive_field: 'status',
		archive_value: 'expired',
		unarchive_value: 'pending',
		display_template: '{{card_type}} — {{status}}',
	});

	await createField('marketing_recommendations', {
		field: 'id',
		type: 'uuid',
		meta: { special: ['uuid'], interface: 'input', readonly: true, hidden: true },
		schema: { is_primary_key: true, has_auto_increment: false },
	});

	await createField('marketing_recommendations', {
		field: 'organization',
		type: 'uuid',
		meta: {
			interface: 'select-dropdown-m2o',
			special: ['m2o'],
			required: true,
			width: 'half',
			options: { template: '{{name}}' },
		},
		schema: { is_nullable: false },
	});

	await createField('marketing_recommendations', {
		field: 'card_type',
		type: 'string',
		meta: {
			interface: 'select-dropdown',
			required: true,
			options: { choices: CARD_TYPE_CHOICES },
			width: 'half',
			note: 'Which of the 8 recommendation card types this is.',
		},
		schema: { is_nullable: false },
	});

	await createField('marketing_recommendations', {
		field: 'status',
		type: 'string',
		meta: {
			interface: 'select-dropdown',
			required: true,
			options: { choices: STATUS_CHOICES },
			width: 'half',
			note: 'pending → generating → drafted → approved | skipped | expired',
		},
		schema: { default_value: 'pending', is_nullable: false },
	});

	await createField('marketing_recommendations', {
		field: 'urgency',
		type: 'integer',
		meta: { interface: 'input', width: 'half', note: 'From ranker — 0-100. Higher = more time-sensitive.' },
		schema: {},
	});

	await createField('marketing_recommendations', {
		field: 'candidate_data',
		type: 'json',
		meta: { interface: 'input-code', note: 'Full RecommendationCandidate from the signal extractor.' },
		schema: {},
	});

	await createField('marketing_recommendations', {
		field: 'ranker_output',
		type: 'json',
		meta: { interface: 'input-code', note: '{ why_now, urgency, audience_overlap_with } from the ranker.' },
		schema: {},
	});

	await createField('marketing_recommendations', {
		field: 'ranker_run_id',
		type: 'string',
		meta: { interface: 'input', note: 'Identifier for the ranker batch this came from. Eval-traceable.' },
		schema: {},
	});

	await createField('marketing_recommendations', {
		field: 'ranker_prompt_version',
		type: 'string',
		meta: { interface: 'input', width: 'half', note: 'e.g. "v3" — for eval reproducibility.' },
		schema: {},
	});

	// NOTE: marketing_campaigns.id is `integer` (auto-increment) in this codebase,
	// despite Directus convention favouring uuid. The FK type must match — using
	// integer here. Same caveat applies to marketing_touches.campaign.
	await createField('marketing_recommendations', {
		field: 'resulting_campaign',
		type: 'integer',
		meta: {
			interface: 'select-dropdown-m2o',
			special: ['m2o'],
			width: 'half',
			note: 'Set when the user approves and a campaign is created.',
			options: { template: '{{title}}' },
		},
		schema: {},
	});

	await createField('marketing_recommendations', {
		field: 'skipped_reason',
		type: 'text',
		meta: { interface: 'input-multiline', note: 'Optional user note when skipped.' },
		schema: {},
	});

	await createField('marketing_recommendations', {
		field: 'surfaced_at',
		type: 'timestamp',
		meta: { interface: 'datetime', width: 'half', note: 'When this card first appeared in the feed.' },
		schema: {},
	});

	await createField('marketing_recommendations', {
		field: 'expires_at',
		type: 'timestamp',
		meta: { interface: 'datetime', width: 'half', note: 'After this, a daily cron flips status to expired.' },
		schema: {},
	});

	// Audit fields
	await createField('marketing_recommendations', {
		field: 'date_created',
		type: 'timestamp',
		meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true, width: 'half' },
		schema: {},
	});

	await createField('marketing_recommendations', {
		field: 'date_updated',
		type: 'timestamp',
		meta: { special: ['date-updated'], interface: 'datetime', readonly: true, hidden: true, width: 'half' },
		schema: {},
	});

	await createField('marketing_recommendations', {
		field: 'user_created',
		type: 'uuid',
		meta: { special: ['user-created'], interface: 'select-dropdown-m2o', readonly: true, hidden: true, width: 'half' },
		schema: {},
	});

	await createField('marketing_recommendations', {
		field: 'user_updated',
		type: 'uuid',
		meta: { special: ['user-updated'], interface: 'select-dropdown-m2o', readonly: true, hidden: true, width: 'half' },
		schema: {},
	});

	// Relations
	await createRelation({
		collection: 'marketing_recommendations',
		field: 'organization',
		related_collection: 'organizations',
		schema: { on_delete: 'CASCADE' },
		meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
	});

	await createRelation({
		collection: 'marketing_recommendations',
		field: 'resulting_campaign',
		related_collection: 'marketing_campaigns',
		schema: { on_delete: 'SET NULL' },
		meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
	});
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
	console.log('==========================================');
	console.log('  marketing_recommendations — Setup');
	console.log('==========================================');
	console.log(`Directus URL: ${DIRECTUS_URL}`);

	const { error } = await directusRequest('/server/info');
	if (error) {
		console.error(`\nCannot connect to Directus: ${error}`);
		process.exit(1);
	}
	console.log('Connected\n');

	await setupMarketingRecommendations();

	console.log('');
	console.log('==========================================');
	console.log('  Done');
	console.log('==========================================');
	console.log('Next: pnpm tsx scripts/setup-marketing-touches-collection.ts');
}

main().catch((err) => {
	console.error('Fatal:', err);
	process.exit(1);
});
