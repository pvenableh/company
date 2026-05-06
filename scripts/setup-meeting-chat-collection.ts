#!/usr/bin/env npx tsx
/**
 * meeting_chat_messages — captures Daily prebuilt chat messages.
 *
 * Daily's prebuilt chat is broadcast via the `app-message` channel and is
 * not persisted server-side. We tap that channel in the meeting page and
 * mirror each message into this collection so the recap can replay it and
 * the AI broker can fold chat into video_meeting context.
 *
 *   meeting_chat_messages
 *     id                  uuid (pk)
 *     meeting             uuid m2o → video_meetings (CASCADE)
 *     sender_session_id   string  — Daily session_id (best-effort)
 *     sender_name         string  — display name from Daily
 *     message             text
 *     sent_at             timestamp — original Daily send time
 *     date_created        timestamp
 *
 * Permissions:
 *   - Server-token writes only (the capture route creates rows).
 *   - Client Manager + Client policies get READ scoped via the parent
 *     video_meeting (host_user OR related_organization match).
 *
 * Usage:
 *   pnpm tsx scripts/setup-meeting-chat-collection.ts
 *
 * Idempotent — re-running is safe.
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
	console.log('\n=== meeting_chat_messages ===');

	await createCollection('meeting_chat_messages', {
		icon: 'forum',
		note: 'Daily prebuilt chat messages mirrored from app-message events',
		color: '#10B981',
		hidden: false,
		singleton: false,
		accountability: 'all',
		display_template: '{{sender_name}}: {{message}}',
	});

	await createField('meeting_chat_messages', {
		field: 'id',
		type: 'uuid',
		meta: { special: ['uuid'], interface: 'input', readonly: true, hidden: true },
		schema: { is_primary_key: true, has_auto_increment: false },
	});

	await createField('meeting_chat_messages', {
		field: 'date_created',
		type: 'timestamp',
		meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true, width: 'half' },
		schema: {},
	});

	await createField('meeting_chat_messages', {
		field: 'meeting',
		type: 'uuid',
		meta: { interface: 'select-dropdown-m2o', special: ['m2o'], options: { template: '{{title}}' }, required: true },
		schema: { is_nullable: false },
	});

	await createRelation({
		collection: 'meeting_chat_messages',
		field: 'meeting',
		related_collection: 'video_meetings',
		schema: { on_delete: 'CASCADE' },
		meta: { sort_field: null },
	});

	await createField('meeting_chat_messages', {
		field: 'sender_session_id',
		type: 'string',
		meta: { interface: 'input', readonly: false, hidden: false, width: 'half' },
		schema: { is_nullable: true, max_length: 64 },
	});

	await createField('meeting_chat_messages', {
		field: 'sender_name',
		type: 'string',
		meta: { interface: 'input', readonly: false, hidden: false, width: 'half' },
		schema: { is_nullable: true, max_length: 200 },
	});

	await createField('meeting_chat_messages', {
		field: 'message',
		type: 'text',
		meta: { interface: 'input-multiline', required: true, width: 'full' },
		schema: { is_nullable: false },
	});

	await createField('meeting_chat_messages', {
		field: 'sent_at',
		type: 'timestamp',
		meta: { interface: 'datetime', readonly: false, hidden: false, width: 'half' },
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
		await ensurePermission(policy, 'meeting_chat_messages', 'read', meetingScopeFilter);
	}

	console.log('\nDone.');
})();
