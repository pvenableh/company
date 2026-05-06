#!/usr/bin/env npx tsx
/**
 * Client portal users → organizations + clients visibility
 *
 * Three changes so a Directus user whose only tie to an org is a
 * `client_portal_users` row (no `organizations_directus_users` junction)
 * can still READ the organization AND their root client (+ direct
 * children via `parent_client`):
 *
 *   1. Add the reverse O2M alias `organizations.client_portal_users`
 *      and set the `one_field` on the existing `client_portal_users.organization`
 *      relation. Mirrors how `organizations.memberships` works for
 *      `org_memberships`.
 *
 *   2. Update the Client policy's `organizations` read filter to OR the
 *      existing junction walk with the new portal-user walk.
 *
 *   3. Update the Client policy's `clients` read filter so portal users
 *      can read their own client + direct children (parent_client walk).
 *      The 2nd-hop walk is the server's job (server/utils/portal-auth.ts).
 *
 * Idempotent. Safe to re-run.
 *
 *   pnpm tsx scripts/setup-client-portal-org-perms.ts
 */

import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
const CLIENT_POLICY_ID = 'cdadd1fd-280e-4d4a-83e6-1b911889af46';

if (!DIRECTUS_TOKEN) {
	console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN environment variable is required');
	process.exit(1);
}

async function req<T = any>(
	path: string,
	method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
	body?: unknown,
): Promise<{ data: T | null; error: string | null; status: number }> {
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
		if (response.status === 400 && /already exists|already has/i.test(text)) {
			return { data: null, error: 'already_exists', status: response.status };
		}
		return { data: null, error: `${response.status}: ${text}`, status: response.status };
	}
	const json = text ? JSON.parse(text) : {};
	return { data: json.data ?? null, error: null, status: response.status };
}

async function ensureAliasField() {
	console.log('\n=== organizations.client_portal_users alias ===');
	const existing = await req(`/fields/organizations/client_portal_users`);
	if (existing.status === 200 && existing.data) {
		console.log('  -> alias field already exists, skipping');
		return;
	}
	const { error } = await req('/fields/organizations', 'POST', {
		field: 'client_portal_users',
		type: 'alias',
		meta: {
			special: ['o2m'],
			interface: 'list-o2m',
			note: 'Active portal-user rows. Mirror of memberships alias. Used by Client policy row filter.',
			searchable: true,
		},
		schema: null,
	});
	if (error && error !== 'already_exists') {
		console.error(`  -> Error creating alias: ${error}`);
		process.exit(1);
	}
	console.log('  -> alias field created');
}

async function ensureRelationOneField() {
	console.log('\n=== client_portal_users.organization relation one_field ===');
	const all = await req<any[]>('/relations');
	const rel = (all.data ?? []).find(
		(r: any) => r.collection === 'client_portal_users' && r.field === 'organization',
	);
	if (!rel) {
		console.error('  -> relation not found! run scripts/setup-client-portal-users.ts first');
		process.exit(1);
	}
	if (rel.meta?.one_field === 'client_portal_users') {
		console.log('  -> already set, skipping');
		return;
	}
	const { error } = await req('/relations/client_portal_users/organization', 'PATCH', {
		meta: { one_field: 'client_portal_users' },
	});
	if (error) {
		console.error(`  -> Error patching relation: ${error}`);
		process.exit(1);
	}
	console.log('  -> one_field set to "client_portal_users"');
}

async function ensureOrgReadFilter() {
	console.log('\n=== Client policy: organizations read filter ===');
	const all = await req<any[]>(
		`/permissions?filter[policy][_eq]=${CLIENT_POLICY_ID}&filter[collection][_eq]=organizations&filter[action][_eq]=read&limit=10`,
	);
	const perm = (all.data ?? [])[0];
	if (!perm) {
		console.error('  -> Client policy has no organizations.read permission row! aborting');
		process.exit(1);
	}

	const desired = {
		_or: [
			{ users: { directus_users_id: { _eq: '$CURRENT_USER' } } },
			{ client_portal_users: { user: { _eq: '$CURRENT_USER' } } },
		],
	};

	const current = perm.permissions || {};
	if (JSON.stringify(current) === JSON.stringify(desired)) {
		console.log('  -> filter already up to date, skipping');
		return;
	}

	const { error } = await req(`/permissions/${perm.id}`, 'PATCH', { permissions: desired });
	if (error) {
		console.error(`  -> Error updating permission: ${error}`);
		process.exit(1);
	}
	console.log('  -> filter updated to junction OR portal-user walk');
}

async function ensureClientsReadFilter() {
	console.log('\n=== Client policy: clients read filter ===');
	const all = await req<any[]>(
		`/permissions?filter[policy][_eq]=${CLIENT_POLICY_ID}&filter[collection][_eq]=clients&filter[action][_eq]=read&limit=10`,
	);
	const perm = (all.data ?? [])[0];
	if (!perm) {
		console.error('  -> Client policy has no clients.read permission row! aborting');
		process.exit(1);
	}

	// Three OR'd walks:
	//   1. Staff path — user is in the org's directus_users junction (legacy
	//      Client memberships that were never portal-split).
	//   2. Direct portal scope — the client *is* the user's portal-user.client.
	//   3. One-hop child — the client's parent_client is the user's portal-user.client.
	// 2nd-hop child clients are resolved server-side (portal-auth.ts).
	const desired = {
		_or: [
			{ organization: { _in: '$CURRENT_USER.organizations.organizations_id' } },
			{ id: { _in: '$CURRENT_USER.client_portal_users.client' } },
			{ parent_client: { _in: '$CURRENT_USER.client_portal_users.client' } },
		],
	};

	const current = perm.permissions || {};
	if (JSON.stringify(current) === JSON.stringify(desired)) {
		console.log('  -> filter already up to date, skipping');
		return;
	}

	const { error } = await req(`/permissions/${perm.id}`, 'PATCH', { permissions: desired });
	if (error) {
		console.error(`  -> Error updating permission: ${error}`);
		process.exit(1);
	}
	console.log('  -> filter updated: staff OR portal-user direct OR portal-user child');
}

async function main() {
	console.log('==========================================');
	console.log('  Client portal → organizations + clients perms');
	console.log('==========================================');
	console.log(`Directus URL: ${DIRECTUS_URL}`);

	await ensureAliasField();
	await ensureRelationOneField();
	await ensureOrgReadFilter();
	await ensureClientsReadFilter();

	console.log('');
	console.log('==========================================');
	console.log('  Done');
	console.log('==========================================');
}

main().catch((err) => {
	console.error('Fatal:', err);
	process.exit(1);
});
