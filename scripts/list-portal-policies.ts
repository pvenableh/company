// scripts/list-portal-policies.ts — read-only: list the portal role's policies.
import 'dotenv/config';
const URL = (process.env.NUXT_PUBLIC_DIRECTUS_URL || process.env.DIRECTUS_URL || '').replace(/\/$/, '');
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
const ROLE_PORTAL = process.env.NUXT_PUBLIC_DIRECTUS_ROLE_PORTAL || '';

async function api(path: string) {
	const r = await fetch(`${URL}${path}`, { headers: { authorization: `Bearer ${TOKEN}` } });
	if (!r.ok) throw new Error(`${r.status} ${path}: ${(await r.text()).slice(0, 200)}`);
	return (await r.json()).data;
}
async function main() {
	const access = await api(`/access?filter[role][_eq]=${ROLE_PORTAL}&fields=id,policy&limit=-1`);
	for (const a of access) {
		const p = await api(`/policies/${a.policy}?fields=id,name,description,app_access,admin_access,ip_access`).catch(() => null);
		const permCount = (await api(`/permissions?filter[policy][_eq]=${a.policy}&fields=id&limit=-1`).catch(() => [])).length;
		console.log(JSON.stringify({ policy: a.policy, name: p?.name, app_access: p?.app_access, admin_access: p?.admin_access, permCount }));
	}
}
main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
