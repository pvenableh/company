#!/usr/bin/env npx tsx
/**
 * Close public read on Tier-B collections that have NO reader at all.
 *
 * `earnest_reviews`, `earnest_scan_credits`, `earnest_token_pools` are
 * provisioned schema for not-yet-built features — they appear ONLY in the
 * generated types (shared/directus.ts) and are read/written NOWHERE in app/ or
 * server/. So their Public read grant is pure exposure with nothing depending
 * on it: safe to delete outright, no role grant or server-route needed.
 *
 * Only the Public policy's read permission is deleted, per collection.
 * DRY-RUN BY DEFAULT — pass --apply to execute. Idempotent.
 *
 *   pnpm tsx scripts/close-unused-public-reads.ts           # preview
 *   pnpm tsx scripts/close-unused-public-reads.ts --apply   # execute
 */
import 'dotenv/config';

const BASE = (process.env.DIRECTUS_URL || 'https://admin.earnest.guru').replace(/\/$/, '');
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!TOKEN) { console.error('Error: DIRECTUS_SERVER_TOKEN required'); process.exit(1); }
const APPLY = process.argv.includes('--apply');

// earnest_* : only in generated types, read/written nowhere.
// comment_reports : WRITE-ONLY in the app (useComments.reportComment → .create);
//   never READ via a session, so closing its public READ grant breaks nothing
//   (moderation review, if any, is admin-only via the admin token).
const UNUSED = ['earnest_reviews', 'earnest_scan_credits', 'earnest_token_pools', 'comment_reports'];

async function req(path: string, method = 'GET') {
	const r = await fetch(BASE + path, { method, headers: { Authorization: `Bearer ${TOKEN}` } });
	const text = await r.text();
	const json = text ? JSON.parse(text) : {};
	if (!r.ok) throw new Error(json.errors?.[0]?.message || `HTTP ${r.status}`);
	return json;
}

async function main() {
	console.log(`\n── Close unused-collection public reads ── ${APPLY ? 'APPLY' : 'DRY-RUN (pass --apply)'}\n`);
	const { data: pols } = await req('/policies?limit=-1&fields=id,name');
	const pub = (pols || []).find((p: any) => /public/i.test(p.name || ''));
	if (!pub) { console.error('Could not find the Public policy.'); process.exit(1); }

	const { data: perms } = await req(
		`/permissions?limit=-1&filter[action][_eq]=read&filter[policy][_eq]=${pub.id}&fields=id,collection`,
	);
	const byCollection = new Map<string, number>((perms || []).map((p: any) => [p.collection, p.id]));

	for (const c of UNUSED) {
		const permId = byCollection.get(c);
		if (!permId) { console.log(`  · ${c} — no public read (already closed)`); continue; }
		if (!APPLY) { console.log(`  would delete: perm ${permId} | ${c}`); continue; }
		await req(`/permissions/${permId}`, 'DELETE');
		const anon = await fetch(`${BASE}/items/${c}?limit=1`);
		console.log(`  ✗ deleted perm ${permId} | ${c} — anon read now HTTP ${anon.status}`);
	}
	console.log(`\n${APPLY ? 'Done.' : 'Preview only. Re-run with --apply.'}\n`);
}

main().catch((e) => { console.error('Failed:', e.message); process.exit(1); });
