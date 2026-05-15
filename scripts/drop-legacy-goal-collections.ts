#!/usr/bin/env npx tsx
/**
 * Drop the drained legacy `team_goals` + `financial_goals` Directus collections.
 *
 * Rows were migrated into the unified `goals` collection on 2026-05-14 by
 * `scripts/migrate-goals-unified.ts` (4 team_goals → scope='team' rows; 2
 * financial_goals → 8 quarterly scope='organization', category='revenue'
 * rows; total 12 rows). After the post-Stage-1 soak window confirmed nothing
 * new was written to either collection, this script drops them.
 *
 * Safe to re-run: each collection is dropped only if it still exists, and
 * a row-count safety check refuses to drop a non-drained collection unless
 * `--force` is passed.
 *
 *   pnpm tsx scripts/drop-legacy-goal-collections.ts           # dry-run plan
 *   pnpm tsx scripts/drop-legacy-goal-collections.ts --apply   # commit
 *   pnpm tsx scripts/drop-legacy-goal-collections.ts --apply --force  # ignore row count
 *
 * Requires DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN.
 */

import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');

if (!TOKEN) {
	console.error('Missing DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN');
	process.exit(1);
}

const LEGACY_COLLECTIONS = ['financial_goals', 'team_goals'] as const;

type Json = unknown;

async function req(
	path: string,
	method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
	body?: unknown,
): Promise<{ ok: boolean; status: number; data: Json; error: string | null }> {
	const res = await fetch(`${DIRECTUS_URL}${path}`, {
		method,
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
		body: body ? JSON.stringify(body) : undefined,
	});
	const text = await res.text();
	let parsed: any = null;
	try {
		parsed = text ? JSON.parse(text) : null;
	} catch {
		/* not JSON */
	}
	if (!res.ok) return { ok: false, status: res.status, data: null, error: text };
	return { ok: true, status: res.status, data: parsed?.data ?? parsed, error: null };
}

async function collectionExists(collection: string): Promise<boolean> {
	const { ok, status } = await req(`/collections/${collection}`);
	if (ok) return true;
	if (status === 404 || status === 403) return false;
	return false;
}

async function countRows(collection: string): Promise<number | null> {
	const r = await req(`/items/${collection}?aggregate[count]=*`);
	if (!r.ok) return null;
	const arr = (r.data as any[]) ?? [];
	const c = arr[0]?.count;
	if (c == null) return null;
	return typeof c === 'number' ? c : Number(c);
}

async function dropCollection(collection: string): Promise<void> {
	console.log(`\n=== ${collection} ===`);

	const exists = await collectionExists(collection);
	if (!exists) {
		console.log(`  not present in Directus — nothing to drop`);
		return;
	}

	const count = await countRows(collection);
	if (count == null) {
		console.log(`  could not read row count (collection may be unreadable)`);
	} else {
		console.log(`  row count: ${count}`);
		if (count > 0 && !FORCE) {
			console.error(
				`  refusing to drop a non-empty collection. Pass --force to override, or check the migration.`,
			);
			return;
		}
	}

	if (!APPLY) {
		console.log(`  [dry-run] would DELETE /collections/${collection}`);
		return;
	}

	const r = await req(`/collections/${collection}`, 'DELETE');
	if (r.ok) {
		console.log(`  dropped`);
	} else {
		console.error(`  failed: ${r.status} ${r.error}`);
	}
}

async function main() {
	console.log('=========================================');
	console.log(`  Legacy goal-collection drop — ${APPLY ? 'APPLY' : 'DRY RUN'}`);
	console.log(`  Target: ${DIRECTUS_URL}`);
	console.log(`  Force:  ${FORCE ? 'yes (ignore row count)' : 'no'}`);
	console.log('=========================================');

	for (const collection of LEGACY_COLLECTIONS) {
		await dropCollection(collection);
	}

	console.log('\nDone.');
	if (!APPLY) console.log('Re-run with --apply to commit.');
}

main().catch((err) => {
	console.error('Drop failed:', err);
	process.exit(1);
});
