#!/usr/bin/env npx tsx
/**
 * Audit non-public role grants for MISSING org filters (authenticated cross-org
 * reads). See project_public_read_exposure_audit "secondary finding".
 *
 * Closing the anonymous leak left a deeper issue: some role read grants (Client /
 * Client Manager / Carddesk User) are UNFILTERED (permissions:null, fields:*), so
 * any authenticated user can read those rows ACROSS ALL ORGS. That's only a
 * problem for ORG-SCOPED collections — a reference/global table being unfiltered
 * is fine. So this classifies each unfiltered grant by whether the collection is
 * org-scoped:
 *   - DIRECT  — collection has a relation straight to `organizations`
 *   - PARENT  — collection relates to a collection that is itself org-scoped
 *               (client / lead / project / contact …) → org-scoped one hop away
 *   - NONE    — no org linkage found (likely reference/global/user-owned; review)
 *
 * DIRECT + PARENT unfiltered read grants are the cross-org leaks to fix (add an
 * org filter). READ-ONLY — reports only, changes nothing.
 *
 * Run: pnpm tsx scripts/audit-role-grant-filters.ts
 */
import 'dotenv/config';

const BASE = (process.env.DIRECTUS_URL || 'https://admin.earnest.guru').replace(/\/$/, '');
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!TOKEN) { console.error('Error: DIRECTUS_SERVER_TOKEN required'); process.exit(1); }

async function req(path: string) {
	const r = await fetch(BASE + path, { headers: { Authorization: `Bearer ${TOKEN}` } });
	const text = await r.text();
	const json = text ? JSON.parse(text) : {};
	if (!r.ok) throw new Error(json.errors?.[0]?.message || `HTTP ${r.status}`);
	return json;
}

const unfiltered = (p: any) => p == null || (typeof p === 'object' && Object.keys(p).length === 0);

async function main() {
	console.log('\n── Role-grant org-filter audit ──');
	console.log(`Target: ${BASE}\n`);

	const { data: policies } = await req('/policies?limit=-1&fields=id,name');
	const nameOf = new Map<string, string>((policies || []).map((p: any) => [p.id, p.name]));
	const isPublic = (id: string) => /public/i.test(nameOf.get(id) || '');
	const isAdmin = (id: string) => /admin/i.test(nameOf.get(id) || '');

	// Org-relationship graph from directus_relations. Directus exposes a relation
	// as { collection, field, related_collection } (the FK holder → its target).
	const { data: rels } = await req('/relations?limit=-1&fields=collection,field,related_collection');
	const directOrg = new Set<string>();          // collection → has an FK straight to organizations
	const relatesTo = new Map<string, Set<string>>();
	for (const r of rels || []) {
		const coll = r.collection, target = r.related_collection;
		if (!coll || !target) continue;
		if (!relatesTo.has(coll)) relatesTo.set(coll, new Set());
		relatesTo.get(coll)!.add(target);
		if (target === 'organizations') directOrg.add(coll);
	}
	// Parent-org: relates to a collection that is itself direct-org (one hop).
	const parentOrg = new Set<string>();
	for (const [coll, targets] of relatesTo) {
		if (directOrg.has(coll)) continue;
		for (const t of targets) if (directOrg.has(t)) { parentOrg.add(coll); break; }
	}
	const classify = (c: string) => c.startsWith('directus_') ? 'SYSTEM'
		: directOrg.has(c) ? 'DIRECT' : parentOrg.has(c) ? 'PARENT' : 'NONE';

	// All read permissions.
	const { data: perms } = await req('/permissions?limit=-1&filter[action][_eq]=read&fields=id,collection,policy,fields,permissions');

	// Unfiltered read grants under non-public, non-admin policies.
	const findings: Array<{ perm: number; policy: string; collection: string; org: string }> = [];
	for (const p of perms || []) {
		if (p.id == null || p.policy == null) continue;               // malformed / policy-less
		if (isPublic(p.policy) || isAdmin(p.policy)) continue;
		if (!unfiltered(p.permissions)) continue;
		findings.push({ perm: p.id, policy: nameOf.get(p.policy) || p.policy, collection: p.collection, org: classify(p.collection) });
	}

	const order = { DIRECT: 0, PARENT: 1, NONE: 2, SYSTEM: 3 } as Record<string, number>;
	findings.sort((a, b) => order[a.org] - order[b.org] || a.collection.localeCompare(b.collection));

	const leaks = findings.filter((f) => f.org === 'DIRECT' || f.org === 'PARENT');
	console.log(`Unfiltered non-public read grants: ${findings.length}  (${leaks.length} on ORG-SCOPED collections = cross-org leaks)\n`);

	for (const tier of ['DIRECT', 'PARENT', 'NONE', 'SYSTEM'] as const) {
		const rows = findings.filter((f) => f.org === tier);
		if (!rows.length) continue;
		const label = tier === 'DIRECT' ? 'DIRECT org link — cross-org leak, add org filter'
			: tier === 'PARENT' ? 'PARENT org link — likely cross-org leak, add filter via parent'
			: tier === 'SYSTEM' ? 'directus_* system collection — separate concern (app may need these)'
			: 'NO org link — reference/global/user-owned, review (likely fine)';
		console.log(`\n=== ${tier} (${rows.length}) — ${label} ===`);
		for (const r of rows) console.log(`  perm ${String(r.perm).padEnd(5)} | ${r.collection.padEnd(32)} | ${r.policy}`);
	}
	console.log('\n── Done (read-only) ──\n');
}

main().catch((e) => { console.error('Failed:', e.message); process.exit(1); });
