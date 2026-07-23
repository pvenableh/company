#!/usr/bin/env npx tsx
/**
 * Migrate existing client-portal users onto the dedicated low-privilege
 * "Client Portal" Directus role (see setup-portal-role.ts).
 *
 * Historically portal users were spread across the Client role, the shared
 * Client Manager role, and (for pending invites) no role at all. The Client +
 * Client Manager policies carry ~120 unrestricted permission rows that leak
 * agency data across orgs to anyone holding those roles. This moves every
 * portal user to the tight portal role so "portal = read-only on agency data"
 * is enforced at the Directus level.
 *
 * TWO leak vectors are closed per user:
 *   1. ROLE: reassign directus_users.role → the Client Portal role (drops the
 *      Client / Client Manager policies inherited via the role).
 *   2. DIRECT POLICY ATTACHMENT: delete any `directus_access` row that pins the
 *      Client or Client Manager policy DIRECTLY to the user. 13 portal users had
 *      the Client policy attached at the user level — changing the role does NOT
 *      remove those, and the leak persists until the access row is deleted
 *      (verified live: dnolan stayed fully leaking after the role change alone).
 *
 * GUARDS (never demote a real staff/admin account):
 *   - Skip any user who ALSO has an `org_memberships` row (dual staff + portal).
 *   - Skip any user currently on the Administrator role.
 *   - Only ever delete DIRECT attachments of the two low-trust shared policies
 *     (Client / Client Manager) — never Administrator or anything else.
 *
 * Reassigning a role does not invalidate sessions; the role is looked up fresh
 * on each request, so message posting picks up the new `messages [create]`
 * grant immediately.
 *
 *   pnpm tsx scripts/migrate-portal-users-role.ts --dry   # preview only
 *   pnpm tsx scripts/migrate-portal-users-role.ts          # apply
 */
import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!DIRECTUS_TOKEN) { console.error('DIRECTUS_SERVER_TOKEN required'); process.exit(1); }

const PORTAL_ROLE_ID = process.env.NUXT_PUBLIC_DIRECTUS_ROLE_PORTAL || '';
if (!PORTAL_ROLE_ID) { console.error('NUXT_PUBLIC_DIRECTUS_ROLE_PORTAL required (run setup-portal-role.ts first)'); process.exit(1); }

const ADMIN_ROLE_ID = process.env.NUXT_PUBLIC_ADMIN_ROLE_ID || '3a63a4e1-c82e-46f8-9993-7f11ac6a4b01';
const DRY = process.argv.includes('--dry');

// The two shared low-trust policies that leak agency data. We delete ONLY direct
// (user-level) attachments of these — never role-level rows, never other policies.
const LEAKY_POLICY_IDS = new Set([
	'cdadd1fd-280e-4d4a-83e6-1b911889af46', // Client
	'012beff9-150c-49e9-a284-1a7e2757e0dd', // Client Manager
]);

async function req<T = unknown>(path: string, method: 'GET' | 'PATCH' | 'DELETE' = 'GET', body?: unknown): Promise<{ data: T | null; error: string | null }> {
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

async function main() {
	console.log(`Migrate portal users → Client Portal role @ ${DIRECTUS_URL}${DRY ? '  [DRY RUN]' : ''}`);
	console.log(`  portal role: ${PORTAL_ROLE_ID}\n`);

	// Distinct portal user ids, with their current role expanded.
	const { data: rows, error } = await req<Array<{ user: { id: string; email: string; role: string | { id: string } | null } | null }>>(
		'/items/client_portal_users?fields=user.id,user.email,user.role&limit=-1',
	);
	if (error || !rows) { console.error(`Failed to read client_portal_users: ${error}`); process.exit(1); }

	const byId = new Map<string, { email: string; roleId: string | null }>();
	for (const r of rows) {
		const u = r.user;
		if (!u?.id) continue;
		const roleId = typeof u.role === 'object' ? (u.role?.id ?? null) : (u.role ?? null);
		if (!byId.has(u.id)) byId.set(u.id, { email: u.email, roleId });
	}
	console.log(`Distinct portal users: ${byId.size}\n`);

	let changed = 0, alreadyClean = 0, skippedStaff = 0, skippedAdmin = 0, failed = 0;
	let rolesSet = 0, attachDeleted = 0;

	for (const [userId, info] of byId) {
		const tag = `${info.email || userId} (${userId.slice(0, 8)})`;

		// Never touch a real admin account.
		if (info.roleId === ADMIN_ROLE_ID) {
			console.log(`  [skip-admin] ${tag} — currently Administrator, leaving untouched`);
			skippedAdmin++;
			continue;
		}

		// Dual staff/portal guard: any org_memberships row means this account is
		// also internal staff and must keep its staff role + policies.
		const { data: memberships } = await req<Array<{ id: string }>>(
			`/items/org_memberships?filter[user][_eq]=${userId}&fields=id&limit=1`,
		);
		if (memberships?.length) {
			console.log(`  [skip-staff] ${tag} — has org_memberships, leaving untouched`);
			skippedStaff++;
			continue;
		}

		// Vector 1 — role.
		const needsRole = info.roleId !== PORTAL_ROLE_ID;

		// Vector 2 — direct (user-level) attachments of the leaky shared policies.
		// NOTE: directus_access is a system collection — it is reachable via the
		// dedicated `/access` endpoint, NOT `/items/directus_access` (that 403s
		// even for the server token). A query error must fail this user, never be
		// silently treated as "no attachments" (that would leave the leak open).
		const { data: accessRows, error: accessErr } = await req<Array<{ id: string; policy: string | { id: string } | null }>>(
			`/access?filter[user][_eq]=${userId}&fields=id,policy&limit=-1`,
		);
		if (accessErr) {
			console.error(`  [fail] ${tag} read access rows: ${accessErr}`);
			failed++;
			continue;
		}
		const leakyDirect = (accessRows ?? []).filter((a) => {
			const pid = typeof a.policy === 'object' ? a.policy?.id : a.policy;
			return pid && LEAKY_POLICY_IDS.has(pid);
		});

		if (!needsRole && leakyDirect.length === 0) { alreadyClean++; continue; }

		if (DRY) {
			const parts = [];
			if (needsRole) parts.push(`role ${info.roleId ?? 'none'} → portal`);
			if (leakyDirect.length) parts.push(`delete ${leakyDirect.length} direct policy attach`);
			console.log(`  [would] ${tag}  ${parts.join(', ')}`);
			if (needsRole) rolesSet++;
			attachDeleted += leakyDirect.length;
			changed++;
			continue;
		}

		let ok = true;
		if (needsRole) {
			const { error: patchErr } = await req(`/users/${userId}`, 'PATCH', { role: PORTAL_ROLE_ID });
			if (patchErr) { console.error(`  [fail] ${tag} role: ${patchErr}`); ok = false; }
			else rolesSet++;
		}
		for (const a of leakyDirect) {
			const { error: delErr } = await req(`/access/${a.id}`, 'DELETE');
			if (delErr) { console.error(`  [fail] ${tag} delete access ${a.id}: ${delErr}`); ok = false; }
			else attachDeleted++;
		}

		if (!ok) { failed++; continue; }
		const parts = [];
		if (needsRole) parts.push(`role → portal`);
		if (leakyDirect.length) parts.push(`-${leakyDirect.length} direct attach`);
		console.log(`  [ok] ${tag}  ${parts.join(', ')}`);
		changed++;
	}

	console.log(
		`\nDone.${DRY ? ' (dry run)' : ''} ${changed} ${DRY ? 'would change' : 'changed'} ` +
		`(${rolesSet} role sets, ${attachDeleted} direct attachments ${DRY ? 'to delete' : 'deleted'}), ` +
		`${alreadyClean} already-clean, ${skippedStaff} staff-skipped, ${skippedAdmin} admin-skipped, ${failed} failed.`,
	);
	if (failed) process.exit(1);
}

main().catch((err) => { console.error('Migration failed:', err); process.exit(1); });
