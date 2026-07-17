#!/usr/bin/env npx tsx
/**
 * project_touchpoints Collection — Setup Script
 *
 * A lightweight communication log for projects (CardDesk-style touch points).
 * Each row records an outreach effort ("Sent email", "Phone call") and can be
 * flagged as having received a response — mirroring cd_activities' is_response
 * / response_note pair.
 *
 * Schema:
 *   - id (auto-increment int)
 *   - project      -> projects (m2o, required, CASCADE)
 *   - organization -> organizations (m2o, required) — denormalized for the
 *                     create permission (Directus 11 can't FK-walk on create).
 *   - type         enum: email | call | text | meeting | note | other
 *   - summary      string  — short label ("Kickoff follow-up")
 *   - note         text    — details
 *   - occurred_at  timestamp — when the touch happened (defaults to now)
 *   - awaiting_response boolean — expecting a reply
 *   - is_response  boolean — this touch received / is a response
 *   - response_note text   — what came back
 *   - participants json    — tagged people [{ kind, id, name }]
 *   - sort, date_created, user_created (audit)
 *
 * Inverse alias:
 *   - projects.touchpoints (o2m, reverse of project_touchpoints.project)
 *
 * Idempotent + additive. Run then apply permissions:
 *   pnpm tsx scripts/setup-project-touchpoints-collection.ts
 *   pnpm tsx scripts/setup-project-touchpoints-permissions.ts
 */
import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!DIRECTUS_TOKEN) { console.error('DIRECTUS_SERVER_TOKEN required'); process.exit(1); }

async function req<T = unknown>(path: string, method: 'GET' | 'POST' | 'PATCH' = 'GET', body?: unknown): Promise<{ data: T | null; error: string | null; status: number }> {
	const r = await fetch(`${DIRECTUS_URL}${path}`, {
		method,
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DIRECTUS_TOKEN}` },
		body: body ? JSON.stringify(body) : undefined,
	});
	const text = await r.text();
	if (!r.ok) {
		if (r.status === 409) return { data: null, error: 'already_exists', status: r.status };
		if (r.status === 400 && /already exists|already has an associated/i.test(text)) return { data: null, error: 'already_exists', status: r.status };
		return { data: null, error: `${r.status}: ${text}`, status: r.status };
	}
	const json = text ? JSON.parse(text) : {};
	return { data: (json.data ?? null) as T, error: null, status: r.status };
}

async function createCollection(collection: string, meta: Record<string, any>) {
	console.log(`  collection ${collection}`);
	const { error } = await req('/collections', 'POST', { collection, meta, schema: {} });
	if (error === 'already_exists') { console.log('    -> exists'); return; }
	if (error) { console.error(`    -> error: ${error}`); process.exit(1); }
	console.log('    -> created');
}

async function createField(collection: string, field: Record<string, any>) {
	console.log(`  field ${collection}.${field.field}`);
	const { error } = await req(`/fields/${collection}`, 'POST', field);
	if (error === 'already_exists' || error?.includes('already exists')) { console.log('    -> exists'); return; }
	if (error) { console.error(`    -> error: ${error}`); process.exit(1); }
	console.log('    -> created');
}

async function createRelation(data: Record<string, any>) {
	console.log(`  relation ${data.collection}.${data.field} -> ${data.related_collection}`);
	const { error } = await req('/relations', 'POST', data);
	if (error === 'already_exists') { console.log('    -> exists'); return; }
	if (error) { console.error(`    -> error: ${error}`); process.exit(1); }
	console.log('    -> created');
}

async function fieldExists(collection: string, field: string) {
	const { status } = await req(`/fields/${collection}/${field}`);
	return status === 200;
}

async function ensureInverseAlias(parent: string, alias: string, child: string, childFk: string, note: string) {
	if (!(await fieldExists(parent, alias))) {
		console.log(`  alias ${parent}.${alias}`);
		const { error } = await req(`/fields/${parent}`, 'POST', {
			collection: parent, field: alias, type: 'alias',
			meta: { interface: 'list-o2m', special: ['o2m'], note }, schema: null,
		});
		if (error && error !== 'already_exists' && !error.includes('already exists')) { console.error(`    -> error: ${error}`); process.exit(1); }
		console.log('    -> created');
	} else { console.log(`  alias ${parent}.${alias} -> exists`); }

	const { data: rels } = await req<any[]>('/relations?limit=-1');
	const rel = rels?.find((r) => r.collection === child && r.field === childFk);
	if (rel && rel.meta?.one_field !== alias) {
		const { error } = await req(`/relations/${child}/${childFk}`, 'PATCH', { meta: { ...rel.meta, one_field: alias } });
		if (error) { console.error(`    -> alias-bind error: ${error}`); process.exit(1); }
		console.log(`  bound ${child}.${childFk}.one_field = ${alias}`);
	}
}

const C = 'project_touchpoints';

async function main() {
	console.log(`Setting up ${C} @ ${DIRECTUS_URL}`);

	await createCollection(C, {
		icon: 'forum',
		note: 'Lightweight communication log for a project (CardDesk-style touch points) with a response concept.',
		color: '#0EA5E9',
		sort_field: 'sort',
		accountability: 'all',
		display_template: '{{type}} — {{summary}}',
	});

	await createField(C, { field: 'id', type: 'integer', meta: { interface: 'input', readonly: true, hidden: true }, schema: { is_primary_key: true, has_auto_increment: true } });
	await createField(C, { field: 'sort', type: 'integer', meta: { interface: 'input', hidden: true }, schema: {} });
	await createField(C, { field: 'date_created', type: 'timestamp', meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true, width: 'half' }, schema: {} });
	await createField(C, { field: 'user_created', type: 'uuid', meta: { special: ['user-created'], interface: 'select-dropdown-m2o', readonly: true, hidden: true, width: 'half' }, schema: {} });

	await createField(C, { field: 'project', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], required: true, options: { template: '{{title}}' } }, schema: { is_nullable: false } });
	await createField(C, { field: 'organization', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], required: true, note: 'Denormalized from project.organization for the create permission.' }, schema: { is_nullable: false } });

	await createField(C, {
		field: 'type', type: 'string',
		meta: { interface: 'select-dropdown', required: true, display: 'labels', options: { choices: [
			{ text: 'Email', value: 'email' },
			{ text: 'Call', value: 'call' },
			{ text: 'Text', value: 'text' },
			{ text: 'Meeting', value: 'meeting' },
			{ text: 'Note', value: 'note' },
			{ text: 'Other', value: 'other' },
		] } },
		schema: { is_nullable: false, default_value: 'email' },
	});

	await createField(C, { field: 'summary', type: 'string', meta: { interface: 'input', note: 'Short label for the touch point.' }, schema: {} });
	await createField(C, { field: 'note', type: 'text', meta: { interface: 'input-multiline' }, schema: {} });
	await createField(C, { field: 'occurred_at', type: 'timestamp', meta: { interface: 'datetime', note: 'When the touch happened.' }, schema: {} });
	await createField(C, { field: 'awaiting_response', type: 'boolean', meta: { interface: 'boolean', special: ['cast-boolean'], note: 'Expecting a reply.' }, schema: { default_value: false } });
	await createField(C, { field: 'is_response', type: 'boolean', meta: { interface: 'boolean', special: ['cast-boolean'], note: 'This touch received / is a response.' }, schema: { default_value: false } });
	await createField(C, { field: 'response_note', type: 'text', meta: { interface: 'input-multiline', note: 'What came back.' }, schema: {} });
	await createField(C, { field: 'participants', type: 'json', meta: { interface: 'input-code', options: { language: 'json' }, special: ['cast-json'], note: 'Tagged people: [{ kind, id, name }].' }, schema: {} });

	await createRelation({ collection: C, field: 'project', related_collection: 'projects', schema: { on_delete: 'CASCADE' }, meta: { sort_field: null } });
	await createRelation({ collection: C, field: 'organization', related_collection: 'organizations', schema: { on_delete: 'CASCADE' }, meta: { sort_field: null } });

	await ensureInverseAlias('projects', 'touchpoints', C, 'project', 'Communication touch points logged on this project. Inverse of project_touchpoints.project.');

	console.log('Done. Next: pnpm tsx scripts/setup-project-touchpoints-permissions.ts');
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
