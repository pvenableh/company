#!/usr/bin/env npx tsx
/**
 * project_digests — Permissions Setup
 *
 * Grants every non-admin role:
 *   - read:   FK-walk through `project.organization` so a user only sees
 *             digests on projects in an org they belong to.
 *             Filter: { project: { organization: { _in: '$CURRENT_USER.organizations.organizations_id' } } }
 *   - update: only on `read_at`, only when `recipient = $CURRENT_USER` —
 *             so the widget can mark a brief read but nothing else.
 *
 * Writes (create/delete) stay admin-only. The earnest-worker authenticates
 * with DIRECTUS_SERVER_TOKEN and bypasses these row filters.
 *
 * Idempotent — re-running is safe.
 *
 * Run:
 *   pnpm tsx scripts/setup-project-digests-permissions.ts
 */

import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';

if (!DIRECTUS_TOKEN) {
	console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN environment variable is required');
	process.exit(1);
}

const ADMIN_ROLE_ID = '3a63a4e1-c82e-46f8-9993-7f11ac6a4b01';
const COLLECTION = 'project_digests';

async function req<T = unknown>(
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
			return { data: null, error: `${response.status}: ${text}` };
		}
		const json = text ? JSON.parse(text) : {};
		return { data: (json.data ?? null) as T, error: null };
	} catch (err: unknown) {
		return { data: null, error: String(err) };
	}
}

interface PermissionRule {
	collection: string;
	action: 'create' | 'read' | 'update' | 'delete';
	permissions: Record<string, unknown> | null;
	validation: Record<string, unknown> | null;
	presets: Record<string, unknown> | null;
	fields: string[] | null;
}

const READ_FILTER = {
	project: {
		organization: {
			_in: '$CURRENT_USER.organizations.organizations_id',
		},
	},
};

const UPDATE_FILTER = {
	recipient: { _eq: '$CURRENT_USER' },
};

function getPermissions(): PermissionRule[] {
	return [
		{
			collection: COLLECTION,
			action: 'read',
			permissions: READ_FILTER,
			validation: null,
			presets: null,
			fields: ['*'],
		},
		{
			collection: COLLECTION,
			action: 'update',
			permissions: UPDATE_FILTER,
			validation: null,
			presets: null,
			// Only allow toggling read_at — nothing else.
			fields: ['read_at'],
		},
	];
}

async function findPolicyForRole(roleId: string): Promise<string | null> {
	const { data: accessEntries } = await req<Array<{ id: string; role: string | null; policy: string | { id: string; name: string } | null }>>(
		`/access?filter[role][_eq]=${roleId}&fields=id,role,policy.id,policy.name`,
	);
	if (!accessEntries || accessEntries.length === 0) return null;
	for (const entry of accessEntries) {
		const policy = entry.policy;
		if (!policy) continue;
		return typeof policy === 'string' ? policy : policy.id;
	}
	return null;
}

async function getNonAdminRoles(): Promise<Array<{ id: string; name: string }>> {
	const { data: roles } = await req<Array<{ id: string; name: string }>>(
		`/roles?fields=id,name&filter[id][_neq]=${ADMIN_ROLE_ID}`,
	);
	return roles || [];
}

async function findPermission(policyId: string, action: string): Promise<{ id: string; permissions: unknown; fields: string[] | null } | null> {
	const { data } = await req<Array<{ id: string; permissions: unknown; fields: string[] | null }>>(
		`/permissions?filter[policy][_eq]=${policyId}&filter[collection][_eq]=${COLLECTION}&filter[action][_eq]=${action}&limit=1`,
	);
	return data && data.length > 0 ? data[0]! : null;
}

async function upsertPermission(policyId: string, rule: PermissionRule): Promise<'created' | 'updated' | 'unchanged' | 'failed'> {
	const existing = await findPermission(policyId, rule.action);

	if (!existing) {
		const { error } = await req('/permissions', 'POST', {
			policy: policyId,
			collection: rule.collection,
			action: rule.action,
			permissions: rule.permissions,
			validation: rule.validation,
			presets: rule.presets,
			fields: rule.fields,
		});
		if (error) {
			console.error(`    [fail] ${rule.action}: ${error}`);
			return 'failed';
		}
		console.log(`    [ok]   ${rule.action} created`);
		return 'created';
	}

	const sameFilter = JSON.stringify(existing.permissions || null) === JSON.stringify(rule.permissions || null);
	const sameFields = JSON.stringify(existing.fields || null) === JSON.stringify(rule.fields || null);
	if (sameFilter && sameFields) {
		console.log(`    [skip] ${rule.action} already up-to-date`);
		return 'unchanged';
	}

	const { error } = await req(`/permissions/${existing.id}`, 'PATCH', {
		permissions: rule.permissions,
		validation: rule.validation,
		presets: rule.presets,
		fields: rule.fields,
	});
	if (error) {
		console.error(`    [fail] ${rule.action}: ${error}`);
		return 'failed';
	}
	console.log(`    [ok]   ${rule.action} updated (filter or fields changed)`);
	return 'updated';
}

async function main() {
	console.log('==========================================');
	console.log('  project_digests — Permissions Setup');
	console.log('==========================================');
	console.log(`Target: ${DIRECTUS_URL}\n`);

	// Verify connection
	const ping = await fetch(`${DIRECTUS_URL}/server/ping`, {
		headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
	});
	const pingText = await ping.text();
	if (!ping.ok || !pingText.includes('pong')) {
		console.error(`Cannot reach Directus at ${DIRECTUS_URL}: ${pingText}`);
		process.exit(1);
	}
	console.log('Connected to Directus\n');

	const roles = await getNonAdminRoles();
	console.log(`Found ${roles.length} non-admin role(s):`);
	for (const role of roles) console.log(`  - ${role.name} (${role.id})`);
	console.log('');

	const rules = getPermissions();
	let created = 0, updated = 0, unchanged = 0, failed = 0;

	for (const role of roles) {
		console.log(`\n--- ${role.name} ---`);
		const policyId = await findPolicyForRole(role.id);
		if (!policyId) {
			console.log(`  No policy attached to ${role.name}; skipping. (Create a policy in Directus admin and re-run.)`);
			continue;
		}
		console.log(`  Using policy ${policyId}`);

		for (const rule of rules) {
			const result = await upsertPermission(policyId, rule);
			if (result === 'created') created++;
			else if (result === 'updated') updated++;
			else if (result === 'unchanged') unchanged++;
			else failed++;
		}
	}

	console.log('\n==========================================');
	console.log('  Summary');
	console.log('==========================================');
	console.log(`  Created:    ${created}`);
	console.log(`  Updated:    ${updated}`);
	console.log(`  Unchanged:  ${unchanged}`);
	if (failed > 0) console.log(`  Failed:     ${failed}`);
	console.log('');

	if (failed > 0) {
		console.log('Some permissions failed. Check errors above.');
		process.exit(1);
	}

	console.log('Done.');
	console.log('');
	console.log('What was configured (per non-admin role):');
	console.log(`  ${COLLECTION}.read   — filter: project.organization in user's orgs`);
	console.log(`  ${COLLECTION}.update — filter: recipient = current user; fields: read_at only`);
	console.log('');
	console.log('Worker writes (insert digest rows + create notifications) bypass these');
	console.log('filters because the worker authenticates with DIRECTUS_SERVER_TOKEN.');
}

main().catch((err) => {
	console.error('Setup failed:', err);
	process.exit(1);
});
