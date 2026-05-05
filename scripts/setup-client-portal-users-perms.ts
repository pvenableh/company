#!/usr/bin/env npx tsx
/**
 * client_portal_users — Permissions
 *
 * Grants read access to the new collection scoped to the current user's own
 * rows. Writes are intentionally not granted to user-policies — the only
 * writers are server endpoints (invite-client, accept-invite, resend, revoke)
 * which run with DIRECTUS_SERVER_TOKEN.
 *
 *   pnpm tsx scripts/setup-client-portal-users-perms.ts          # dry-run
 *   pnpm tsx scripts/setup-client-portal-users-perms.ts --apply  # write
 *
 * Idempotent: skips rules already present.
 */

import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
const APPLY = process.argv.includes('--apply');

if (!DIRECTUS_TOKEN) {
	console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN environment variable is required');
	process.exit(1);
}

const ADMIN_ROLE_ID = '3a63a4e1-c82e-46f8-9993-7f11ac6a4b01';

async function directusRequest<T = unknown>(
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
	if (!response.ok) return { data: null, error: `${response.status}: ${text}`, status: response.status };
	const json = text ? JSON.parse(text) : {};
	return { data: (json.data ?? null) as T, error: null, status: response.status };
}

async function findPolicyForRole(roleId: string): Promise<string | null> {
	const { data } = await directusRequest<Array<{ policy: string | { id: string } | null }>>(
		`/access?filter[role][_eq]=${roleId}&fields=id,role,policy.id`,
	);
	if (!data) return null;
	for (const entry of data) {
		const p = entry.policy;
		if (!p) continue;
		return typeof p === 'string' ? p : p.id;
	}
	return null;
}

async function getNonAdminRoles() {
	const { data } = await directusRequest<Array<{ id: string; name: string }>>(
		`/roles?fields=id,name&filter[id][_neq]=${ADMIN_ROLE_ID}`,
	);
	return data || [];
}

async function permissionExists(policyId: string, action: string): Promise<boolean> {
	const { data } = await directusRequest<unknown[]>(
		`/permissions?filter[policy][_eq]=${policyId}&filter[collection][_eq]=client_portal_users&filter[action][_eq]=${action}&limit=1`,
	);
	return data !== null && data.length > 0;
}

async function ensureReadPerm(policyId: string) {
	if (await permissionExists(policyId, 'read')) {
		console.log(`    [skip]  read — already exists`);
		return 'skipped' as const;
	}
	if (!APPLY) {
		console.log(`    [would] read filter={user:{_eq:$CURRENT_USER}}`);
		return 'dry-run' as const;
	}
	const { error } = await directusRequest('/permissions', 'POST', {
		policy: policyId,
		collection: 'client_portal_users',
		action: 'read',
		permissions: { user: { _eq: '$CURRENT_USER' } },
		validation: null,
		presets: null,
		fields: ['*'],
	});
	if (error) { console.error(`    [fail]  read: ${error}`); return 'failed' as const; }
	console.log(`    [ok]    read`);
	return 'created' as const;
}

async function main() {
	console.log('==========================================');
	console.log('  client_portal_users — Permissions');
	console.log('==========================================');
	console.log(`Target: ${DIRECTUS_URL}`);
	console.log(`Mode:   ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

	const { error: pingErr } = await directusRequest('/server/info');
	if (pingErr) { console.error(`Cannot connect: ${pingErr}`); process.exit(1); }

	const roles = await getNonAdminRoles();
	console.log(`Found ${roles.length} non-admin role(s)\n`);

	const counts = { created: 0, skipped: 0, dryRun: 0, failed: 0 };

	for (const role of roles) {
		console.log(`--- ${role.name} ---`);
		const policyId = await findPolicyForRole(role.id);
		if (!policyId) {
			console.log(`  No policy attached — skipping`);
			continue;
		}
		console.log(`  policy: ${policyId}`);
		const result = await ensureReadPerm(policyId);
		counts[result === 'dry-run' ? 'dryRun' : result]++;
	}

	console.log('\n==========================================');
	console.log('  Summary');
	console.log('==========================================');
	console.log(`  Created: ${counts.created}`);
	console.log(`  Skipped: ${counts.skipped}`);
	console.log(`  Dry-run: ${counts.dryRun}`);
	console.log(`  Failed:  ${counts.failed}`);
	if (!APPLY && counts.dryRun > 0) {
		console.log('\n  Re-run with --apply to persist.');
	}
	process.exit(counts.failed > 0 ? 1 : 0);
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
