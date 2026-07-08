#!/usr/bin/env npx tsx
/**
 * Audit prod Directus for anonymous (public) read leaks.
 *
 * Two sibling collections (email_events, emails) both shipped an unfiltered
 * PUBLIC read grant — anyone could read them unauthenticated, cross-org. That's
 * a configuration pattern, not a one-off, so this sweeps EVERY user collection:
 * enumerate collections with the admin token, then probe each ANONYMOUSLY
 * (no auth header). Anything that returns rows unauthenticated is flagged.
 *
 * READ-ONLY — makes no writes and changes no permissions. Reports only.
 *
 * A public read is not always a bug: some collections are meant to be public
 * (e.g. a published blog, booking availability, public brand info). The output
 * groups clear PII/business-data collections separately so a human can triage.
 *
 * Run: pnpm tsx scripts/audit-public-read-leaks.ts
 */
import 'dotenv/config';

const BASE = (process.env.DIRECTUS_URL || 'https://admin.earnest.guru').replace(/\/$/, '');
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!TOKEN) { console.error('Error: DIRECTUS_SERVER_TOKEN required'); process.exit(1); }

async function adminReq(path: string) {
	const r = await fetch(BASE + path, { headers: { Authorization: `Bearer ${TOKEN}` } });
	const text = await r.text();
	const json = text ? JSON.parse(text) : {};
	if (!r.ok) throw new Error(json.errors?.[0]?.message || `HTTP ${r.status}`);
	return json;
}

// Anonymous probe: returns { status, rows } where rows is the count actually
// returned unauthenticated (0 with a 200 is still a leak surface but harmless).
async function anonProbe(collection: string): Promise<{ status: number; rows: number }> {
	const r = await fetch(`${BASE}/items/${encodeURIComponent(collection)}?limit=1`);
	let rows = 0;
	try {
		const j = await r.json();
		rows = Array.isArray(j?.data) ? j.data.length : 0;
	} catch { /* non-JSON */ }
	return { status: r.status, rows };
}

async function main() {
	console.log('\n── Public-read leak sweep ──');
	console.log(`Target: ${BASE}\n`);

	const { data } = await adminReq('/collections?limit=-1&fields=collection,meta.hidden');
	const collections: string[] = (data || [])
		.map((c: any) => c.collection)
		.filter((name: string) => name && !name.startsWith('directus_'))
		.sort();

	console.log(`Probing ${collections.length} user collections anonymously…\n`);

	const leaks: Array<{ collection: string; rows: number }> = [];
	// Probe in small batches to stay gentle on the server.
	const BATCH = 8;
	for (let i = 0; i < collections.length; i += BATCH) {
		const slice = collections.slice(i, i + BATCH);
		const results = await Promise.all(
			slice.map(async (c) => ({ c, ...(await anonProbe(c)) })),
		);
		for (const r of results) {
			if (r.status === 200) leaks.push({ collection: r.c, rows: r.rows });
		}
	}

	if (!leaks.length) {
		console.log('✓ No collection returned 200 to an anonymous read. Clean.\n');
		return;
	}

	console.log(`⚠️  ${leaks.length} collection(s) readable ANONYMOUSLY:\n`);
	for (const l of leaks.sort((a, b) => a.collection.localeCompare(b.collection))) {
		console.log(`  - ${l.collection}${l.rows ? '  (returned real rows)' : '  (empty, but read is open)'}`);
	}
	console.log('\nTriage each: is it INTENDED to be public (published content, booking');
	console.log('availability, public brand) or a LEAK (PII, financials, cross-org data)?');
	console.log('Close a leak by deleting its Public read perm (see');
	console.log('scripts/close-emails-public-read.ts for the pattern).\n');
}

main().catch((e) => { console.error('Failed:', e.message); process.exit(1); });
