#!/usr/bin/env npx tsx
/**
 * Client policy — messages.create
 *
 * Portal users need to post channel messages attributed to themselves. The
 * server route /api/portal/message validates the target channel is in the
 * user's scope (admin token) and then inserts on the CALLER's token so
 * Directus stamps `user_created` with the real portal user — an admin-token
 * insert stamps the service account and can't be reassigned.
 *
 * That user-token insert needs a `messages.create` grant on the Client policy.
 * We mirror the existing `comments.create` posture: a coarse "the author is a
 * valid org/portal user in a matching org" filter (keyed on `user_created`).
 * The per-channel tenant scoping is done by the server route, not this filter
 * (Directus 11 create-perms don't FK-walk `channel` anyway).
 *
 *   pnpm tsx scripts/setup-portal-messages-perms.ts          # dry-run
 *   pnpm tsx scripts/setup-portal-messages-perms.ts --apply  # write
 *
 * Idempotent: skips if the rule already exists.
 */

import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
const APPLY = process.argv.includes('--apply');

// Client policy (portal users). Verified via /policies.
const CLIENT_POLICY_ID = 'cdadd1fd-280e-4d4a-83e6-1b911889af46';

if (!DIRECTUS_TOKEN) {
	console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN is required');
	process.exit(1);
}

async function req<T = unknown>(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown) {
	const res = await fetch(`${DIRECTUS_URL}${path}`, {
		method,
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DIRECTUS_TOKEN}` },
		body: body ? JSON.stringify(body) : undefined,
	});
	const text = await res.text();
	if (!res.ok) return { data: null as T | null, error: `${res.status}: ${text}` };
	return { data: (text ? JSON.parse(text).data : null) as T | null, error: null as string | null };
}

// Mirror of comments.create, keyed on `user_created` (messages' author field).
const AUTHOR_SCOPE = {
	_or: [
		{ user_created: { organizations: { organizations_id: { _in: '$CURRENT_USER.organizations.organizations_id' } } } },
		{ user_created: { organizations: { organizations_id: { _in: '$CURRENT_USER.client_portal_users.organization' } } } },
		{ user_created: { client_portal_users: { organization: { _in: '$CURRENT_USER.organizations.organizations_id' } } } },
		{ user_created: { client_portal_users: { organization: { _in: '$CURRENT_USER.client_portal_users.organization' } } } },
	],
};

async function main() {
	console.log('==========================================');
	console.log('  Client policy — messages.create');
	console.log(`  ${APPLY ? 'APPLY' : 'DRY-RUN'} · ${DIRECTUS_URL}`);
	console.log('==========================================');

	const { data: existing, error: findErr } = await req<unknown[]>(
		`/permissions?filter[policy][_eq]=${CLIENT_POLICY_ID}&filter[collection][_eq]=messages&filter[action][_eq]=create&limit=1`,
	);
	if (findErr) { console.error(`  [fail] lookup: ${findErr}`); process.exit(1); }
	if (existing && existing.length > 0) {
		console.log('  [skip] messages.create already present on Client policy');
		return;
	}

	if (!APPLY) {
		console.log('  [would] create messages.create with author-scope filter');
		console.log('          fields=[text,channel,status,parent_id]');
		return;
	}

	const { error } = await req('/permissions', 'POST', {
		policy: CLIENT_POLICY_ID,
		collection: 'messages',
		action: 'create',
		permissions: AUTHOR_SCOPE,
		validation: null,
		presets: null,
		fields: ['text', 'channel', 'status', 'parent_id'],
	});
	if (error) { console.error(`  [fail] create: ${error}`); process.exit(1); }
	console.log('  [ok] messages.create granted to Client policy');
}

main().catch((e) => { console.error(e); process.exit(1); });
