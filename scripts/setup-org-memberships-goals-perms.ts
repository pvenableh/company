#!/usr/bin/env npx tsx
/**
 * Directus org_memberships + team_goals — Permissions Setup Script
 *
 * Grants app roles read/write access to two collections that the conformance
 * pass uncovered as blocked (403 "doesn't have permission or collection does
 * not exist"):
 *
 *   - org_memberships: client code (useOrgRole, useOrganization, useFilteredUsers,
 *     useTimeTracker, /organization pages) queries this to resolve the current
 *     user's role + org. Without read access, the app hits a cascading 500 on
 *     every authenticated request and /proposals renders as "Broken" on cold
 *     load.
 *   - team_goals: the Teams detail page's Goals card. Without create/update/
 *     delete, Pass 6's GoalFormModal renders but can't save.
 *
 * Permission model:
 *   - Admin:          Full access (admin_access bypass — no explicit rules)
 *   - Client Manager: org_memberships CRUD scoped to own org, team_goals CRUD
 *   - Regular User:   org_memberships READ own rows only, team_goals CRUD
 *   - Public:         No access
 *
 * org_memberships row filter (non-admin users):
 *   { user: { _eq: '$CURRENT_USER' } }
 * — a user only sees their own membership rows. Sufficient because
 *   useOrgRole's client-side filter already scopes to the current user anyway;
 *   this just enforces it at the data layer.
 *
 * team_goals has no row filter for now. Can be tightened to team.organization
 * membership later if needed; for the conformance pass, unblocking goal CRUD
 * for authenticated users is the goal.
 *
 * Safety:
 *   - Dry-run by default (prints what would happen). Use --apply to write.
 *   - Idempotent: skips if permission already exists (never duplicates).
 *   - Additive only: never removes or modifies existing permissions.
 *   - Skips admin role (admin_access bypass makes explicit rules redundant).
 *
 * Usage:
 *   pnpm tsx scripts/setup-org-memberships-goals-perms.ts          # dry-run
 *   pnpm tsx scripts/setup-org-memberships-goals-perms.ts --apply  # write
 *
 * Prerequisites:
 *   - DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN env var set
 *   - org_memberships + team_goals collections exist in Directus schema
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
const CLIENT_MANAGER_ROLE_ID = '7b62b285-e3a8-46ff-9e8c-d1445a3c13bb';

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
		const filter = rule.permissions ? ` filter=${JSON.stringify(rule.permissions)}` : '';
		console.log(`    [would] ${rule.collection}.${rule.action}${filter}`);
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

function orgMembershipsPermissions(_isManager: boolean): PermissionRule[] {
	// Minimal safe fix: all non-admin roles get READ scoped to their own rows.
	// Writes (create/update/delete) are intentionally not granted here — the
	// Client Manager and Client roles share a policy, so granting Manager-only
	// writes would leak to Clients. Write flows (invites, role changes) already
	// go through server routes that use DIRECTUS_SERVER_TOKEN and don't need
	// user-policy writes.
	return [
		{
			collection: 'org_memberships',
			action: 'read',
			permissions: { user: { _eq: '$CURRENT_USER' } },
			validation: null,
			presets: null,
			fields: ['*'],
		},
	];
}

function teamGoalsPermissions(): PermissionRule[] {
	// Full CRUD for all authenticated roles (team collaboration data).
	// Can be tightened to team.organization membership later if needed.
	return (['create', 'read', 'update', 'delete'] as const).map((action) => ({
		collection: 'team_goals',
		action,
		permissions: null,
		validation: null,
		presets: null,
		fields: ['*'],
	}));
}

async function main() {
	console.log('==========================================');
	console.log('  org_memberships + team_goals — Perms');
	console.log('==========================================');
	console.log(`Target: ${DIRECTUS_URL}`);
	console.log(`Mode:   ${APPLY ? 'APPLY (writing permissions)' : 'DRY-RUN (no changes)'}\n`);

	const { error: pingError } = await directusRequest('/server/info');
	if (pingError) {
		console.error(`Cannot connect to Directus: ${pingError}`);
		process.exit(1);
	}
	console.log('Connected to Directus\n');

	// Check which collections exist; skip perms for missing ones with a warning.
	const collectionAvailable: Record<string, boolean> = {};
	for (const collection of ['org_memberships', 'team_goals']) {
		const exists = await collectionExists(collection);
		collectionAvailable[collection] = exists;
		if (exists) {
			console.log(`  [verified] ${collection} collection exists`);
		} else {
			console.log(`  [missing]  ${collection} collection not found in Directus — skipping its permissions`);
		}
	}
	console.log('');

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
		const isManager = role.id === CLIENT_MANAGER_ROLE_ID;
		const label = isManager ? 'Client Manager' : 'User';
		console.log(`\n--- ${role.name} (${label}) ---`);

		const policyId = await findPolicyForRole(role.id);
		if (!policyId) {
			console.log(`  No policy found for ${role.name}. Skipping (create a policy in Directus admin first).`);
			continue;
		}
		console.log(`  Using policy: ${policyId}`);

		const allRules = [
			...(collectionAvailable.org_memberships ? orgMembershipsPermissions(isManager) : []),
			...(collectionAvailable.team_goals ? teamGoalsPermissions() : []),
		];

		for (const rule of allRules) {
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
	console.log(`  Skipped: ${totalSkipped} (already existed)`);
	console.log(`  Dry-run: ${totalDryRun} (would create — re-run with --apply)`);
	console.log(`  Failed:  ${totalFailed}`);
	if (!APPLY && totalDryRun > 0) {
		console.log('\n  Re-run with --apply to persist these permissions.');
	}

	process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((err) => {
	console.error('Unhandled error:', err);
	process.exit(1);
});
