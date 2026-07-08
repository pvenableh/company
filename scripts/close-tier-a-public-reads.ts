#!/usr/bin/env npx tsx
/**
 * Close the TIER-A public-read leaks (see project_public_read_exposure_audit).
 *
 * These 28 collections each have BOTH a Public read grant AND a role-level read
 * grant (Client / Client Manager / Carddesk User). Deleting the PUBLIC grant
 * therefore removes anonymous access while signed-in users keep reading via
 * their role — zero regression. This is the safe, high-severity batch (all
 * financials + PII + cross-org membership).
 *
 * Only the `$t:public_label` (Public) policy's READ permission for each listed
 * collection is deleted. Role grants and other actions are untouched.
 *
 * DRY-RUN BY DEFAULT — prints what it would delete. Pass --apply to execute.
 * Idempotent: a collection whose public read is already gone is skipped.
 *
 *   pnpm tsx scripts/close-tier-a-public-reads.ts           # preview
 *   pnpm tsx scripts/close-tier-a-public-reads.ts --apply   # execute
 *
 * TIER-B collections (public is the ONLY read grant — deleting would break
 * authed reads) are intentionally NOT here; they need a role grant added or
 * server-endpoint routing first. See the memory note.
 */
import 'dotenv/config';

const BASE = (process.env.DIRECTUS_URL || 'https://admin.earnest.guru').replace(/\/$/, '');
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!TOKEN) { console.error('Error: DIRECTUS_SERVER_TOKEN required'); process.exit(1); }
const APPLY = process.argv.includes('--apply');

const TIER_A = [
	'ai_usage_logs', 'appointments_directus_users', 'availability', 'clients', 'clients_directus_users',
	'clients_teams', 'contacts_organizations', 'goal_snapshots', 'goals', 'invoices', 'invoices_products',
	'invoices_projects', 'junction_directus_users_teams', 'line_items', 'meeting_requests', 'organizations',
	'organizations_directus_users', 'payments_received', 'people', 'people_organizations', 'project_events',
	'reactions', 'requests', 'tasks_directus_users', 'tickets_comments', 'tickets_directus_users',
	'tickets_services', 'user_presence',
];

async function req(path: string, method = 'GET') {
	const r = await fetch(BASE + path, { method, headers: { Authorization: `Bearer ${TOKEN}` } });
	const text = await r.text();
	const json = text ? JSON.parse(text) : {};
	if (!r.ok) throw new Error(json.errors?.[0]?.message || `HTTP ${r.status}`);
	return json;
}

async function main() {
	console.log(`\n── Close Tier-A public reads ── ${APPLY ? 'APPLY' : 'DRY-RUN (pass --apply to execute)'}\n`);

	// Resolve the Public policy id by name.
	const { data: pols } = await req('/policies?limit=-1&fields=id,name');
	const pub = (pols || []).find((p: any) => /public/i.test(p.name || ''));
	if (!pub) { console.error('Could not find the Public policy ($t:public_label).'); process.exit(1); }

	// All read grants under the Public policy, keyed by collection.
	const { data: perms } = await req(
		`/permissions?limit=-1&filter[action][_eq]=read&filter[policy][_eq]=${pub.id}&fields=id,collection`,
	);
	const byCollection = new Map<string, number>((perms || []).map((p: any) => [p.collection, p.id]));

	let deleted = 0, skipped = 0;
	for (const c of TIER_A) {
		const permId = byCollection.get(c);
		if (!permId) { console.log(`  · ${c} — no public read (already closed)`); skipped++; continue; }
		if (!APPLY) { console.log(`  would delete: perm ${permId} | ${c}`); continue; }
		await req(`/permissions/${permId}`, 'DELETE');
		const anon = await fetch(`${BASE}/items/${c}?limit=1`);
		console.log(`  ✗ deleted perm ${permId} | ${c} — anon read now HTTP ${anon.status}`);
		deleted++;
	}

	console.log(`\n${APPLY ? `Done. Deleted ${deleted}, skipped ${skipped}.` : `Preview: ${TIER_A.length - skipped} to delete, ${skipped} already closed. Re-run with --apply.`}\n`);
}

main().catch((e) => { console.error('Failed:', e.message); process.exit(1); });
