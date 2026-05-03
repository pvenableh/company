#!/usr/bin/env npx tsx
/**
 * Directus marketing_campaigns — Extend Fields for Feed Model
 *
 * Adds 9 new columns to the existing marketing_campaigns collection so it
 * can store recommendation lineage, brand-context provenance, audience
 * snapshot, and token accounting from the feed-driven architecture.
 *
 * Existing fields and rows are untouched. Legacy "Marketing Intelligence"
 * dashboard rows have null card_type / null recommendation / null
 * voice_fingerprint_snapshot / etc — and the feed UI filters to
 * card_type IS NOT NULL. Old dashboard reads plan_data as before.
 *
 * Also patches the status field's options to expand the lifecycle from
 * draft/active/paused/completed/archived → draft/scheduled/partial_sent/
 * completed/cancelled/archived.
 *
 * Run:
 *   pnpm tsx scripts/extend-marketing-campaigns-fields.ts
 *
 * Prerequisites:
 *   - marketing_campaigns collection already exists (set up by
 *     setup-marketing-ai-usage.ts)
 *   - marketing_recommendations collection exists (set up by
 *     setup-marketing-recommendations-collection.ts) — required for
 *     the recommendation FK relation
 *   - DIRECTUS_SERVER_TOKEN env var set (admin-level)
 *
 * Idempotent: re-running is safe.
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

async function createField(collection: string, field: Record<string, any>) {
	console.log(`  Creating field: ${collection}.${field.field}`);
	const { error } = await directusRequest(`/fields/${collection}`, 'POST', field);
	if (error === 'already_exists' || error?.includes('already exists')) { console.log(`    -> Already exists, skipping`); return true; }
	if (error) { console.error(`    -> Error: ${error}`); return false; }
	console.log(`    -> Created`);
	return true;
}

async function patchField(collection: string, fieldName: string, patch: Record<string, any>) {
	console.log(`  Patching field: ${collection}.${fieldName}`);
	const { error } = await directusRequest(`/fields/${collection}/${fieldName}`, 'PATCH', patch);
	if (error) { console.error(`    -> Error: ${error}`); return false; }
	console.log(`    -> Patched`);
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

async function ensureCollectionExists(collection: string) {
	const { data, error } = await directusRequest(`/collections/${collection}`);
	if (error) {
		console.error(`\nPrerequisite missing: collection "${collection}" does not exist (${error}).`);
		console.error('Run the corresponding setup script first.');
		process.exit(1);
	}
	if (!data) {
		console.error(`\nPrerequisite missing: collection "${collection}" returned no data.`);
		process.exit(1);
	}
}

// ─── Field Definitions ────────────────────────────────────────────────────────

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

const STATUS_CHOICES_EXPANDED = [
	{ text: 'Draft', value: 'draft' },
	{ text: 'Scheduled', value: 'scheduled' },
	{ text: 'Partially Sent', value: 'partial_sent' },
	{ text: 'Completed', value: 'completed' },
	{ text: 'Cancelled', value: 'cancelled' },
	// Keep legacy values so old rows still render correctly.
	{ text: 'Active (legacy)', value: 'active' },
	{ text: 'Paused (legacy)', value: 'paused' },
	{ text: 'Archived', value: 'archived' },
];

const TYPE_CHOICES_EXPANDED = [
	{ text: 'Campaign (legacy)', value: 'campaign' },
	{ text: 'Dashboard Analysis (legacy)', value: 'dashboard' },
	{ text: 'Feed Recommendation', value: 'feed_recommendation' },
];

async function extendMarketingCampaigns() {
	console.log('\n=== marketing_campaigns — extend ===');

	// ─── Lineage ──────────────────────────────────────────────────────────

	// NOTE: marketing_recommendations.id is `integer` (Directus auto-creates `id`
	// as integer auto-increment when a collection is created without a uuid id
	// declared up front; subsequent uuid declarations silently no-op). FK type
	// must match the on-disk integer column.
	await createField('marketing_campaigns', {
		field: 'recommendation',
		type: 'integer',
		meta: {
			interface: 'select-dropdown-m2o',
			special: ['m2o'],
			width: 'half',
			note: 'FK to the marketing_recommendations card that produced this campaign.',
		},
		schema: {},
	});

	await createField('marketing_campaigns', {
		field: 'card_type',
		type: 'string',
		meta: {
			interface: 'select-dropdown',
			options: { choices: CARD_TYPE_CHOICES },
			width: 'half',
			note: 'Null for legacy dashboard/campaign rows; set for feed-driven campaigns.',
		},
		schema: {},
	});

	await createField('marketing_campaigns', {
		field: 'phase',
		type: 'string',
		meta: {
			interface: 'input',
			width: 'half',
			note: 'e.g. request_testimonial | repurpose_to_campaign — for phased card types.',
		},
		schema: {},
	});

	// ─── Brand-context provenance ─────────────────────────────────────────

	await createField('marketing_campaigns', {
		field: 'voice_fingerprint_snapshot',
		type: 'json',
		meta: {
			interface: 'input-code',
			note: 'Full VoiceFingerprint at generation time — supports the visible "Drafted from your context" panel.',
		},
		schema: {},
	});

	await createField('marketing_campaigns', {
		field: 'facts_used',
		type: 'json',
		meta: {
			interface: 'tags',
			note: 'Fact IDs referenced in any touch — drives the visible context panel.',
		},
		schema: {},
	});

	await createField('marketing_campaigns', {
		field: 'prompt_versions',
		type: 'json',
		meta: {
			interface: 'input-code',
			note: '{ ranker, generator, voice } — for eval reproducibility.',
		},
		schema: {},
	});

	// ─── Audience snapshot ────────────────────────────────────────────────

	await createField('marketing_campaigns', {
		field: 'audience_snapshot',
		type: 'json',
		meta: {
			interface: 'input-code',
			note: 'Audience at generation time — survives subsequent CRM drift.',
		},
		schema: {},
	});

	// ─── Token accounting ─────────────────────────────────────────────────

	await createField('marketing_campaigns', {
		field: 'tokens_spent',
		type: 'integer',
		meta: { interface: 'input', width: 'half', note: 'Total across this campaign (generation + regenerate).' },
		schema: { default_value: 0 },
	});

	await createField('marketing_campaigns', {
		field: 'generator_strategy',
		type: 'text',
		meta: { interface: 'input-multiline', note: 'cluster_strategy / phase_strategy text from the generator.' },
		schema: {},
	});

	await createField('marketing_campaigns', {
		field: 'cadence_rationale',
		type: 'text',
		meta: { interface: 'input-multiline', note: 'Why this timing/channel mix — from the generator.' },
		schema: {},
	});

	// ─── Patch existing fields to expand enums ────────────────────────────

	await patchField('marketing_campaigns', 'status', {
		meta: {
			interface: 'select-dropdown',
			options: { choices: STATUS_CHOICES_EXPANDED },
			width: 'half',
		},
	});

	await patchField('marketing_campaigns', 'type', {
		meta: {
			interface: 'select-dropdown',
			options: { choices: TYPE_CHOICES_EXPANDED },
			width: 'half',
		},
	});

	// ─── Relations ────────────────────────────────────────────────────────

	await createRelation({
		collection: 'marketing_campaigns',
		field: 'recommendation',
		related_collection: 'marketing_recommendations',
		schema: { on_delete: 'SET NULL' },
		meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
	});
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
	console.log('==========================================');
	console.log('  marketing_campaigns — Extend Fields');
	console.log('==========================================');
	console.log(`Directus URL: ${DIRECTUS_URL}`);

	const { error } = await directusRequest('/server/info');
	if (error) {
		console.error(`\nCannot connect to Directus: ${error}`);
		process.exit(1);
	}
	console.log('Connected');

	await ensureCollectionExists('marketing_campaigns');
	await ensureCollectionExists('marketing_recommendations');

	await extendMarketingCampaigns();

	console.log('');
	console.log('==========================================');
	console.log('  Done');
	console.log('==========================================');
	console.log('All three feed-model migrations are in place.');
	console.log('');
	console.log('Verify in Directus admin:');
	console.log('  - marketing_recommendations collection exists with 18 fields');
	console.log('  - marketing_touches collection exists with ~29 fields');
	console.log('  - marketing_campaigns has 9 new fields + expanded status/type enums');
}

main().catch((err) => {
	console.error('Fatal:', err);
	process.exit(1);
});
