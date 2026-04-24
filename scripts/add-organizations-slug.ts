#!/usr/bin/env npx tsx
/**
 * Add `organizations.slug` — a stable, URL-safe, unique key per org.
 *
 * Problem this solves:
 *   `organizations` has no slug column, so demo setup scripts resort to
 *   matching on `name` for idempotency — which is fragile (a rename silently
 *   creates duplicates). Turns into the exact kind of "two 'Earnest Demo —
 *   Agency' orgs" mess that was hit while seeding.
 *
 * What this script does:
 *   1. CREATE the `slug` field on `organizations` (nullable, not-unique
 *      yet — backfill comes next).
 *   2. Backfill every existing row by slugifying `name` + a dedupe suffix on
 *      collision. Demo orgs get deterministic slugs: 'earnest-demo-solo',
 *      'earnest-demo-agency'.
 *   3. PATCH the field to `is_unique: true` once every row has a unique slug.
 *
 * Safety:
 *   - Dry-run by default. `--apply` required to write.
 *   - Idempotent: if the field exists and every row has a slug, script verifies
 *     uniqueness and no-ops.
 *   - Order matters: create → backfill → enforce unique. If step 3 fails because
 *     backfill produced a dupe the collision logic missed, re-running picks up
 *     where it left off.
 *
 * Usage:
 *   pnpm tsx scripts/add-organizations-slug.ts              # dry-run
 *   pnpm tsx scripts/add-organizations-slug.ts --apply      # write
 */

import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';

if (!DIRECTUS_TOKEN) {
	console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN is required');
	process.exit(1);
}

const APPLY = process.argv.includes('--apply');

async function directusRequest<T = unknown>(
	path: string,
	method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
	body?: unknown,
): Promise<{ data: T | null; error: string | null; status: number }> {
	const response = await fetch(`${DIRECTUS_URL}${path}`, {
		method,
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${DIRECTUS_TOKEN}`,
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	const text = await response.text();
	if (!response.ok) return { data: null, error: `${response.status}: ${text}`, status: response.status };
	const json = text ? JSON.parse(text) : {};
	return { data: (json.data ?? null) as T, error: null, status: response.status };
}

function slugify(input: string): string {
	return input
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')   // strip diacritics
		.replace(/&/g, ' and ')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60);                     // leave room for collision suffix
}

const FIELD_CREATE_BODY = {
	field: 'slug',
	type: 'string',
	meta: {
		interface: 'input',
		special: null,
		note: 'URL-safe stable identifier. Auto-generated from name; unique across the org table.',
		width: 'half',
		readonly: false,
		hidden: false,
		required: false,
		sort: 3,
	},
	schema: {
		is_nullable: true,
		is_unique: false,           // flipped after backfill
		max_length: 80,
	},
};

const FIELD_UNIQUE_PATCH = {
	schema: {
		is_nullable: false,
		is_unique: true,
	},
};

type OrgRow = { id: string; name: string; slug: string | null; code: string | null };

async function fieldExists(): Promise<boolean> {
	const { status } = await directusRequest('/fields/organizations/slug');
	return status === 200;
}

async function fetchOrgs(hasSlugField: boolean): Promise<OrgRow[]> {
	// Only request `slug` once the field exists — otherwise Directus 403s the
	// entire query, blocking the dry-run before the field has been created.
	const fields = hasSlugField ? 'id,name,slug,code' : 'id,name,code';
	const params = new URLSearchParams({ fields, limit: '-1' });
	const { data, error } = await directusRequest<Array<Omit<OrgRow, 'slug'> & { slug?: string | null }>>(
		`/items/organizations?${params}`,
	);
	if (error) throw new Error(`Failed to fetch orgs: ${error}`);
	return (data || []).map((o) => ({ ...o, slug: o.slug ?? null }));
}

function pickSlugFor(row: OrgRow, taken: Set<string>): string {
	// Demo orgs get deterministic slugs so the demo setup scripts can match them.
	if (row.code === 'SOL') return uniquify('earnest-demo-solo', taken);
	if (row.code === 'AGY') return uniquify('earnest-demo-agency', taken);

	const base = slugify(row.name) || 'org';
	return uniquify(base, taken);
}

function uniquify(base: string, taken: Set<string>): string {
	if (!taken.has(base)) return base;
	let n = 2;
	while (taken.has(`${base}-${n}`)) n++;
	return `${base}-${n}`;
}

async function main() {
	console.log(`\n${APPLY ? '🔧 APPLY' : '🔍 DRY-RUN'} mode — Directus: ${DIRECTUS_URL}`);

	// 1. Ensure field exists.
	const existsBefore = await fieldExists();
	console.log(`\n── Field organizations.slug: ${existsBefore ? 'exists' : 'missing'}`);

	let fieldLive = existsBefore;
	if (!existsBefore) {
		console.log('  Plan: POST /fields/organizations { field: slug, type: string, is_unique: false }');
		if (APPLY) {
			const { error } = await directusRequest('/fields/organizations', 'POST', FIELD_CREATE_BODY);
			if (error) throw new Error(`Failed to create field: ${error}`);
			console.log('  ✓ field created');
			fieldLive = true;
		}
	}

	// 2. Inventory rows.
	const orgs = await fetchOrgs(fieldLive);
	console.log(`\n── Inventorying ${orgs.length} org(s)…`);
	const missing = orgs.filter((o) => !o.slug);
	const withSlug = orgs.filter((o) => !!o.slug);
	console.log(`  ${withSlug.length} already have a slug, ${missing.length} need backfill`);

	// Seed the taken set with existing slugs so we don't collide with them.
	const taken = new Set<string>();
	for (const o of withSlug) if (o.slug) taken.add(o.slug);

	const assignments: Array<{ id: string; name: string; slug: string }> = [];
	for (const o of missing) {
		const slug = pickSlugFor(o, taken);
		taken.add(slug);
		assignments.push({ id: o.id, name: o.name, slug });
	}

	console.log('\n── Planned slug backfill:');
	for (const a of assignments.slice(0, 20)) {
		console.log(`    ${a.id.slice(0, 8)}  "${a.name}"  →  "${a.slug}"`);
	}
	if (assignments.length > 20) console.log(`    … and ${assignments.length - 20} more`);

	// 3. Check for pre-existing dupes among rows that already have a slug.
	const counts: Record<string, number> = {};
	for (const o of withSlug) if (o.slug) counts[o.slug] = (counts[o.slug] || 0) + 1;
	const preDupes = Object.entries(counts).filter(([, n]) => n > 1);
	if (preDupes.length > 0) {
		console.log('\n  ⚠ pre-existing dupes detected (will block is_unique patch):');
		for (const [s, n] of preDupes) console.log(`    "${s}" × ${n}`);
	}

	if (!APPLY) {
		console.log('\nThis was a DRY RUN. Re-run with --apply to write.');
		return;
	}

	// 4. Apply backfill.
	if (assignments.length > 0) {
		console.log('\n── Applying slug backfill…');
		let fail = 0;
		for (const a of assignments) {
			const { error } = await directusRequest(`/items/organizations/${a.id}`, 'PATCH', { slug: a.slug });
			if (error) {
				console.error(`  ✗ ${a.id}: ${error}`);
				fail++;
			}
		}
		console.log(`  ✓ ${assignments.length - fail} / ${assignments.length} row(s) updated`);
		if (fail > 0) {
			console.error('  Aborting before enforcing uniqueness.');
			process.exit(2);
		}
	}

	// 5. Flip is_unique=true.
	if (preDupes.length > 0) {
		console.error('\n✗ Cannot enforce unique: pre-existing dupes remain. Manual resolution required.');
		process.exit(3);
	}
	console.log('\n── PATCH /fields/organizations/slug → is_nullable=false, is_unique=true');
	const { error } = await directusRequest('/fields/organizations/slug', 'PATCH', FIELD_UNIQUE_PATCH);
	if (error) {
		console.error(`  ✗ Patch failed: ${error}`);
		console.error('  Rows are backfilled — re-run to retry the uniqueness flip.');
		process.exit(4);
	}
	console.log('  ✓ slug is now unique + not-null.');

	console.log('\n✓ Done.');
	console.log('\nNext:');
	console.log('  - Regenerate Directus types: `pnpm generate:types`');
	console.log('  - Demo scripts already updated to filter on slug.');
}

main().catch((err) => {
	console.error('Fatal:', err);
	process.exit(1);
});
