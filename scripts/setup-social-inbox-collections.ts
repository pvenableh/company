#!/usr/bin/env npx tsx
/**
 * Directus social-inbox collections — Setup Script
 *
 * Creates three collections backing the unified social inbox + activity feed:
 *
 *   - social_threads   — one row per Messenger/IG-DM conversation
 *   - social_messages  — one row per message inside a thread
 *   - social_activity  — one row per non-message event (comment, mention,
 *                        reaction, follow, lead) coming off webhooks
 *
 * Tenancy: every row carries an `organization` FK (denormalized on
 * social_messages so perm filters don't have to FK-walk through the thread).
 * No user-policy permissions are granted — same pattern as
 * `marketing_campaigns`: all reads/writes go through admin-token server
 * routes that gate via `requireOrgMembership()` in
 * server/utils/marketing-perms.ts.
 *
 * Run:
 *   pnpm tsx scripts/setup-social-inbox-collections.ts
 *
 * Prerequisites:
 *   - Directus reachable at $DIRECTUS_URL
 *   - DIRECTUS_SERVER_TOKEN (admin) set
 *   - `social_accounts` and `organizations` collections already exist
 *
 * After running, regenerate TypeScript types:
 *   pnpm generate:types
 *
 * Idempotent: re-running skips on 409 / already-exists.
 *
 * Note: the inline `fields` array on `/collections` POST is intentional —
 * `schema: {}` would let Directus auto-create an integer auto-increment `id`
 * column, which then 409s any explicit `uuid` id field and silently sticks
 * with the int. Passing `fields` defines the primary key up front.
 */

import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';

if (!DIRECTUS_TOKEN) {
	console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN environment variable is required');
	process.exit(1);
}

// ─── API helpers ──────────────────────────────────────────────────────────────

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
		return { data: (json.data ?? null) as T, error: null };
	} catch (err: any) {
		return { data: null, error: err.message };
	}
}

async function collectionExists(collection: string): Promise<boolean> {
	const { data } = await directusRequest(`/collections/${collection}`);
	return data !== null;
}

async function createCollectionWithFields(
	collection: string,
	meta: Record<string, any>,
	fields: Array<Record<string, any>>,
): Promise<boolean> {
	if (await collectionExists(collection)) {
		console.log(`  Collection ${collection} already exists, skipping creation`);
		return true;
	}
	console.log(`  Creating collection: ${collection}`);
	// `schema: {}` is required alongside `fields` — without it Directus creates
	// a virtual/alias collection (no underlying table), which silently breaks
	// every later /relations and /items call with FORBIDDEN.
	const { error } = await directusRequest('/collections', 'POST', { collection, meta, schema: {}, fields });
	if (error) { console.error(`    -> Error: ${error}`); return false; }
	console.log(`    -> Created with ${fields.length} field(s)`);
	return true;
}

async function createField(collection: string, field: Record<string, any>) {
	console.log(`  Creating field: ${collection}.${field.field}`);
	const { error } = await directusRequest(`/fields/${collection}`, 'POST', field);
	if (error === 'already_exists' || error?.includes('already exists')) {
		console.log('    -> Already exists, skipping');
		return true;
	}
	if (error) { console.error(`    -> Error: ${error}`); return false; }
	console.log('    -> Created');
	return true;
}

async function createRelation(data: Record<string, any>) {
	console.log(`  Creating relation: ${data.collection}.${data.field} -> ${data.related_collection}`);
	const { error } = await directusRequest('/relations', 'POST', data);
	if (error === 'already_exists') { console.log('    -> Already exists, skipping'); return true; }
	if (error) { console.error(`    -> Error: ${error}`); return false; }
	console.log('    -> Created');
	return true;
}

// ─── Shared field templates ───────────────────────────────────────────────────

const idField = {
	field: 'id',
	type: 'uuid',
	meta: { special: ['uuid'], interface: 'input', readonly: true, hidden: true },
	schema: { is_primary_key: true, is_nullable: false, has_auto_increment: false },
};

const dateCreatedField = {
	field: 'date_created',
	type: 'timestamp',
	meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true, width: 'half' },
	schema: { is_nullable: true },
};

const dateUpdatedField = {
	field: 'date_updated',
	type: 'timestamp',
	meta: { special: ['date-updated'], interface: 'datetime', readonly: true, hidden: true, width: 'half' },
	schema: { is_nullable: true },
};

const userCreatedField = {
	field: 'user_created',
	type: 'uuid',
	meta: { special: ['user-created'], interface: 'select-dropdown-m2o', readonly: true, hidden: true, width: 'half' },
	schema: { is_nullable: true },
};

const userUpdatedField = {
	field: 'user_updated',
	type: 'uuid',
	meta: { special: ['user-updated'], interface: 'select-dropdown-m2o', readonly: true, hidden: true, width: 'half' },
	schema: { is_nullable: true },
};

const platformChoices = [
	{ text: 'Facebook', value: 'facebook' },
	{ text: 'Instagram', value: 'instagram' },
	{ text: 'Threads', value: 'threads' },
];

// ─── social_threads ───────────────────────────────────────────────────────────

async function setupSocialThreads() {
	console.log('\n=== social_threads ===');

	const created = await createCollectionWithFields(
		'social_threads',
		{
			icon: 'forum',
			note: 'One row per Messenger/IG-DM conversation. Webhook upserts by (account, thread_id).',
			color: '#0EA5E9',
			display_template: '{{participant_name}} ({{platform}})',
			sort_field: 'last_message_at',
		},
		[
			idField,
			dateCreatedField,
			dateUpdatedField,
			userCreatedField,
			userUpdatedField,
			{
				field: 'organization',
				type: 'uuid',
				meta: { interface: 'select-dropdown-m2o', special: ['m2o'], required: true, note: 'Owning organization (tenant)' },
				schema: { is_nullable: false },
			},
			{
				field: 'account',
				type: 'uuid',
				meta: { interface: 'select-dropdown-m2o', special: ['m2o'], required: true, note: 'Connected social_accounts row' },
				schema: { is_nullable: false },
			},
			{
				field: 'platform',
				type: 'string',
				meta: { interface: 'select-dropdown', required: true, options: { choices: platformChoices }, width: 'half' },
				schema: { is_nullable: false, max_length: 20 },
			},
			{
				field: 'thread_id',
				type: 'string',
				meta: { interface: 'input', required: true, width: 'half', note: "Meta's t_{...} for FB, conversation ID for IG" },
				schema: { is_nullable: false, max_length: 100 },
			},
			{
				field: 'participant_id',
				type: 'string',
				meta: { interface: 'input', required: true, width: 'half', note: 'PSID (FB) or IGSID (IG)' },
				schema: { is_nullable: false, max_length: 100 },
			},
			{
				field: 'participant_name',
				type: 'string',
				meta: { interface: 'input', width: 'half' },
				schema: { is_nullable: true, max_length: 255 },
			},
			{
				field: 'participant_avatar',
				type: 'string',
				meta: { interface: 'input', width: 'full' },
				schema: { is_nullable: true, max_length: 500 },
			},
			{
				field: 'last_message_at',
				type: 'timestamp',
				meta: { interface: 'datetime', width: 'half' },
				schema: { is_nullable: true },
			},
			{
				field: 'last_message_preview',
				type: 'text',
				meta: { interface: 'input-multiline', note: 'Snippet of latest message for list rendering' },
				schema: { is_nullable: true },
			},
			{
				field: 'unread_count',
				type: 'integer',
				meta: { interface: 'input', width: 'quarter' },
				schema: { is_nullable: false, default_value: 0 },
			},
			{
				field: 'archived',
				type: 'boolean',
				meta: { interface: 'boolean', width: 'quarter' },
				schema: { is_nullable: false, default_value: false },
			},
			{
				field: 'assigned_to',
				type: 'uuid',
				meta: {
					interface: 'select-dropdown-m2o',
					special: ['m2o'],
					width: 'half',
					note: 'Optional triage assignee',
					options: { template: '{{first_name}} {{last_name}}' },
				},
				schema: { is_nullable: true },
			},
		],
	);
	if (!created) return;

	await createRelation({
		collection: 'social_threads',
		field: 'organization',
		related_collection: 'organizations',
		schema: { on_delete: 'CASCADE' },
		meta: { sort_field: null },
	});

	await createRelation({
		collection: 'social_threads',
		field: 'account',
		related_collection: 'social_accounts',
		schema: { on_delete: 'CASCADE' },
		meta: { sort_field: null },
	});

	await createRelation({
		collection: 'social_threads',
		field: 'assigned_to',
		related_collection: 'directus_users',
		schema: { on_delete: 'SET NULL' },
		meta: { sort_field: null },
	});
}

// ─── social_messages ──────────────────────────────────────────────────────────

async function setupSocialMessages() {
	console.log('\n=== social_messages ===');

	const created = await createCollectionWithFields(
		'social_messages',
		{
			icon: 'mail',
			note: 'One row per message inside a social_threads conversation.',
			color: '#0EA5E9',
			display_template: '{{from_id}} — {{text}}',
			sort_field: 'created_at',
		},
		[
			idField,
			dateCreatedField,
			{
				field: 'thread',
				type: 'uuid',
				meta: { interface: 'select-dropdown-m2o', special: ['m2o'], required: true, note: 'Parent thread' },
				schema: { is_nullable: false },
			},
			{
				field: 'organization',
				type: 'uuid',
				meta: {
					interface: 'select-dropdown-m2o',
					special: ['m2o'],
					required: true,
					note: 'Denormalized from thread for fast tenant filtering',
				},
				schema: { is_nullable: false },
			},
			{
				field: 'platform_message_id',
				type: 'string',
				meta: { interface: 'input', required: true, width: 'half', note: "Meta's mid; UNIQUE for idempotent webhook ingestion" },
				schema: { is_nullable: false, is_unique: true, max_length: 200 },
			},
			{
				field: 'from_id',
				type: 'string',
				meta: { interface: 'input', required: true, width: 'half', note: 'PSID/IGSID or Page ID' },
				schema: { is_nullable: false, max_length: 100 },
			},
			{
				field: 'is_outgoing',
				type: 'boolean',
				meta: { interface: 'boolean', width: 'quarter' },
				schema: { is_nullable: false, default_value: false },
			},
			{
				field: 'text',
				type: 'text',
				meta: { interface: 'input-multiline' },
				schema: { is_nullable: true },
			},
			{
				field: 'attachments',
				type: 'json',
				meta: {
					interface: 'input-code',
					options: { language: 'json' },
					special: ['cast-json'],
					note: '[{ type: image|video|audio|file, url }]',
				},
				schema: { is_nullable: true },
			},
			{
				field: 'reactions',
				type: 'json',
				meta: {
					interface: 'input-code',
					options: { language: 'json' },
					special: ['cast-json'],
					note: '[{ from_id, emoji }]',
				},
				schema: { is_nullable: true },
			},
			{
				field: 'created_at',
				type: 'timestamp',
				meta: { interface: 'datetime', required: true, width: 'half', note: 'Platform timestamp (not Directus date_created)' },
				schema: { is_nullable: false },
			},
		],
	);
	if (!created) return;

	await createRelation({
		collection: 'social_messages',
		field: 'thread',
		related_collection: 'social_threads',
		schema: { on_delete: 'CASCADE' },
		meta: { sort_field: null, one_field: 'messages' },
	});

	await createRelation({
		collection: 'social_messages',
		field: 'organization',
		related_collection: 'organizations',
		schema: { on_delete: 'CASCADE' },
		meta: { sort_field: null },
	});
}

// ─── social_activity ──────────────────────────────────────────────────────────
//
// Distinct from `social_activity_log` (internal audit trail). This collection
// holds non-message events that come off webhooks: comments, mentions,
// reactions, follows, lead-ad submissions. Powers the activity bell + feed.

async function setupSocialActivity() {
	console.log('\n=== social_activity ===');

	const created = await createCollectionWithFields(
		'social_activity',
		{
			icon: 'notifications_active',
			note: 'Webhook-sourced events (comments, mentions, reactions, follows, leads). Distinct from social_activity_log.',
			color: '#F59E0B',
			display_template: '{{type}}: {{preview}}',
			sort_field: 'created_at',
		},
		[
			idField,
			dateCreatedField,
			{
				field: 'organization',
				type: 'uuid',
				meta: { interface: 'select-dropdown-m2o', special: ['m2o'], required: true, note: 'Owning organization (tenant)' },
				schema: { is_nullable: false },
			},
			{
				field: 'account',
				type: 'uuid',
				meta: { interface: 'select-dropdown-m2o', special: ['m2o'], required: true, note: 'Connected social_accounts row' },
				schema: { is_nullable: false },
			},
			{
				field: 'platform',
				type: 'string',
				meta: { interface: 'select-dropdown', required: true, options: { choices: platformChoices }, width: 'half' },
				schema: { is_nullable: false, max_length: 20 },
			},
			{
				field: 'type',
				type: 'string',
				meta: {
					interface: 'select-dropdown',
					required: true,
					width: 'half',
					options: {
						choices: [
							{ text: 'Comment', value: 'comment' },
							{ text: 'Mention', value: 'mention' },
							{ text: 'Reaction', value: 'reaction' },
							{ text: 'Follow', value: 'follow' },
							{ text: 'Lead', value: 'lead' },
						],
					},
				},
				schema: { is_nullable: false, max_length: 30 },
			},
			{
				field: 'ref_id',
				type: 'string',
				meta: { interface: 'input', width: 'half', note: "Meta's comment_id, post_id, etc." },
				schema: { is_nullable: true, max_length: 200 },
			},
			{
				field: 'post_id',
				type: 'string',
				meta: { interface: 'input', width: 'half', note: 'Parent post if applicable' },
				schema: { is_nullable: true, max_length: 200 },
			},
			{
				field: 'actor_id',
				type: 'string',
				meta: { interface: 'input', width: 'half' },
				schema: { is_nullable: true, max_length: 100 },
			},
			{
				field: 'actor_name',
				type: 'string',
				meta: { interface: 'input', width: 'half' },
				schema: { is_nullable: true, max_length: 255 },
			},
			{
				field: 'preview',
				type: 'text',
				meta: { interface: 'input-multiline' },
				schema: { is_nullable: true },
			},
			{
				field: 'raw_payload',
				type: 'json',
				meta: {
					interface: 'input-code',
					options: { language: 'json' },
					special: ['cast-json'],
					note: 'Original webhook payload for debugging + future re-parse',
				},
				schema: { is_nullable: true },
			},
			{
				field: 'read',
				type: 'boolean',
				meta: { interface: 'boolean', width: 'quarter' },
				schema: { is_nullable: false, default_value: false },
			},
			{
				field: 'created_at',
				type: 'timestamp',
				meta: { interface: 'datetime', required: true, width: 'half', note: 'Platform timestamp' },
				schema: { is_nullable: false },
			},
		],
	);
	if (!created) return;

	await createRelation({
		collection: 'social_activity',
		field: 'organization',
		related_collection: 'organizations',
		schema: { on_delete: 'CASCADE' },
		meta: { sort_field: null },
	});

	await createRelation({
		collection: 'social_activity',
		field: 'account',
		related_collection: 'social_accounts',
		schema: { on_delete: 'CASCADE' },
		meta: { sort_field: null },
	});
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
	console.log('==========================================');
	console.log('  social-inbox — Collections Setup');
	console.log('==========================================');
	console.log(`Directus URL: ${DIRECTUS_URL}`);

	const { error: pingError } = await directusRequest('/server/info');
	if (pingError) {
		console.error(`\nCannot reach Directus: ${pingError}`);
		process.exit(1);
	}
	for (const prereq of ['organizations', 'social_accounts']) {
		const { error } = await directusRequest(`/collections/${prereq}`);
		if (error) {
			console.error(`\nPrerequisite collection missing: ${prereq} (${error})`);
			console.error('Run scripts/setup-social-collections.ts first.');
			process.exit(1);
		}
	}

	await setupSocialThreads();
	await setupSocialMessages();
	await setupSocialActivity();

	console.log('');
	console.log('==========================================');
	console.log('  Done');
	console.log('==========================================');
	console.log('');
	console.log('No user-policy permissions were created — these collections');
	console.log('are admin-only by design. All reads/writes go through');
	console.log('admin-token server routes that gate via requireOrgMembership().');
	console.log('See server/utils/marketing-perms.ts for the pattern.');
	console.log('');
	console.log('Next: pnpm generate:types');
}

main().catch((err) => {
	console.error('Fatal:', err);
	process.exit(1);
});
