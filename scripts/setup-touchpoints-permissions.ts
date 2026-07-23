#!/usr/bin/env npx tsx
/**
 * touchpoints — Permissions Setup
 *
 * Grants every non-admin role full CRUD scoped to the user's organizations via
 * the denormalized, always-populated `organization` column:
 *   { organization: { _in: '$CURRENT_USER.organizations.organizations_id' } }
 *
 * Unlike project_touchpoints (which FK-walked `project.organization` for reads),
 * `touchpoints.project` is now nullable — a client-only touch has no project —
 * so all four actions key on the direct `organization` column instead.
 *
 * Idempotent — re-running is safe.
 *   pnpm tsx scripts/setup-touchpoints-permissions.ts
 */
import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!DIRECTUS_TOKEN) { console.error('DIRECTUS_SERVER_TOKEN required'); process.exit(1); }

const ADMIN_ROLE_ID = '3a63a4e1-c82e-46f8-9993-7f11ac6a4b01';
const COLLECTION = 'touchpoints';

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
const ORG_FILTER = { organization: ORG_IN };

const RULES: Rule[] = [
	{ action: 'create', permissions: ORG_FILTER, fields: ['*'] },
	{ action: 'read', permissions: ORG_FILTER, fields: ['*'] },
	{ action: 'update', permissions: ORG_FILTER, fields: ['*'] },
	{ action: 'delete', permissions: ORG_FILTER, fields: null },
];

// The m2m junction inherits access from the parent; grant it CRUD too so tagging
// contacts on a touchpoint works for non-admins.
const JUNCTION = 'touchpoints_contacts';
const JUNCTION_RULES: Rule[] = [
	{ action: 'create', permissions: {}, fields: ['*'] },
	{ action: 'read', permissions: {}, fields: ['*'] },
	{ action: 'update', permissions: {}, fields: ['*'] },
	{ action: 'delete', permissions: {}, fields: null },
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

async function findPermission(policyId: string, collection: string, action: string) {
	const { data } = await req<Array<{ id: string; permissions: unknown; fields: string[] | null }>>(
		`/permissions?filter[policy][_eq]=${policyId}&filter[collection][_eq]=${collection}&filter[action][_eq]=${action}&limit=1`,
	);
	return data?.[0] ?? null;
}

async function upsert(policyId: string, collection: string, rule: Rule) {
	const existing = await findPermission(policyId, collection, rule.action);
	if (!existing) {
		const { error } = await req('/permissions', 'POST', { policy: policyId, collection, action: rule.action, permissions: rule.permissions, validation: null, presets: null, fields: rule.fields });
		if (error) { console.error(`    [fail] ${collection}.${rule.action}: ${error}`); return 'failed'; }
		console.log(`    [ok]   ${collection}.${rule.action} created`);
		return 'created';
	}
	const same = JSON.stringify(existing.permissions || null) === JSON.stringify(rule.permissions || null)
		&& JSON.stringify(existing.fields || null) === JSON.stringify(rule.fields || null);
	if (same) { console.log(`    [skip] ${collection}.${rule.action} up-to-date`); return 'unchanged'; }
	const { error } = await req(`/permissions/${existing.id}`, 'PATCH', { permissions: rule.permissions, fields: rule.fields });
	if (error) { console.error(`    [fail] ${collection}.${rule.action}: ${error}`); return 'failed'; }
	console.log(`    [ok]   ${collection}.${rule.action} updated`);
	return 'updated';
}

async function main() {
	console.log(`touchpoints — Permissions Setup @ ${DIRECTUS_URL}\n`);
	const roles = await getNonAdminRoles();
	let failed = 0;
	for (const role of roles) {
		console.log(`--- ${role.name} ---`);
		const policyId = await findPolicyForRole(role.id);
		if (!policyId) { console.log('  no policy attached; skipping'); continue; }
		for (const rule of RULES) if (await upsert(policyId, COLLECTION, rule) === 'failed') failed++;
		for (const rule of JUNCTION_RULES) if (await upsert(policyId, JUNCTION, rule) === 'failed') failed++;
	}
	console.log(failed ? `\nDone with ${failed} failure(s).` : '\nDone.');
	if (failed) process.exit(1);
}

main().catch((err) => { console.error('Setup failed:', err); process.exit(1); });
