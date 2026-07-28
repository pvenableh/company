// scripts/check-self-update-perms.ts
// Read-only: reports whether the portal + user Directus roles can self-update
// directus_users (needed for clients/members to edit their own profile).
import 'dotenv/config';

const URL = (process.env.NUXT_PUBLIC_DIRECTUS_URL || process.env.DIRECTUS_URL || '').replace(/\/$/, '');
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
const ROLE_PORTAL = process.env.NUXT_PUBLIC_DIRECTUS_ROLE_PORTAL || '';
const ROLE_USER = process.env.NUXT_PUBLIC_DIRECTUS_ROLE_USER || '';

async function api(path: string) {
	const r = await fetch(`${URL}${path}`, { headers: { authorization: `Bearer ${TOKEN}` } });
	if (!r.ok) throw new Error(`${r.status} ${path}: ${(await r.text()).slice(0, 200)}`);
	return (await r.json()).data;
}

async function policiesForRole(roleId: string): Promise<string[]> {
	if (!roleId) return [];
	// directus_access links roles → policies (Directus 11)
	const access = await api(`/access?filter[role][_eq]=${roleId}&fields=policy&limit=-1`).catch(() => []);
	const ids = (access || []).map((a: any) => a.policy).filter(Boolean);
	// role.policies (directly attached) as well
	const role = await api(`/roles/${roleId}?fields=id,name,policies`).catch(() => null);
	if (role?.policies?.length) ids.push(...role.policies);
	return Array.from(new Set(ids));
}

async function usersUpdatePerms(policyIds: string[]) {
	if (!policyIds.length) return [];
	const inList = policyIds.join(',');
	return await api(`/permissions?filter[collection][_eq]=directus_users&filter[action][_eq]=update&filter[policy][_in]=${inList}&fields=id,policy,action,fields,permissions&limit=-1`).catch(() => []);
}

async function main() {
	console.log('Directus:', URL);
	for (const [label, roleId] of [['PORTAL (clients)', ROLE_PORTAL], ['USER (staff members)', ROLE_USER]] as const) {
		console.log(`\n=== ${label} — role ${roleId || '(unset)'} ===`);
		if (!roleId) { console.log('  role id not set in env'); continue; }
		const role = await api(`/roles/${roleId}?fields=id,name,admin_access`).catch(() => null);
		console.log('  role:', role?.name, '| admin_access:', role?.admin_access);
		if (role?.admin_access) { console.log('  → admin role: can self-update (all access)'); continue; }
		const policies = await policiesForRole(roleId);
		console.log('  policies:', policies.length);
		const perms = await usersUpdatePerms(policies);
		if (!perms.length) {
			console.log('  ❌ NO update permission on directus_users → self-update will 403');
		} else {
			for (const p of perms) {
				console.log('  ✅ update perm:', JSON.stringify({ fields: p.fields, filter: p.permissions }));
			}
		}
	}
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
