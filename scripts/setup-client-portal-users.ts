#!/usr/bin/env npx tsx
/**
 * client_portal_users — Schema setup
 *
 * Creates the new `client_portal_users` collection that holds external
 * portal users — separate from `org_memberships`, which now holds only
 * staff (owner/admin/manager/member). The split kills the role-slug
 * discrimination scattered across composables, middleware, and server
 * routes.
 *
 *   pnpm tsx scripts/setup-client-portal-users.ts
 *
 * Idempotent: re-running is safe. Creates skip on 409.
 *
 * Requires: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN.
 *
 * After running this:
 *   1. POST /api/org/migrate-client-memberships?apply=false  (dry-run)
 *   2. Inspect the count, then ?apply=true to copy rows over.
 *   3. Ship the code cutover PR.
 *   4. Later cleanup: revoke `org_memberships.client` writes + drop the
 *      `client` org_role for each org.
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

async function setupClientPortalUsers() {
	console.log('\n=== client_portal_users ===');

	await createCollection('client_portal_users', {
		icon: 'support_agent',
		note: 'External client-portal users. Each row scopes one Directus user to one client (and child clients via parent_client walk) within one organization.',
		color: '#0EA5E9',
		hidden: false,
		singleton: false,
		accountability: 'all',
		display_template: '{{user.email}} → {{client.name}}',
	});

	await createField('client_portal_users', {
		field: 'id',
		type: 'uuid',
		meta: { special: ['uuid'], interface: 'input', readonly: true, hidden: true },
		schema: { is_primary_key: true, has_auto_increment: false },
	});

	await createField('client_portal_users', {
		field: 'date_created',
		type: 'timestamp',
		meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true, width: 'half' },
		schema: {},
	});

	await createField('client_portal_users', {
		field: 'date_updated',
		type: 'timestamp',
		meta: { special: ['date-updated'], interface: 'datetime', readonly: true, hidden: true, width: 'half' },
		schema: {},
	});

	await createField('client_portal_users', {
		field: 'user_created',
		type: 'uuid',
		meta: { special: ['user-created'], interface: 'select-dropdown-m2o', readonly: true, hidden: true, width: 'half' },
		schema: {},
	});

	await createField('client_portal_users', {
		field: 'user_updated',
		type: 'uuid',
		meta: { special: ['user-updated'], interface: 'select-dropdown-m2o', readonly: true, hidden: true, width: 'half' },
		schema: {},
	});

	await createField('client_portal_users', {
		field: 'organization',
		type: 'uuid',
		meta: { interface: 'select-dropdown-m2o', special: ['m2o'], required: true, note: 'The org this portal user belongs to' },
		schema: { is_nullable: false },
	});

	await createField('client_portal_users', {
		field: 'user',
		type: 'uuid',
		meta: { interface: 'select-dropdown-m2o', special: ['m2o'], required: true, note: 'The Directus user who logs in' },
		schema: { is_nullable: false },
	});

	await createField('client_portal_users', {
		field: 'client',
		type: 'uuid',
		meta: { interface: 'select-dropdown-m2o', special: ['m2o'], required: true, note: 'Root client scope. parent_client walk extends visibility to descendants.' },
		schema: { is_nullable: false },
	});

	await createField('client_portal_users', {
		field: 'status',
		type: 'string',
		meta: {
			interface: 'select-dropdown',
			required: true,
			options: {
				choices: [
					{ text: 'Pending', value: 'pending' },
					{ text: 'Active', value: 'active' },
					{ text: 'Suspended', value: 'suspended' },
				],
			},
			width: 'half',
		},
		schema: { default_value: 'pending', is_nullable: false },
	});

	await createField('client_portal_users', {
		field: 'invited_by',
		type: 'uuid',
		meta: { interface: 'select-dropdown-m2o', special: ['m2o'], note: 'Who sent the invite (null for self-signup if ever supported)' },
		schema: {},
	});

	await createField('client_portal_users', {
		field: 'invited_at',
		type: 'timestamp',
		meta: { interface: 'datetime', readonly: true, width: 'half' },
		schema: {},
	});

	await createField('client_portal_users', {
		field: 'accepted_at',
		type: 'timestamp',
		meta: { interface: 'datetime', readonly: true, width: 'half' },
		schema: {},
	});

	await createRelation({
		collection: 'client_portal_users',
		field: 'organization',
		related_collection: 'organizations',
		schema: { on_delete: 'CASCADE' },
		meta: { sort_field: null },
	});

	await createRelation({
		collection: 'client_portal_users',
		field: 'user',
		related_collection: 'directus_users',
		schema: { on_delete: 'CASCADE' },
		meta: { sort_field: null },
	});

	await createRelation({
		collection: 'client_portal_users',
		field: 'client',
		related_collection: 'clients',
		schema: { on_delete: 'CASCADE' },
		meta: { sort_field: null },
	});

	await createRelation({
		collection: 'client_portal_users',
		field: 'invited_by',
		related_collection: 'directus_users',
		schema: { on_delete: 'SET NULL' },
		meta: { sort_field: null },
	});
}

async function main() {
	console.log('==========================================');
	console.log('  client_portal_users — Collection Setup');
	console.log('==========================================');
	console.log(`Directus URL: ${DIRECTUS_URL}`);

	await setupClientPortalUsers();

	console.log('');
	console.log('==========================================');
	console.log('  Done');
	console.log('==========================================');
	console.log('Next: POST /api/org/migrate-client-memberships?apply=false');
}

main().catch((err) => {
	console.error('Fatal:', err);
	process.exit(1);
});
