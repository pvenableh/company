#!/usr/bin/env npx tsx
/**
 * Directus team_goals Collection — Setup Script
 *
 * Creates the team_goals collection + fields + team m2o relation for the
 * Teams detail page Goals card (Pass 6 / Pass B of the conformance program).
 *
 * Run once during initial setup or on fresh Directus instances:
 *
 *   pnpm tsx scripts/setup-team-goals-collection.ts
 *
 * After running, apply permissions:
 *
 *   pnpm tsx scripts/setup-org-memberships-goals-perms.ts --apply
 *
 * Prerequisites:
 *   - Directus instance running with teams collection already in schema
 *   - DIRECTUS_SERVER_TOKEN env var set (admin-level)
 *
 * Idempotent: re-running is safe, all creates skip on 409 / already-exists.
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
			// Relations endpoint returns 400 with "already exists" / "already has an associated relationship"
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

async function setupTeamGoals() {
	console.log('\n=== team_goals ===');

	await createCollection('team_goals', {
		icon: 'flag',
		note: 'Per-team goal entries shown on team detail pages',
		color: '#14B8A6',
		hidden: false,
		singleton: false,
		accountability: 'all',
		sort_field: 'sort',
		display_template: '{{title}}',
	});

	await createField('team_goals', {
		field: 'id',
		type: 'uuid',
		meta: { special: ['uuid'], interface: 'input', readonly: true, hidden: true },
		schema: { is_primary_key: true, has_auto_increment: false },
	});

	await createField('team_goals', {
		field: 'sort',
		type: 'integer',
		meta: { interface: 'input', hidden: true },
		schema: {},
	});

	await createField('team_goals', {
		field: 'date_created',
		type: 'timestamp',
		meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true, width: 'half' },
		schema: {},
	});

	await createField('team_goals', {
		field: 'date_updated',
		type: 'timestamp',
		meta: { special: ['date-updated'], interface: 'datetime', readonly: true, hidden: true, width: 'half' },
		schema: {},
	});

	await createField('team_goals', {
		field: 'user_created',
		type: 'uuid',
		meta: { special: ['user-created'], interface: 'select-dropdown-m2o', readonly: true, hidden: true, width: 'half' },
		schema: {},
	});

	await createField('team_goals', {
		field: 'user_updated',
		type: 'uuid',
		meta: { special: ['user-updated'], interface: 'select-dropdown-m2o', readonly: true, hidden: true, width: 'half' },
		schema: {},
	});

	await createField('team_goals', {
		field: 'title',
		type: 'string',
		meta: { interface: 'input', required: true, note: 'Short label for the goal' },
		schema: { is_nullable: false },
	});

	await createField('team_goals', {
		field: 'description',
		type: 'text',
		meta: { interface: 'input-multiline', note: 'Detail on what success looks like' },
		schema: {},
	});

	await createField('team_goals', {
		field: 'target_date',
		type: 'date',
		meta: { interface: 'datetime', width: 'half', note: 'Optional deadline' },
		schema: {},
	});

	await createField('team_goals', {
		field: 'progress',
		type: 'integer',
		meta: {
			interface: 'slider',
			width: 'half',
			options: { minValue: 0, maxValue: 100, stepInterval: 5 },
			note: '0-100 percent complete',
		},
		schema: { default_value: 0 },
	});

	await createField('team_goals', {
		field: 'team',
		type: 'uuid',
		meta: { interface: 'select-dropdown-m2o', special: ['m2o'], required: true, note: 'Owning team' },
		schema: { is_nullable: false },
	});

	await createRelation({
		collection: 'team_goals',
		field: 'team',
		related_collection: 'teams',
		schema: { on_delete: 'CASCADE' },
		meta: { sort_field: null },
	});
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
	console.log('==========================================');
	console.log('  team_goals — Collection Setup');
	console.log('==========================================');
	console.log(`Directus URL: ${DIRECTUS_URL}`);
	console.log('');

	await setupTeamGoals();

	console.log('');
	console.log('==========================================');
	console.log('  Done');
	console.log('==========================================');
	console.log('Next: pnpm tsx scripts/setup-org-memberships-goals-perms.ts --apply');
}

main().catch((err) => {
	console.error('Fatal:', err);
	process.exit(1);
});
