#!/usr/bin/env npx tsx
/**
 * Directus contact_connections — Permissions Setup Script
 *
 * Grants non-admin app roles CRUD access on the contact_connections
 * collection introduced by setup-contact-connections-collection.ts.
 *
 * Permission model:
 *   - Admin:                Full access (admin_access bypass — no explicit rules)
 *   - Any non-admin role:   CRUD on contact_connections (no row filter)
 *   - Public:               No access
 *
 * Rationale: connections are organization-scoped via the contact+client
 * they reference. Anyone authenticated in the org who can CRUD contacts
 * should be able to CRUD their connections. We don't filter further at
 * the policy level because both FKs already live inside the org's data
 * plane — a user who can't read the parent Contact can't meaningfully
 * create a connection against it anyway.
 *
 * Safety:
 *   - Dry-run by default. Use --apply to write.
 *   - Idempotent: skips if permission already exists.
 *   - Additive only: never removes or modifies existing permissions.
 *   - Skips admin role.
 *
 * Usage:
 *   pnpm tsx scripts/setup-contact-connections-permissions.ts          # dry-run
 *   pnpm tsx scripts/setup-contact-connections-permissions.ts --apply  # write
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

interface AccessEntry {
	id: string;
	role: string | null;
	policy: string | { id: string } | null;
}

interface PermissionRule {
	collection: string;
	action: 'create' | 'read' | 'update' | 'delete';
	permissions: Record<string, unknown> | null;
	validation: Record<string, unknown> | null;
	presets: Record<string, unknown> | null;
	fields: string[] | null;
}

async function findPolicyForRole(roleId: string): Promise<string | null> {
	const { data: accessEntries } = await directusRequest<AccessEntry[]>(
		`/access?filter[role][_eq]=${roleId}&fields=id,role,policy.id,policy.name,policy.admin_access`,
	);
	if (accessEntries) {
		for (const entry of accessEntries) {
			const policy = entry.policy;
			if (!policy) continue;
			return typeof policy === 'string' ? policy : policy.id;
		}
	}
	return null;
}

async function getNonAdminRoles(): Promise<Array<{ id: string; name: string }>> {
	const { data: roles } = await directusRequest<Array<{ id: string; name: string }>>(
		`/roles?fields=id,name&filter[id][_neq]=${ADMIN_ROLE_ID}`,
	);
	return roles || [];
}

async function collectionExists(collection: string): Promise<boolean> {
	const { status } = await directusRequest(`/collections/${collection}`);
	return status === 200;
}

async function permissionExists(
	policyId: string,
	collection: string,
	action: string,
): Promise<boolean> {
	const { data } = await directusRequest<unknown[]>(
		`/permissions?filter[policy][_eq]=${policyId}&filter[collection][_eq]=${collection}&filter[action][_eq]=${action}&limit=1`,
	);
	return data !== null && data.length > 0;
}

async function createPermission(
	policyId: string,
	rule: PermissionRule,
): Promise<'created' | 'skipped' | 'failed' | 'dry-run'> {
	const exists = await permissionExists(policyId, rule.collection, rule.action);
	if (exists) {
		console.log(`    [skip]  ${rule.collection}.${rule.action} — already exists`);
		return 'skipped';
	}

	if (!APPLY) {
		console.log(`    [would] ${rule.collection}.${rule.action}`);
		return 'dry-run';
	}

	const { error } = await directusRequest('/permissions', 'POST', {
		policy: policyId,
		collection: rule.collection,
		action: rule.action,
		permissions: rule.permissions,
		validation: rule.validation,
		presets: rule.presets,
		fields: rule.fields,
	});

	if (error) {
		console.error(`    [fail]  ${rule.collection}.${rule.action}: ${error}`);
		return 'failed';
	}

	console.log(`    [ok]    ${rule.collection}.${rule.action}`);
	return 'created';
}

function contactConnectionsPermissions(): PermissionRule[] {
	return (['create', 'read', 'update', 'delete'] as const).map((action) => ({
		collection: 'contact_connections',
		action,
		permissions: null,
		validation: null,
		presets: null,
		fields: ['*'],
	}));
}

async function main() {
	console.log('==========================================');
	console.log('  contact_connections — Perms');
	console.log('==========================================');
	console.log(`Target: ${DIRECTUS_URL}`);
	console.log(`Mode:   ${APPLY ? 'APPLY (writing permissions)' : 'DRY-RUN (no changes)'}\n`);

	const { error: pingError } = await directusRequest('/server/info');
	if (pingError) {
		console.error(`Cannot connect to Directus: ${pingError}`);
		process.exit(1);
	}
	console.log('Connected to Directus\n');

	const exists = await collectionExists('contact_connections');
	if (!exists) {
		console.error('  [missing] contact_connections collection not found.');
		console.error('  Run setup-contact-connections-collection.ts first.');
		process.exit(1);
	}
	console.log('  [verified] contact_connections collection exists\n');

	const roles = await getNonAdminRoles();
	console.log(`Found ${roles.length} non-admin role(s):`);
	for (const role of roles) {
		console.log(`  - ${role.name} (${role.id})`);
	}
	console.log('');

	let totalCreated = 0;
	let totalSkipped = 0;
	let totalDryRun = 0;
	let totalFailed = 0;

	for (const role of roles) {
		console.log(`\n--- ${role.name} ---`);
		const policyId = await findPolicyForRole(role.id);
		if (!policyId) {
			console.log(`  No policy found for ${role.name}. Skipping.`);
			continue;
		}
		console.log(`  Using policy: ${policyId}`);

		for (const rule of contactConnectionsPermissions()) {
			const result = await createPermission(policyId, rule);
			if (result === 'created') totalCreated++;
			else if (result === 'skipped') totalSkipped++;
			else if (result === 'dry-run') totalDryRun++;
			else totalFailed++;
		}
	}

	console.log('\n==========================================');
	console.log('  Summary');
	console.log('==========================================');
	console.log(`  Created: ${totalCreated}`);
	console.log(`  Skipped: ${totalSkipped}`);
	console.log(`  Dry-run: ${totalDryRun}`);
	console.log(`  Failed:  ${totalFailed}`);
	if (!APPLY && totalDryRun > 0) {
		console.log('\n  Re-run with --apply to persist.');
	}

	process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((err) => {
	console.error('Unhandled error:', err);
	process.exit(1);
});
