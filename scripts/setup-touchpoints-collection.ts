#!/usr/bin/env npx tsx
/**
 * touchpoints Collection — Setup Script
 *
 * A GENERAL communication log (supersedes project_touchpoints). Each row records
 * an outreach effort ("Sent email", "Phone call") that can attach to any mix of:
 *   - a client   (touchpoints.client,  nullable, SET NULL)
 *   - a project  (touchpoints.project, nullable, SET NULL)
 *   - contacts   (touchpoints.contacts, m2m via touchpoints_contacts)
 * and always carries a denormalized `organization` (required) for the create
 * permission (Directus 11 can't FK-walk on create).
 *
 * Multiple client contacts are a real m2m relation (queryable), while the
 * `participants` JSON stays for the occasional NON-contact tag (team member /
 * portal user) that has no contacts row.
 *
 * Idempotent + additive. Run then apply permissions:
 *   pnpm tsx scripts/setup-touchpoints-collection.ts
 *   pnpm tsx scripts/setup-touchpoints-permissions.ts
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

const C = 'touchpoints';
const J = 'touchpoints_contacts';

async function main() {
	console.log(`Setting up ${C} @ ${DIRECTUS_URL}`);

	await createCollection(C, {
		icon: 'forum',
		note: 'General communication log — a touch (email/call/meeting/note) that can attach to a client, project, and/or contacts, with a response concept.',
		color: '#0EA5E9',
		sort_field: 'sort',
		accountability: 'all',
		display_template: '{{type}} — {{summary}}',
	});

	await createField(C, { field: 'id', type: 'integer', meta: { interface: 'input', readonly: true, hidden: true }, schema: { is_primary_key: true, has_auto_increment: true } });
	await createField(C, { field: 'sort', type: 'integer', meta: { interface: 'input', hidden: true }, schema: {} });
	await createField(C, { field: 'date_created', type: 'timestamp', meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true, width: 'half' }, schema: {} });
	await createField(C, { field: 'user_created', type: 'uuid', meta: { special: ['user-created'], interface: 'select-dropdown-m2o', readonly: true, hidden: true, width: 'half' }, schema: {} });

	await createField(C, { field: 'organization', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], required: true, note: 'Denormalized owner org for the create permission.' }, schema: { is_nullable: false } });
	await createField(C, { field: 'client', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], options: { template: '{{name}}' }, note: 'The client this touchpoint is about (optional).' }, schema: { is_nullable: true } });
	await createField(C, { field: 'project', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], options: { template: '{{title}}' }, note: 'Optional project context.' }, schema: { is_nullable: true } });

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
	await createField(C, { field: 'participants', type: 'json', meta: { interface: 'input-code', options: { language: 'json' }, special: ['cast-json'], note: 'Extra non-contact tags (team members / portal users): [{ kind, id, name }].' }, schema: {} });

	await createRelation({ collection: C, field: 'organization', related_collection: 'organizations', schema: { on_delete: 'CASCADE' }, meta: { sort_field: null } });
	await createRelation({ collection: C, field: 'client', related_collection: 'clients', schema: { on_delete: 'SET NULL' }, meta: { sort_field: null } });
	await createRelation({ collection: C, field: 'project', related_collection: 'projects', schema: { on_delete: 'SET NULL' }, meta: { sort_field: null } });

	// ── Contacts m2m (real multi-contact relation) ──────────────────────────
	await createCollection(J, { icon: 'import_export', hidden: true, note: 'Junction: touchpoints ↔ contacts.' });
	await createField(J, { field: 'id', type: 'integer', meta: { interface: 'input', readonly: true, hidden: true }, schema: { is_primary_key: true, has_auto_increment: true } });
	await createField(J, { field: 'touchpoints_id', type: 'integer', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], hidden: true }, schema: {} });
	await createField(J, { field: 'contacts_id', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], hidden: true }, schema: {} });

	await createField(C, { field: 'contacts', type: 'alias', meta: { interface: 'list-m2m', special: ['m2m'], note: 'Client contacts involved in this touchpoint (m2m).', options: { template: '{{contacts_id.first_name}} {{contacts_id.last_name}}' } }, schema: null });

	await createRelation({ collection: J, field: 'touchpoints_id', related_collection: C, schema: { on_delete: 'CASCADE' }, meta: { one_field: 'contacts', junction_field: 'contacts_id', sort_field: null } });
	await createRelation({ collection: J, field: 'contacts_id', related_collection: 'contacts', schema: { on_delete: 'CASCADE' }, meta: { junction_field: 'touchpoints_id', sort_field: null } });

	console.log('Done. Next: pnpm tsx scripts/setup-touchpoints-permissions.ts');
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
