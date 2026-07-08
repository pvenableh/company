#!/usr/bin/env npx tsx
/**
 * Close the `emails` (marketing campaign sends) cross-org leak.
 *
 * Twin of scripts/close-email-events-public-read.ts. The `emails` collection
 * ships an unfiltered PUBLIC read (policy $t:public_label, permissions:null,
 * fields:['*']) — any anonymous caller can read every org's campaign subjects,
 * recipient counts and organization ids (verified: anon GET /items/emails → 200
 * with real rows). Campaign sends happen through server routes with the admin
 * token, and reads now go through the org-scoped /api/email/campaigns endpoint —
 * nothing legitimate uses the public grant, so it is safe to delete.
 *
 * SAFE TO RUN ANY TIME — nothing legitimate depends on the public read:
 *   - authenticated org roles already CANNOT read `emails` (no row-level grant),
 *     so the Activity + Marketing campaign roll-ups are already silently empty
 *     for signed-in users (403 → fail-soft). Deleting the public grant doesn't
 *     regress them — it only removes ANONYMOUS access.
 *   - the public newsletter web-view (server/api/email/web-view/[id].get.ts) and
 *     unsubscribe route read via the admin token (getServerDirectus), not the
 *     public grant.
 * The server-route fix (/api/email/campaigns) is what RESTORES the roll-up for
 * signed-in users; it deploys independently and is not a prerequisite for this.
 *
 * Idempotent: finds the public read perm on `emails` and deletes it. If none is
 * found it reports and exits 0.
 *
 * Run: pnpm tsx scripts/close-emails-public-read.ts
 */
import 'dotenv/config';

const BASE = (process.env.DIRECTUS_URL || 'https://admin.earnest.guru').replace(/\/$/, '');
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!TOKEN) { console.error('Error: DIRECTUS_SERVER_TOKEN required'); process.exit(1); }

async function req(path: string, method = 'GET') {
	const r = await fetch(BASE + path, { method, headers: { Authorization: `Bearer ${TOKEN}` } });
	const text = await r.text();
	const json = text ? JSON.parse(text) : {};
	if (!r.ok) throw new Error(json.errors?.[0]?.message || `HTTP ${r.status}`);
	return json;
}

async function main() {
	console.log('\n── Close emails public read ──\n');
	const u = new URL(BASE + '/permissions');
	u.searchParams.set('filter[collection][_eq]', 'emails');
	u.searchParams.set('fields', 'id,action,policy.name');
	u.searchParams.set('limit', '100');
	const { data } = await req(u.pathname + u.search);
	const rows: any[] = data || [];
	console.log(`emails permission rows: ${rows.length}`);
	for (const p of rows) console.log(`  - id ${p.id} | ${p.action} | policy ${p.policy?.name}`);

	// The public policy is labelled "$t:public_label" (Directus' built-in Public).
	const publicReads = rows.filter((p) => p.action === 'read' && /public/i.test(p.policy?.name || ''));
	if (!publicReads.length) {
		console.log('\nNo public read permission found — already closed. ✓');
		return;
	}
	for (const p of publicReads) {
		await req(`/permissions/${p.id}`, 'DELETE');
		console.log(`\n  ✗ deleted public read permission id ${p.id}`);
	}

	// Re-verify: anonymous read should now fail.
	const anon = await fetch(BASE + '/items/emails?limit=1');
	console.log(`\nAnonymous read after fix: HTTP ${anon.status} (expect 403).`);
	console.log('\n── Done ──');
}

main().catch((e) => { console.error('Failed:', e.message); process.exit(1); });
