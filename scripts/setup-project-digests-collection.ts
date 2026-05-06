#!/usr/bin/env npx tsx
/**
 * project_digests — Daily PM digest persistence
 *
 *   project_digests
 *     id              uuid (pk)
 *     project         uuid m2o → projects (CASCADE)
 *     recipient       uuid m2o → directus_users (CASCADE)
 *     digest_date     date
 *     summary         text (markdown)
 *     read_at         timestamp (nullable)
 *     date_created / user_created / date_updated / user_updated
 *
 * Plus an inverse alias `projects.digests` (o2m) so the AI broker can pull
 * the most recent digest as project context.
 *
 * Run:
 *   pnpm tsx scripts/setup-project-digests-collection.ts
 *
 * Idempotent — re-running is safe.
 */

import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';

if (!DIRECTUS_TOKEN) {
	console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN is required');
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
			if (response.status === 400 && /already exists|already has an associated/i.test(text)) {
				return { data: null, error: 'already_exists' };
			}
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
	if (error === 'already_exists' || error?.includes('already exists')) {
		console.log(`    -> Already exists, skipping`);
		return true;
	}
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

async function setup() {
	console.log('\n=== project_digests ===');

	await createCollection('project_digests', {
		icon: 'summarize',
		note: 'AI-generated daily project briefs delivered to the project PM',
		color: '#7C3AED',
		hidden: false,
		singleton: false,
		accountability: 'all',
		display_template: '{{project.title}} — {{digest_date}}',
	});

	await createField('project_digests', {
		field: 'id',
		type: 'uuid',
		meta: { special: ['uuid'], interface: 'input', readonly: true, hidden: true },
		schema: { is_primary_key: true, has_auto_increment: false },
	});

	await createField('project_digests', {
		field: 'date_created',
		type: 'timestamp',
		meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true },
		schema: {},
	});

	await createField('project_digests', {
		field: 'date_updated',
		type: 'timestamp',
		meta: { special: ['date-updated'], interface: 'datetime', readonly: true, hidden: true },
		schema: {},
	});

	await createField('project_digests', {
		field: 'user_created',
		type: 'uuid',
		meta: { special: ['user-created'], interface: 'select-dropdown-m2o', readonly: true, hidden: true },
		schema: {},
	});

	await createField('project_digests', {
		field: 'user_updated',
		type: 'uuid',
		meta: { special: ['user-updated'], interface: 'select-dropdown-m2o', readonly: true, hidden: true },
		schema: {},
	});

	await createField('project_digests', {
		field: 'project',
		type: 'uuid',
		meta: {
			interface: 'select-dropdown-m2o',
			special: ['m2o'],
			required: true,
			options: { template: '{{title}}' },
		},
		schema: { is_nullable: false },
	});

	await createField('project_digests', {
		field: 'recipient',
		type: 'uuid',
		meta: {
			interface: 'select-dropdown-m2o',
			special: ['m2o'],
			required: true,
			note: 'User this digest was generated for (typically the project PM)',
			options: { template: '{{first_name}} {{last_name}}' },
		},
		schema: { is_nullable: false },
	});

	await createField('project_digests', {
		field: 'digest_date',
		type: 'date',
		meta: { interface: 'datetime', required: true, note: 'Date the digest covers (used for daily idempotency)' },
		schema: { is_nullable: false },
	});

	await createField('project_digests', {
		field: 'summary',
		type: 'text',
		meta: { interface: 'input-rich-text-md', note: 'Markdown brief, ~300 words' },
		schema: { is_nullable: true },
	});

	await createField('project_digests', {
		field: 'read_at',
		type: 'timestamp',
		meta: { interface: 'datetime', note: 'When the recipient first viewed the brief' },
		schema: { is_nullable: true },
	});

	// Relations
	await createRelation({
		collection: 'project_digests',
		field: 'project',
		related_collection: 'projects',
		schema: { on_delete: 'CASCADE' },
		meta: { one_field: 'digests', sort_field: null, junction_field: null },
	});

	// Belt-and-suspenders: Directus 11 does not always auto-create the inverse
	// alias from `one_field` alone. Create the projects.digests o2m explicitly.
	await createField('projects', {
		field: 'digests',
		type: 'alias',
		meta: {
			special: ['o2m'],
			interface: 'list-o2m',
			options: { template: '{{digest_date}} — {{recipient.first_name}} {{recipient.last_name}}' },
			note: 'AI-generated daily PM briefs for this project',
		},
		schema: null,
	});

	await createRelation({
		collection: 'project_digests',
		field: 'recipient',
		related_collection: 'directus_users',
		schema: { on_delete: 'CASCADE' },
		meta: { sort_field: null },
	});
}

async function main() {
	console.log('==========================================');
	console.log('  project_digests — daily PM brief storage');
	console.log('==========================================');
	console.log(`Directus URL: ${DIRECTUS_URL}`);

	await setup();

	console.log('');
	console.log('==========================================');
	console.log('  Done');
	console.log('==========================================');
	console.log('Next steps:');
	console.log('  - In Directus admin, grant Member role read on project_digests');
	console.log('    filtered by project.organization → $CURRENT_USER.organizations.organizations_id.id');
	console.log('    (FK-walk uses .organizations_id, NOT .id — see project_directus_perm_filter_gotchas memo)');
	console.log('  - Update shared/directus.ts with the ProjectDigest interface.');
}

main().catch((err) => {
	console.error('Fatal:', err);
	process.exit(1);
});
