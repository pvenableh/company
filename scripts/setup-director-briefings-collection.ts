#!/usr/bin/env npx tsx
/**
 * Directus `director_briefings` Collection — Setup Script
 *
 * Persists what Earnest AI "thinks" in the Director's Office so a drafted plan
 * doesn't get thrown away (and re-generated, re-spending tokens) every time the
 * office is reopened. Each row is ONE saved briefing for a subject/scope:
 *   - the narrative rationale (`intro`) Earnest wrote,
 *   - the money/opportunity/client-rating metric snapshots it reasoned over,
 *   - the `plan_id` that ties it to its proposed steps (rows in `ai_actions`
 *     whose `session_id` == this `plan_id`), and
 *   - a deterministic `cache_key` (scope + subject + topic) so the office can
 *     look up "the latest briefing for this section" in one query.
 *
 * The office loads the latest briefing for a section instead of re-calling
 * Claude; a "Refresh / Re-draft" re-runs the model and writes a new row.
 *
 * Access is admin-client only via server endpoints (same pattern as
 * marketing_campaigns) — NO row-level perms, so there is no companion
 * permissions script. Reads/writes route through /server/api/ai/director/*.
 *
 * Modeled on scripts/setup-ai-actions-collection.ts (helpers copied verbatim).
 *
 * Usage:
 *   pnpm tsx scripts/setup-director-briefings-collection.ts
 *   # then: npm run generate:types
 *
 * Prerequisites:
 *   - Directus running with `organizations` collection
 *   - DIRECTUS_SERVER_TOKEN (admin) env var set
 *
 * NOTE: this does nothing until it is actually run against the target Directus.
 * The Director's Office degrades gracefully until then — it just falls back to
 * drafting fresh each time (current behaviour).
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
): Promise<{ data: T | null; error: string | null; status: number }> {
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
			if (response.status === 409) return { data: null, error: 'already_exists', status: response.status };
			if (response.status === 400 && /already exists|already has an associated/i.test(text)) {
				return { data: null, error: 'already_exists', status: response.status };
			}
			return { data: null, error: `${response.status}: ${text}`, status: response.status };
		}

		const json = text ? JSON.parse(text) : {};
		return { data: (json.data ?? null) as T, error: null, status: response.status };
	} catch (err: any) {
		return { data: null, error: err.message, status: 0 };
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

async function setupDirectorBriefings() {
	console.log('\n=== director_briefings ===');

	await createCollection('director_briefings', {
		icon: 'chair',
		note: "Earnest AI's saved Director's Office briefings (rationale + metrics + plan link) so a section isn't re-drafted every time.",
		color: '#6366F1',
		hidden: false,
		singleton: false,
		accountability: 'all',
		display_template: '{{subject}} — {{cache_key}} ({{date_created}})',
	});

	// ── Ownership / scoping ──────────────────────────────────────────────────
	await createField('director_briefings', {
		field: 'organization',
		type: 'uuid',
		meta: { interface: 'select-dropdown-m2o', special: ['m2o'], options: { template: '{{name}}' }, note: 'Owning organization.' },
		schema: { is_nullable: true },
	});
	await createField('director_briefings', {
		field: 'user',
		type: 'uuid',
		meta: { interface: 'select-dropdown-m2o', special: ['m2o'], options: { template: '{{first_name}} {{last_name}}' }, note: 'User who convened this briefing.' },
		schema: { is_nullable: true },
	});

	// ── Which meeting / section this briefing is for ─────────────────────────
	await createField('director_briefings', {
		field: 'scope_type',
		type: 'string',
		meta: {
			interface: 'select-dropdown',
			options: { choices: [{ text: 'Org-wide', value: 'org' }, { text: 'Focused entity', value: 'entity' }] },
			note: 'Org-wide meeting or a focused one-entity meeting.',
		},
		schema: { is_nullable: false, default_value: 'org' },
	});
	await createField('director_briefings', {
		field: 'entity_type',
		type: 'string',
		meta: { interface: 'input', note: 'Focused meeting: the collection (e.g. "projects", "clients").' },
		schema: { is_nullable: true },
	});
	await createField('director_briefings', {
		field: 'entity_id',
		type: 'string',
		meta: { interface: 'input', note: 'Focused meeting: the record id.' },
		schema: { is_nullable: true },
	});
	await createField('director_briefings', {
		field: 'subject',
		type: 'string',
		meta: { interface: 'input', note: 'Agenda subject key (money, clients, projects, leads, proposals, tickets) or blank for a free topic.' },
		schema: { is_nullable: true },
	});
	await createField('director_briefings', {
		field: 'topic',
		type: 'text',
		meta: { interface: 'input-multiline', note: 'Optional free-text steer the user raised.' },
		schema: { is_nullable: true },
	});
	await createField('director_briefings', {
		field: 'cache_key',
		type: 'string',
		meta: { interface: 'input', note: 'Deterministic lookup key: scope + subject + topic. The office finds the latest briefing for a section by this.' },
		schema: { is_nullable: false },
	});

	// ── The saved "thinking" ─────────────────────────────────────────────────
	await createField('director_briefings', {
		field: 'plan_id',
		type: 'string',
		meta: { interface: 'input', note: 'Ties this briefing to its proposed steps (ai_actions rows with session_id == this).' },
		schema: { is_nullable: true },
	});
	await createField('director_briefings', {
		field: 'intro',
		type: 'text',
		meta: { interface: 'input-rich-text-md', note: "Earnest's narrative rationale/briefing prose." },
		schema: { is_nullable: true },
	});
	await createField('director_briefings', {
		field: 'finance',
		type: 'json',
		meta: { interface: 'input-code', options: { language: 'json' }, note: 'Money-mode metric snapshot.' },
		schema: {},
	});
	await createField('director_briefings', {
		field: 'opportunity',
		type: 'json',
		meta: { interface: 'input-code', options: { language: 'json' }, note: 'Money-mode opportunity intel snapshot.' },
		schema: {},
	});
	await createField('director_briefings', {
		field: 'client_rating',
		type: 'json',
		meta: { interface: 'input-code', options: { language: 'json' }, note: 'Focused client-review scorecard snapshot.' },
		schema: {},
	});
	await createField('director_briefings', {
		field: 'agenda',
		type: 'json',
		meta: { interface: 'input-code', options: { language: 'json' }, note: 'Optional board-packet (agenda) snapshot at draft time.' },
		schema: {},
	});
	await createField('director_briefings', {
		field: 'step_count',
		type: 'integer',
		meta: { interface: 'input', note: 'Number of proposed steps at draft time.' },
		schema: { is_nullable: true, default_value: 0 },
	});

	// ── System timestamps ────────────────────────────────────────────────────
	await createField('director_briefings', {
		field: 'date_created',
		type: 'timestamp',
		meta: { interface: 'datetime', special: ['date-created'], readonly: true, hidden: true, width: 'half' },
		schema: {},
	});
	await createField('director_briefings', {
		field: 'date_updated',
		type: 'timestamp',
		meta: { interface: 'datetime', special: ['date-updated'], readonly: true, hidden: true, width: 'half' },
		schema: {},
	});

	// ── Relations ────────────────────────────────────────────────────────────
	await createRelation({
		collection: 'director_briefings',
		field: 'organization',
		related_collection: 'organizations',
		schema: { on_delete: 'CASCADE' },
		meta: { sort_field: null },
	});
	await createRelation({
		collection: 'director_briefings',
		field: 'user',
		related_collection: 'directus_users',
		schema: { on_delete: 'SET NULL' },
		meta: { sort_field: null },
	});
}

async function main() {
	console.log('==========================================');
	console.log("  director_briefings — Collection Setup");
	console.log('==========================================');
	console.log(`Directus URL: ${DIRECTUS_URL}`);

	await setupDirectorBriefings();

	console.log('');
	console.log('==========================================');
	console.log('  Done');
	console.log('==========================================');
	console.log('Next:');
	console.log('  1. npm run generate:types');
}

main().catch((err) => {
	console.error('Fatal:', err);
	process.exit(1);
});
