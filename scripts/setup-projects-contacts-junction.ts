#!/usr/bin/env npx tsx
/**
 * Directus — projects ↔ contacts m2m junction.
 *
 * Adds a `projects_contacts` junction collection so that the Contacts tab on
 * ProjectWorkspace (/apps/work/projects/[id]) can attach contacts directly to
 * a project — independent of the client→contacts relationship. When a project
 * inherits a client we still resolve contacts via `clients_contacts`, but for
 * project-only collaborators (subcontractors, freelancers attached to a
 * specific deliverable, etc.) the m2m gives a place to pin them.
 *
 * Shape:
 *   id            uuid pk
 *   project       m2o → projects (CASCADE on delete — drop the row with the project)
 *   contact       m2o → contacts (CASCADE on delete — drop the row with the contact)
 *   sort          integer (manual reorder)
 *   date_created  timestamp (created_at, server-set)
 *
 * Idempotent — re-running is safe. Mirror of
 * `setup-doc-project-fk.ts` and `setup-carddesk-promote-fk.ts`.
 *
 * Usage:
 *   pnpm tsx scripts/setup-projects-contacts-junction.ts             # apply
 *   pnpm tsx scripts/setup-projects-contacts-junction.ts --dry-run   # plan only
 *
 * Then:
 *   pnpm tsx scripts/setup-projects-contacts-perms.ts                # patch perms
 *   pnpm generate:types                                              # refresh shared/directus.ts
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
	if (await collectionExists('projects_contacts')) {
		console.log('  [skip] collection projects_contacts already exists');
		return 'skipped';
	}
	if (DRY_RUN) {
		console.log('  [plan] would create collection projects_contacts');
		return 'planned';
	}
	const res = await directusRequest('/collections', 'POST', {
		collection: 'projects_contacts',
		meta: {
			icon: 'group',
			note: 'Junction: projects ↔ contacts (extra contacts pinned to a project beyond the client roster).',
			singleton: false,
			hidden: false,
			sort_field: 'sort',
			archive_field: null,
		},
		schema: { name: 'projects_contacts' },
		fields: [
			{
				field: 'id',
				type: 'uuid',
				meta: { hidden: true, interface: 'input', readonly: true, special: ['uuid'] },
				schema: { is_primary_key: true },
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
		console.error(`  [fail] collection projects_contacts: ${res.error}`);
		return 'failed';
	}
	console.log('  [ok]   collection projects_contacts created');
	return 'created';
}

async function ensureFkField(field: 'project' | 'contact'): Promise<Result> {
	if (await fieldExists('projects_contacts', field)) {
		console.log(`  [skip] field projects_contacts.${field} already exists`);
		return 'skipped';
	}
	if (DRY_RUN) {
		console.log(`  [plan] would create field projects_contacts.${field}`);
		return 'planned';
	}
	const res = await directusRequest('/fields/projects_contacts', 'POST', {
		field,
		type: 'uuid',
		meta: {
			interface: 'select-dropdown-m2o',
			special: ['m2o'],
			options: {
				template: field === 'project' ? '{{title}}' : '{{first_name}} {{last_name}}',
			},
			note: field === 'project'
				? 'Project this contact is attached to.'
				: 'Contact pinned to this project.',
			width: 'half',
		},
		schema: { is_nullable: false },
	});
	if (!res.ok) {
		console.error(`  [fail] field projects_contacts.${field}: ${res.error}`);
		return 'failed';
	}
	console.log(`  [ok]   field projects_contacts.${field} created`);
	return 'created';
}

async function ensureRelation(field: 'project' | 'contact'): Promise<Result> {
	if (await relationExists('projects_contacts', field)) {
		console.log(`  [skip] relation projects_contacts.${field} already exists`);
		return 'skipped';
	}
	if (DRY_RUN) {
		console.log(`  [plan] would create relation projects_contacts.${field} → ${field}s`);
		return 'planned';
	}
	const related = field === 'project' ? 'projects' : 'contacts';
	// Reverse o2m alias on the related collection — gives us `project.contacts`
	// and `contact.projects` as walkable relationships (and is what Directus
	// uses to enforce permission filters that traverse the junction).
	const oneField = field === 'project' ? 'contacts' : 'projects';
	const res = await directusRequest('/relations', 'POST', {
		collection: 'projects_contacts',
		field,
		related_collection: related,
		meta: {
			one_field: oneField,
			sort_field: 'sort',
			one_deselect_action: 'delete',
		},
		schema: { on_delete: 'CASCADE' },
	});
	if (!res.ok) {
		console.error(`  [fail] relation projects_contacts.${field} → ${related}: ${res.error}`);
		return 'failed';
	}
	console.log(`  [ok]   relation projects_contacts.${field} → ${related} created`);
	return 'created';
}

// Reverse-o2m alias gotcha (see reference_directus_o2m_alias_gotcha.md):
// setting meta.one_field on the relation alone is not enough — the Directus
// permission engine refuses to resolve $CURRENT_USER traversals across an
// alias that doesn't have a `directus_fields` row. Add the alias rows now
// so client UIs can read `project.contacts.*` later without a 403.
async function ensureAliasField(
	collection: 'projects' | 'contacts',
	field: 'contacts' | 'projects',
): Promise<Result> {
	if (await fieldExists(collection, field)) {
		console.log(`  [skip] alias ${collection}.${field} already exists`);
		return 'skipped';
	}
	if (DRY_RUN) {
		console.log(`  [plan] would create alias ${collection}.${field}`);
		return 'planned';
	}
	const res = await directusRequest(`/fields/${collection}`, 'POST', {
		field,
		type: 'alias',
		meta: {
			interface: 'list-m2m',
			special: ['m2m'],
			options: { template: field === 'contacts' ? '{{contact.first_name}} {{contact.last_name}}' : '{{project.title}}' },
			note: field === 'contacts'
				? 'Extra contacts pinned to this project (beyond the client roster).'
				: 'Projects this contact is pinned to.',
			width: 'full',
		},
		schema: null,
	});
	if (!res.ok) {
		console.error(`  [fail] alias ${collection}.${field}: ${res.error}`);
		return 'failed';
	}
	console.log(`  [ok]   alias ${collection}.${field} created`);
	return 'created';
}

async function main() {
	console.log('=========================================');
	console.log('  projects_contacts junction setup');
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

	console.log('\n--- FK fields ---');
	const projectField = await ensureFkField('project');
	const contactField = await ensureFkField('contact');

	console.log('\n--- relations ---');
	const projectRel = await ensureRelation('project');
	const contactRel = await ensureRelation('contact');

	console.log('\n--- reverse-o2m aliases ---');
	const projectsAlias = await ensureAliasField('projects', 'contacts');
	const contactsAlias = await ensureAliasField('contacts', 'projects');

	console.log('\n=========================================');
	console.log('  Summary');
	console.log('=========================================');
	console.log(`  collection:               ${collRes}`);
	console.log(`  projects_contacts.project:  ${projectField} / ${projectRel}`);
	console.log(`  projects_contacts.contact:  ${contactField} / ${contactRel}`);
	console.log(`  projects.contacts alias:    ${projectsAlias}`);
	console.log(`  contacts.projects alias:    ${contactsAlias}`);

	const all = [collRes, projectField, contactField, projectRel, contactRel, projectsAlias, contactsAlias];
	if (all.includes('failed')) {
		process.exit(1);
	}

	console.log('');
	if (DRY_RUN) {
		console.log('Dry run complete — no writes performed.');
	} else {
		console.log('Done. Next:');
		console.log('  pnpm tsx scripts/setup-projects-contacts-perms.ts');
		console.log('  pnpm generate:types');
	}
}

main().catch((err) => {
	console.error('Setup failed:', err);
	process.exit(1);
});
