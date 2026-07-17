#!/usr/bin/env npx tsx
/**
 * project_touchpoints — Permissions Setup
 *
 * Grants every non-admin role full CRUD scoped to the user's organizations:
 *   - create: filter on the denormalized `organization` field (Directus 11
 *             cannot FK-walk on create, so we key on a direct column).
 *             { organization: { _in: '$CURRENT_USER.organizations.organizations_id' } }
 *   - read / update / delete: FK-walk through `project.organization` so a user
 *             only touches touchpoints on projects in an org they belong to.
 *
 * Idempotent — re-running is safe.
 *
 * Run:
 *   pnpm tsx scripts/setup-project-touchpoints-permissions.ts
 */
import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!DIRECTUS_TOKEN) { console.error('DIRECTUS_SERVER_TOKEN required'); process.exit(1); }

const ADMIN_ROLE_ID = '3a63a4e1-c82e-46f8-9993-7f11ac6a4b01';
const COLLECTION = 'project_touchpoints';

async function req<T = unknown>(path: string, method: 'GET' | 'POST' | 'PATCH' = 'GET', body?: unknown): Promise<{ data: T | null; error: string | null }> {
	try {
		const r = await fetch(`${DIRECTUS_URL}${path}`, {
			method,
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DIRECTUS_TOKEN}` },
			body: body ? JSON.stringify(body) : undefined,
		});
		const text = await r.text();
		if (!r.ok) return { data: null, error: `${r.status}: ${text}` };
		const json = text ? JSON.parse(text) : {};
		return { data: (json.data ?? null) as T, error: null };
	} catch (err) { return { data: null, error: String(err) }; }
}

interface Rule { action: 'create' | 'read' | 'update' | 'delete'; permissions: Record<string, unknown> | null; fields: string[] | null; }

const ORG_IN = { _in: '$CURRENT_USER.organizations.organizations_id' };
const CREATE_FILTER = { organization: ORG_IN };
const WALK_FILTER = { project: { organization: ORG_IN } };

const RULES: Rule[] = [
	{ action: 'create', permissions: CREATE_FILTER, fields: ['*'] },
	{ action: 'read', permissions: WALK_FILTER, fields: ['*'] },
	{ action: 'update', permissions: WALK_FILTER, fields: ['*'] },
	{ action: 'delete', permissions: WALK_FILTER, fields: null },
];

async function findPolicyForRole(roleId: string): Promise<string | null> {
	const { data } = await req<Array<{ policy: string | { id: string } | null }>>(`/access?filter[role][_eq]=${roleId}&fields=id,role,policy.id`);
	if (!data?.length) return null;
	for (const entry of data) {
		const p = entry.policy;
		if (!p) continue;
		return typeof p === 'string' ? p : p.id;
	}
	return null;
}

async function getNonAdminRoles() {
	const { data } = await req<Array<{ id: string; name: string }>>(`/roles?fields=id,name&filter[id][_neq]=${ADMIN_ROLE_ID}`);
	return data || [];
}

async function findPermission(policyId: string, action: string) {
	const { data } = await req<Array<{ id: string; permissions: unknown; fields: string[] | null }>>(
		`/permissions?filter[policy][_eq]=${policyId}&filter[collection][_eq]=${COLLECTION}&filter[action][_eq]=${action}&limit=1`,
	);
	return data?.[0] ?? null;
}

async function upsert(policyId: string, rule: Rule) {
	const existing = await findPermission(policyId, rule.action);
	if (!existing) {
		const { error } = await req('/permissions', 'POST', { policy: policyId, collection: COLLECTION, action: rule.action, permissions: rule.permissions, validation: null, presets: null, fields: rule.fields });
		if (error) { console.error(`    [fail] ${rule.action}: ${error}`); return 'failed'; }
		console.log(`    [ok]   ${rule.action} created`);
		return 'created';
	}
	const same = JSON.stringify(existing.permissions || null) === JSON.stringify(rule.permissions || null)
		&& JSON.stringify(existing.fields || null) === JSON.stringify(rule.fields || null);
	if (same) { console.log(`    [skip] ${rule.action} up-to-date`); return 'unchanged'; }
	const { error } = await req(`/permissions/${existing.id}`, 'PATCH', { permissions: rule.permissions, fields: rule.fields });
	if (error) { console.error(`    [fail] ${rule.action}: ${error}`); return 'failed'; }
	console.log(`    [ok]   ${rule.action} updated`);
	return 'updated';
}

async function main() {
	console.log(`project_touchpoints — Permissions Setup @ ${DIRECTUS_URL}\n`);
	const roles = await getNonAdminRoles();
	let failed = 0;
	for (const role of roles) {
		console.log(`--- ${role.name} ---`);
		const policyId = await findPolicyForRole(role.id);
		if (!policyId) { console.log('  no policy attached; skipping'); continue; }
		for (const rule of RULES) {
			const res = await upsert(policyId, rule);
			if (res === 'failed') failed++;
		}
	}
	console.log(failed ? `\nDone with ${failed} failure(s).` : '\nDone.');
	if (failed) process.exit(1);
}

main().catch((err) => { console.error('Setup failed:', err); process.exit(1); });
