#!/usr/bin/env npx tsx
/**
 * Close the email_events cross-org leak.
 *
 * `email_events` had exactly one permission: an unfiltered PUBLIC read
 * (policy $t:public_label, permissions:null, fields:['*']) — so any anonymous
 * caller could read every org's email recipients/subjects/metadata. Writes come
 * from the SendGrid webhook via the admin token, and reads now go through the
 * org-scoped /api/email/events endpoint — nothing legitimate uses the public
 * grant, so it is safe to delete.
 *
 * Idempotent: finds the public read perm on email_events and deletes it. If
 * none is found it reports and exits 0.
 *
 * Run: pnpm tsx scripts/close-email-events-public-read.ts
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
	console.log('\n── Close email_events public read ──\n');
	const u = new URL(BASE + '/permissions');
	u.searchParams.set('filter[collection][_eq]', 'email_events');
	u.searchParams.set('fields', 'id,action,policy.name');
	u.searchParams.set('limit', '100');
	const { data } = await req(u.pathname + u.search);
	const rows: any[] = data || [];
	console.log(`email_events permission rows: ${rows.length}`);
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
	const anon = await fetch(BASE + '/items/email_events?limit=1');
	console.log(`\nAnonymous read after fix: HTTP ${anon.status} (expect 403).`);
	console.log('\n── Done ──');
}

main().catch((e) => { console.error('Failed:', e.message); process.exit(1); });
