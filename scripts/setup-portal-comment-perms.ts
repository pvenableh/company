#!/usr/bin/env npx tsx
/**
 * Fixes the portal comment thread (broken since Session 24 split portal users
 * out of org_memberships and into client_portal_users).
 *
 * Two surgical changes, both idempotent, both required:
 *
 *   1) Expose `directus_users.client_portal_users` as a reverse o2m alias on
 *      the existing `client_portal_users.user → directus_users` relation.
 *      This makes `$CURRENT_USER.client_portal_users.organization` a valid
 *      filter path inside Directus row-permission JSON.
 *
 *   2) Rewrite the comment row filters on BOTH policies — Client (Portal) and
 *      Client Manager — so a viewer matches comments whose author shares an
 *      organization via EITHER the staff path (org_memberships) OR the portal
 *      path (client_portal_users). Without this, portal users can't read or
 *      create comments (their `$CURRENT_USER.organizations` is empty), and
 *      staff can't see portal-authored comments.
 *
 * Usage:
 *   pnpm tsx scripts/setup-portal-comment-perms.ts            # dry-run
 *   pnpm tsx scripts/setup-portal-comment-perms.ts --apply    # mutate
 */
import 'dotenv/config';

const URL = process.env.DIRECTUS_URL!;
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!URL || !TOKEN) {
	console.error('DIRECTUS_URL and DIRECTUS_SERVER_TOKEN are required.');
	process.exit(1);
}

const APPLY = process.argv.includes('--apply');

const POLICY = {
	PORTAL: 'cdadd1fd-280e-4d4a-83e6-1b911889af46',
	CLIENT_MANAGER: '012beff9-150c-49e9-a284-1a7e2757e0dd',
} as const;

const STAFF_ORG_PATH = '$CURRENT_USER.organizations.organizations_id';
const PORTAL_ORG_PATH = '$CURRENT_USER.client_portal_users.organization';

const AUTHOR_ORG_FILTER_BIDIRECTIONAL = {
	_or: [
		{ user: { organizations: { organizations_id: { _in: STAFF_ORG_PATH } } } },
		{ user: { organizations: { organizations_id: { _in: PORTAL_ORG_PATH } } } },
		{ user: { client_portal_users: { organization: { _in: STAFF_ORG_PATH } } } },
		{ user: { client_portal_users: { organization: { _in: PORTAL_ORG_PATH } } } },
	],
};

async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
	const r = await fetch(URL + path, {
		...init,
		headers: {
			Authorization: `Bearer ${TOKEN}`,
			'Content-Type': 'application/json',
			...(init?.headers || {}),
		},
	});
	if (!r.ok) {
		const body = await r.text().catch(() => '');
		throw new Error(`${r.status} ${r.statusText} on ${init?.method || 'GET'} ${path}\n${body}`);
	}
	if (r.status === 204) return undefined as any;
	return (await r.json()).data as T;
}

async function ensureReverseRelationField() {
	// `/relations` ignores `filter[…]` params, so we list and pick client-side.
	const all = await api<any[]>('/relations?limit=-1');
	const rel = all.find(
		(r) => r.collection === 'client_portal_users' && r.field === 'user',
	);
	if (!rel) {
		throw new Error('client_portal_users.user relation not found.');
	}
	if (rel.meta?.one_field === 'client_portal_users') {
		console.log('✓ Reverse o2m directus_users.client_portal_users already exposed.');
		return;
	}
	console.log(
		`Will set client_portal_users.user.meta.one_field = 'client_portal_users' ` +
			`(currently: ${rel.meta?.one_field ?? '—'})`,
	);
	if (!APPLY) return;
	await api(`/relations/client_portal_users/user`, {
		method: 'PATCH',
		body: JSON.stringify({ meta: { ...(rel.meta || {}), one_field: 'client_portal_users' } }),
	});
	console.log('  ✓ patched relation');
}

async function rewriteCommentPerms() {
	const policyIds = [POLICY.PORTAL, POLICY.CLIENT_MANAGER];
	const filterStr = policyIds.map(encodeURIComponent).join(',');
	const perms = await api<any[]>(
		'/permissions?fields=id,policy,collection,action,permissions' +
			`&filter[policy][_in]=${filterStr}` +
			'&filter[collection][_eq]=comments' +
			'&filter[action][_in]=read,create,update,delete' +
			'&limit=-1',
	);

	if (perms.length === 0) {
		console.log('⚠ No comment perms found on portal/staff policies — nothing to rewrite.');
		return;
	}

	const desired = JSON.stringify(AUTHOR_ORG_FILTER_BIDIRECTIONAL);
	const toPatch = perms.filter((p) => JSON.stringify(p.permissions) !== desired);

	if (toPatch.length === 0) {
		console.log('✓ All comment perm filters already match the bidirectional shape.');
		return;
	}

	console.log(`Will patch ${toPatch.length} comment perm row(s):`);
	for (const p of toPatch) {
		const which = p.policy === POLICY.PORTAL ? 'Portal' : 'ClientManager';
		console.log(`  ~ ${which} comments.${p.action} (id=${p.id})`);
	}

	if (!APPLY) return;
	for (const p of toPatch) {
		await api(`/permissions/${p.id}`, {
			method: 'PATCH',
			body: JSON.stringify({ permissions: AUTHOR_ORG_FILTER_BIDIRECTIONAL }),
		});
		console.log(`  ✓ patched perm id=${p.id} (${p.collection}.${p.action})`);
	}
}

(async () => {
	console.log(`mode: ${APPLY ? 'APPLY' : 'dry-run'}\n`);
	console.log('Step 1: expose directus_users.client_portal_users reverse o2m');
	await ensureReverseRelationField();
	console.log('\nStep 2: rewrite comment row filters');
	await rewriteCommentPerms();
	console.log(`\nDone.${APPLY ? '' : ' Pass --apply to commit.'}`);
})();
