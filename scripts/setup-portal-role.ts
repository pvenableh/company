#!/usr/bin/env npx tsx
/**
 * Create a dedicated low-privilege "Client Portal" Directus role + policy.
 *
 * WHY: portal (client) users currently authenticate as the shared **Client
 * Manager** role, which carries the Client + Client Manager policies — ~120
 * unrestricted (`{}` / null-filter) permission rows that leak agency data
 * across orgs (goals, all directus_users, directus_activity, comments, …). The
 * "no org junction" trick only neutralises *org-scoped* rules, not these.
 *
 * Portal reads all run on the **server token** (`requirePortalContext` +
 * `/api/portal/*`, incl. the whitelisted `portal/items.post.ts` proxy). Portal
 * pages never use the generic `/api/directus` proxy. The ONLY thing a portal
 * user's own token does is:
 *   1. Login `/users/me` hydration — `directusGetMe(token, ['*','role.id','role.name','avatar.id'])`
 *      → needs directus_users read (self) + directus_roles read + directus_files read.
 *   2. Post a channel message — `server/api/portal/message.post.ts` inserts a
 *      `messages` row on the caller token → needs messages [create]
 *      (row-filter decorative; real gate is the admin-token channel-scope check).
 *
 * So this policy grants ONLY those four things. Everything else a portal user
 * sees comes through server-token endpoints and is unaffected.
 *
 * Idempotent — find-or-create for policy/role/access, upsert for permissions.
 * Safe to re-run. Prints the new role id for NUXT_PUBLIC_DIRECTUS_ROLE_PORTAL.
 *   pnpm tsx scripts/setup-portal-role.ts
 */
import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!DIRECTUS_TOKEN) { console.error('DIRECTUS_SERVER_TOKEN required'); process.exit(1); }

const POLICY_NAME = 'Client Portal';
const ROLE_NAME = 'Client Portal';
const ROLE_ICON = 'badge'; // decorative

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

interface Rule { collection: string; action: 'create' | 'read' | 'update' | 'delete'; permissions: Record<string, unknown> | null; fields: string[] | null; }

// The complete permission surface for a portal user's OWN token. Nothing here
// exposes cross-org agency data.
const RULES: Rule[] = [
	// /users/me hydration — read own record only.
	{ collection: 'directus_users', action: 'read', permissions: { id: { _eq: '$CURRENT_USER' } }, fields: ['*'] },
	// Login expands role.id/role.name; role names are not sensitive. Unrestricted
	// read matches the known-good baseline (the old Client policy granted this)
	// and guarantees the session `role` isn't silently nulled.
	{ collection: 'directus_roles', action: 'read', permissions: {}, fields: ['id', 'name'] },
	// Avatars + org logos rendered via <img src="/assets/:id"> carry the user's
	// cookie, so Directus checks their file-read perm. Files are low-sensitivity;
	// the old Client policy granted read {} too.
	{ collection: 'directus_files', action: 'read', permissions: {}, fields: ['*'] },
	// The single write a portal user makes on their own token.
	{ collection: 'messages', action: 'create', permissions: {}, fields: ['*'] },
];

async function findByName(collection: string, name: string): Promise<any | null> {
	const { data } = await req<any[]>(`/${collection}?filter[name][_eq]=${encodeURIComponent(name)}&limit=1`);
	return data?.[0] ?? null;
}

async function ensurePolicy(): Promise<string> {
	const existing = await findByName('policies', POLICY_NAME);
	if (existing) { console.log(`  policy exists: ${existing.id}`); return existing.id; }
	const { data, error } = await req<any>('/policies', 'POST', {
		name: POLICY_NAME,
		icon: 'lock',
		description: 'Low-privilege policy for client-portal users. Reads run on the server token via /api/portal/*; this grants only self /users/me, role-name expansion, file assets, and message create.',
		admin_access: false,
		app_access: true,
		enforce_tfa: false,
	});
	if (error || !data) throw new Error(`create policy failed: ${error}`);
	console.log(`  policy created: ${data.id}`);
	return data.id;
}

async function findPermission(policyId: string, collection: string, action: string) {
	const { data } = await req<any[]>(
		`/permissions?filter[policy][_eq]=${policyId}&filter[collection][_eq]=${collection}&filter[action][_eq]=${action}&limit=1`,
	);
	return data?.[0] ?? null;
}

async function upsertPermission(policyId: string, rule: Rule) {
	const existing = await findPermission(policyId, rule.collection, rule.action);
	if (!existing) {
		const { error } = await req('/permissions', 'POST', {
			policy: policyId, collection: rule.collection, action: rule.action,
			permissions: rule.permissions, validation: null, presets: null, fields: rule.fields,
		});
		if (error) { console.error(`    [fail] ${rule.collection}.${rule.action}: ${error}`); return false; }
		console.log(`    [ok]   ${rule.collection}.${rule.action} created`);
		return true;
	}
	const same = JSON.stringify(existing.permissions || null) === JSON.stringify(rule.permissions || null)
		&& JSON.stringify(existing.fields || null) === JSON.stringify(rule.fields || null);
	if (same) { console.log(`    [skip] ${rule.collection}.${rule.action} up-to-date`); return true; }
	const { error } = await req(`/permissions/${existing.id}`, 'PATCH', { permissions: rule.permissions, fields: rule.fields });
	if (error) { console.error(`    [fail] ${rule.collection}.${rule.action}: ${error}`); return false; }
	console.log(`    [ok]   ${rule.collection}.${rule.action} updated`);
	return true;
}

async function ensureRole(): Promise<string> {
	const existing = await findByName('roles', ROLE_NAME);
	if (existing) { console.log(`  role exists: ${existing.id}`); return existing.id; }
	const { data, error } = await req<any>('/roles', 'POST', {
		name: ROLE_NAME,
		icon: ROLE_ICON,
		description: 'Client-portal users. Access is enforced server-side via client_portal_users + /api/portal/*; this Directus role is intentionally low-privilege.',
	});
	if (error || !data) throw new Error(`create role failed: ${error}`);
	console.log(`  role created: ${data.id}`);
	return data.id;
}

async function ensureAccess(roleId: string, policyId: string) {
	const { data } = await req<any[]>(`/access?filter[role][_eq]=${roleId}&filter[policy][_eq]=${policyId}&limit=1`);
	if (data?.length) { console.log(`  access row exists`); return; }
	const { error } = await req('/access', 'POST', { role: roleId, policy: policyId, sort: 1 });
	if (error) throw new Error(`create access failed: ${error}`);
	console.log(`  access row created (role → policy)`);
}

async function main() {
	console.log(`Setup Client Portal role/policy @ ${DIRECTUS_URL}\n`);

	console.log('Policy:');
	const policyId = await ensurePolicy();
	for (const rule of RULES) await upsertPermission(policyId, rule);

	console.log('\nRole:');
	const roleId = await ensureRole();
	await ensureAccess(roleId, policyId);

	console.log('\nDone.');
	console.log('\n──────────────────────────────────────────────────────────');
	console.log(`  Set in .env:  NUXT_PUBLIC_DIRECTUS_ROLE_PORTAL=${roleId}`);
	console.log('──────────────────────────────────────────────────────────');
}

main().catch((err) => { console.error('Setup failed:', err); process.exit(1); });
