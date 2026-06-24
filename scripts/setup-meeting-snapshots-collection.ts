#!/usr/bin/env npx tsx
/**
 * meeting_snapshots — host-captured frame snapshots from a live meeting.
 *
 * The annotation overlay is a DOM canvas on top of Daily's prebuilt iframe, so
 * it never lands in Daily's cloud recording. The meeting page lets the host
 * flatten the current screen-share/video + the annotation marks into a PNG and
 * POST it here, giving the recap a durable, marked-up artifact.
 *
 *   meeting_snapshots
 *     id                      uuid (pk)
 *     meeting                 uuid m2o → video_meetings (CASCADE)
 *     author                  uuid m2o → directus_users (SET NULL)
 *     image                   uuid m2o → directus_files (SET NULL)
 *     caption                 text (nullable)
 *     meeting_offset_seconds  integer (nullable)
 *     date_created            timestamp
 *
 * Permissions:
 *   - Server-token writes only (the snapshot route creates rows + uploads).
 *   - Client Manager + Client policies get READ scoped via the parent
 *     video_meeting (host_user OR related_organization match).
 *
 * Usage:
 *   pnpm tsx scripts/setup-meeting-snapshots-collection.ts
 *
 * Idempotent — re-running is safe. NOTE: not auto-applied on deploy — run
 * manually against prod (point DIRECTUS_URL + admin token at prod) then
 * `pnpm generate:types`.
 */

import 'dotenv/config';

const URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!TOKEN) {
	console.error('DIRECTUS_SERVER_TOKEN required');
	process.exit(1);
}

const POLICY = {
	CLIENT_MANAGER: '012beff9-150c-49e9-a284-1a7e2757e0dd',
	CLIENT: 'cdadd1fd-280e-4d4a-83e6-1b911889af46',
} as const;

async function api<T = any>(path: string, init?: RequestInit): Promise<{ data: T | null; error: string | null }> {
	try {
		const r = await fetch(URL + path, {
			...init,
			headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
		});
		const text = await r.text();
		if (!r.ok) {
			if (r.status === 409) return { data: null, error: 'already_exists' };
			if (r.status === 400 && /already exists/i.test(text)) return { data: null, error: 'already_exists' };
			return { data: null, error: `${r.status}: ${text}` };
		}
		return { data: text ? JSON.parse(text).data : null, error: null };
	} catch (err: any) {
		return { data: null, error: err.message };
	}
}

async function createCollection(c: string, meta: any) {
	console.log(`  Collection: ${c}`);
	const { error } = await api('/collections', { method: 'POST', body: JSON.stringify({ collection: c, meta, schema: {} }) });
	if (error === 'already_exists') console.log('    -> exists');
	else if (error) console.error('    -> ' + error);
	else console.log('    -> created');
}

async function createField(c: string, field: any) {
	console.log(`  Field: ${c}.${field.field}`);
	const { error } = await api(`/fields/${c}`, { method: 'POST', body: JSON.stringify(field) });
	if (error === 'already_exists' || error?.includes('already exists')) console.log('    -> exists');
	else if (error) console.error('    -> ' + error);
	else console.log('    -> created');
}

async function createRelation(rel: any) {
	console.log(`  Relation: ${rel.collection}.${rel.field} -> ${rel.related_collection}`);
	const { error } = await api('/relations', { method: 'POST', body: JSON.stringify(rel) });
	if (error === 'already_exists') console.log('    -> exists');
	else if (error) console.error('    -> ' + error);
	else console.log('    -> created');
}

async function ensurePermission(policy: string, collection: string, action: 'read' | 'create' | 'update' | 'delete', filter: any) {
	const existing = await api<any[]>(
		`/permissions?fields=id,policy,collection,action&filter[policy][_eq]=${policy}&filter[collection][_eq]=${collection}&filter[action][_eq]=${action}&limit=1`,
	);
	if (existing.data && existing.data.length > 0) {
		console.log(`    perm ${collection}.${action} on ${policy.slice(0, 8)} -> exists`);
		return;
	}
	const { error } = await api('/permissions', {
		method: 'POST',
		body: JSON.stringify({ policy, collection, action, permissions: filter, fields: ['*'] }),
	});
	if (error) console.error(`    -> ${error}`);
	else console.log(`    perm ${collection}.${action} on ${policy.slice(0, 8)} -> created`);
}

(async () => {
	console.log('\n=== meeting_snapshots ===');

	await createCollection('meeting_snapshots', {
		icon: 'photo_camera',
		note: 'Host-captured frame snapshots (screen share + annotations) from a live meeting',
		color: '#10B981',
		hidden: false,
		singleton: false,
		accountability: 'all',
		display_template: '{{caption}}',
	});

	await createField('meeting_snapshots', {
		field: 'id',
		type: 'uuid',
		meta: { special: ['uuid'], interface: 'input', readonly: true, hidden: true },
		schema: { is_primary_key: true, has_auto_increment: false },
	});

	await createField('meeting_snapshots', {
		field: 'date_created',
		type: 'timestamp',
		meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true, width: 'half' },
		schema: {},
	});

	await createField('meeting_snapshots', {
		field: 'meeting',
		type: 'uuid',
		meta: { interface: 'select-dropdown-m2o', special: ['m2o'], options: { template: '{{title}}' }, required: true },
		schema: { is_nullable: false },
	});

	await createRelation({
		collection: 'meeting_snapshots',
		field: 'meeting',
		related_collection: 'video_meetings',
		schema: { on_delete: 'CASCADE' },
		// No inverse o2m alias — avoids any field-name collision on video_meetings.
		meta: { sort_field: null },
	});

	await createField('meeting_snapshots', {
		field: 'author',
		type: 'uuid',
		meta: { interface: 'select-dropdown-m2o', special: ['m2o'], options: { template: '{{first_name}} {{last_name}}' } },
		schema: { is_nullable: true },
	});

	await createRelation({
		collection: 'meeting_snapshots',
		field: 'author',
		related_collection: 'directus_users',
		schema: { on_delete: 'SET NULL' },
		meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
	});

	await createField('meeting_snapshots', {
		field: 'image',
		type: 'uuid',
		meta: { interface: 'file-image', special: ['file'], width: 'full' },
		schema: { is_nullable: true },
	});

	await createRelation({
		collection: 'meeting_snapshots',
		field: 'image',
		related_collection: 'directus_files',
		schema: { on_delete: 'SET NULL' },
		meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
	});

	await createField('meeting_snapshots', {
		field: 'caption',
		type: 'text',
		meta: { interface: 'input-multiline', width: 'full' },
		schema: { is_nullable: true },
	});

	await createField('meeting_snapshots', {
		field: 'meeting_offset_seconds',
		type: 'integer',
		meta: { interface: 'input', width: 'half', note: 'Seconds into the meeting when the snapshot was taken.' },
		schema: { is_nullable: true },
	});

	console.log('\n=== permissions ===');
	const meetingScopeFilter = {
		meeting: {
			_or: [
				{ host_user: { _eq: '$CURRENT_USER' } },
				{ related_organization: { _in: '$CURRENT_USER.organizations.organizations_id' } },
			],
		},
	};

	for (const policy of [POLICY.CLIENT_MANAGER, POLICY.CLIENT]) {
		await ensurePermission(policy, 'meeting_snapshots', 'read', meetingScopeFilter);
	}

	console.log('\nDone.');
})();
