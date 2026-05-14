#!/usr/bin/env npx tsx
/**
 * Goal-schema unification — Stage 1.
 *
 *   1. Add `scope` and `category` fields on `goals` (idempotent — skips if present)
 *   2. Backfill `scope` + `category` on existing rows
 *   3. Migrate `team_goals` rows → `goals` rows (scope='team')
 *   4. Migrate `financial_goals` rows → `goals` rows (scope='organization', category='revenue')
 *
 * Idempotent: every migrated row writes `metadata.migrated_from` + `metadata.legacy_id`,
 * and re-runs skip rows whose (collection, legacy_id) pair already exists.
 *
 * Dry-run by default. Pass `--apply` to actually write.
 *
 *   pnpm tsx scripts/migrate-goals-unified.ts             # dry run, show plan
 *   pnpm tsx scripts/migrate-goals-unified.ts --apply     # commit
 *
 * Requires DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN.
 */

import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
const APPLY = process.argv.includes('--apply');

if (!TOKEN) {
	console.error('Missing DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN');
	process.exit(1);
}

type Json = any;

async function req<T = Json>(
	path: string,
	method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
	body?: unknown,
): Promise<{ ok: boolean; status: number; data: T | null; error: string | null }> {
	const res = await fetch(`${DIRECTUS_URL}${path}`, {
		method,
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
		body: body ? JSON.stringify(body) : undefined,
	});
	const text = await res.text();
	let parsed: any = null;
	try { parsed = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
	if (!res.ok) {
		return { ok: false, status: res.status, data: null, error: text };
	}
	return { ok: true, status: res.status, data: (parsed?.data ?? parsed) as T, error: null };
}

// ─── Field creation ─────────────────────────────────────────────────────────

async function ensureField(collection: string, fieldDef: { field: string; type: string; meta: any; schema?: any }) {
	console.log(`  field ${collection}.${fieldDef.field}`);
	if (!APPLY) {
		console.log('    [dry-run] would create');
		return;
	}
	const r = await req(`/fields/${collection}`, 'POST', fieldDef);
	if (r.ok) {
		console.log('    created');
	} else if (r.status === 400 && /already exists/i.test(r.error || '')) {
		console.log('    already exists, skipping');
	} else {
		console.error(`    error ${r.status}: ${r.error}`);
	}
}

async function setupSchema() {
	console.log('\n=== Schema ===');

	await ensureField('goals', {
		field: 'scope',
		type: 'string',
		meta: {
			interface: 'select-dropdown',
			width: 'half',
			required: true,
			note: 'Who the goal is for. user = personal; team/client/organization = shared.',
			options: {
				choices: [
					{ text: 'User', value: 'user' },
					{ text: 'Team', value: 'team' },
					{ text: 'Client', value: 'client' },
					{ text: 'Organization', value: 'organization' },
				],
			},
		},
		schema: { default_value: 'organization' },
	});

	await ensureField('goals', {
		field: 'category',
		type: 'string',
		meta: {
			interface: 'select-dropdown',
			width: 'half',
			required: true,
			note: 'High-level theme. Replaces the older `type` field.',
			options: {
				choices: [
					{ text: 'Revenue', value: 'revenue' },
					{ text: 'Growth', value: 'growth' },
					{ text: 'Retention', value: 'retention' },
					{ text: 'Learning', value: 'learning' },
					{ text: 'Wellbeing', value: 'wellbeing' },
					{ text: 'Delivery', value: 'delivery' },
					{ text: 'Custom', value: 'custom' },
				],
			},
		},
		schema: { default_value: 'custom' },
	});
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function deriveScope(row: any): 'user' | 'team' | 'client' | 'organization' {
	if (row.team) return 'team';
	if (row.client) return 'client';
	if (row.assigned_to) return 'user';
	return 'organization';
}

function mapTypeToCategory(t: string | null | undefined): string {
	switch (t) {
		case 'financial': return 'revenue';
		case 'networking': return 'growth';
		case 'performance': return 'delivery';
		case 'marketing': return 'growth';
		default: return 'custom';
	}
}

function quarterRange(year: number, q: number): { start: string; end: string } {
	const starts = [`${year}-01-01`, `${year}-04-01`, `${year}-07-01`, `${year}-10-01`];
	const ends = [`${year}-03-31`, `${year}-06-30`, `${year}-09-30`, `${year}-12-31`];
	return { start: starts[q - 1]!, end: ends[q - 1]! };
}

async function listAll<T = any>(collection: string, query: string): Promise<T[]> {
	const r = await req<T[]>(`/items/${collection}?${query}&limit=-1`);
	if (!r.ok) {
		console.warn(`  could not list ${collection}: ${r.error}`);
		return [];
	}
	return (r.data || []) as T[];
}

async function patchItem(collection: string, id: string | number, payload: any) {
	if (!APPLY) return;
	const r = await req(`/items/${collection}/${id}`, 'PATCH', payload);
	if (!r.ok) console.error(`    patch ${collection}/${id}: ${r.status} ${r.error}`);
}

async function createItem(collection: string, payload: any): Promise<{ id?: string } | null> {
	if (!APPLY) return { id: '<dry-run>' };
	const r = await req<any>(`/items/${collection}`, 'POST', payload);
	if (!r.ok) {
		console.error(`    create ${collection}: ${r.status} ${r.error}`);
		return null;
	}
	return r.data;
}

// ─── Backfill existing goals ────────────────────────────────────────────────

async function backfillGoals() {
	console.log('\n=== Backfill existing goals ===');
	// Don't SELECT scope/category — in dry-run the columns don't exist yet.
	// PATCH is deterministic from (type, assigned_to, team, client), so
	// running this twice is idempotent: same input → same output.
	const rows = await listAll<any>('goals', 'fields=id,type,assigned_to,team,client,organization');
	let updated = 0;
	for (const row of rows) {
		const patch = {
			scope: deriveScope(row),
			category: mapTypeToCategory(row.type),
		};
		console.log(`  goal ${row.id}: scope=${patch.scope} category=${patch.category}`);
		await patchItem('goals', row.id, patch);
		updated++;
	}
	console.log(`  ${updated}/${rows.length} rows ${APPLY ? 'updated' : 'would update'}`);
}

// ─── Migrate team_goals → goals ─────────────────────────────────────────────

async function migrateTeamGoals() {
	console.log('\n=== Migrate team_goals → goals ===');

	const teamGoals = await listAll<any>(
		'team_goals',
		'fields=id,title,description,target_date,progress,sort,date_created,date_updated,user_created,user_updated,team',
	);

	if (teamGoals.length === 0) {
		console.log('  no team_goals rows to migrate');
		return;
	}

	// Resolve team -> organization so the new goals row carries the same org.
	const teamIds = [...new Set(teamGoals.map((g) => g.team).filter(Boolean))];
	const teamFilter = encodeURIComponent(JSON.stringify({ id: { _in: teamIds } }));
	const teams = await listAll<any>('teams', `fields=id,organization&filter=${teamFilter}`);
	const teamToOrg = new Map<string, string | null>();
	for (const t of teams) teamToOrg.set(String(t.id), t.organization ?? null);

	// Skip team_goals whose legacy_id we've already migrated.
	// Directus 11 won't run `_contains` on JSON fields, so filter client-side.
	const allGoals = await listAll<any>('goals', 'fields=id,metadata');
	const alreadyDone = new Set<string>(
		allGoals
			.filter((g) => g.metadata?.migrated_from === 'team_goals')
			.map((g) => g.metadata?.legacy_id)
			.filter(Boolean)
			.map(String),
	);

	let created = 0;
	for (const tg of teamGoals) {
		if (alreadyDone.has(String(tg.id))) {
			console.log(`  team_goal ${tg.id} already migrated, skipping`);
			continue;
		}
		const payload = {
			title: tg.title,
			description: tg.description ?? null,
			scope: 'team',
			category: 'delivery',
			status: 'active',
			target_value: 100,
			target_unit: '%',
			current_value: tg.progress ?? 0,
			end_date: tg.target_date ?? null,
			team: tg.team,
			organization: teamToOrg.get(String(tg.team)) ?? null,
			sort: tg.sort ?? null,
			date_created: tg.date_created ?? null,
			date_updated: tg.date_updated ?? null,
			user_created: tg.user_created ?? null,
			user_updated: tg.user_updated ?? null,
			metadata: { migrated_from: 'team_goals', legacy_id: String(tg.id) },
		};
		console.log(`  team_goal ${tg.id} "${tg.title}" → goals (team=${tg.team})`);
		const r = await createItem('goals', payload);
		if (r) created++;
	}
	console.log(`  ${created}/${teamGoals.length} team_goals ${APPLY ? 'migrated' : 'would migrate'}`);
}

// ─── Migrate financial_goals → goals (one row per non-null quarter) ─────────

async function migrateFinancialGoals() {
	console.log('\n=== Migrate financial_goals → goals ===');

	const rows = await listAll<any>(
		'financial_goals',
		'fields=id,year,q1_goal,q2_goal,q3_goal,q4_goal,organization,date_created,user_created',
	);
	if (rows.length === 0) {
		console.log('  no financial_goals rows to migrate');
		return;
	}

	const allGoals = await listAll<any>('goals', 'fields=id,metadata');
	const alreadyDone = new Set<string>(
		allGoals
			.filter((g) => g.metadata?.migrated_from === 'financial_goals')
			.map((g) => `${g.metadata?.legacy_id}:${g.metadata?.quarter}`),
	);

	let created = 0;
	let attempted = 0;
	for (const fg of rows) {
		for (let q = 1; q <= 4; q++) {
			const target = fg[`q${q}_goal`];
			if (target == null || Number(target) === 0) continue;
			attempted++;
			const key = `${fg.id}:${q}`;
			if (alreadyDone.has(key)) {
				console.log(`  financial_goal ${fg.id} Q${q} already migrated, skipping`);
				continue;
			}
			const { start, end } = quarterRange(fg.year, q);
			const payload = {
				title: `Q${q} ${fg.year} Revenue`,
				scope: 'organization',
				category: 'revenue',
				status: 'active',
				target_value: Number(target),
				target_unit: 'USD',
				timeframe: 'quarterly',
				start_date: start,
				end_date: end,
				organization: fg.organization ?? null,
				date_created: fg.date_created ?? null,
				user_created: fg.user_created ?? null,
				metadata: { migrated_from: 'financial_goals', legacy_id: String(fg.id), year: fg.year, quarter: q },
			};
			console.log(`  financial_goal ${fg.id} Q${q} (${fg.year}) target=${target} → goals`);
			const r = await createItem('goals', payload);
			if (r) created++;
		}
	}
	console.log(`  ${created}/${attempted} financial-goal quarters ${APPLY ? 'migrated' : 'would migrate'}`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
	console.log('=========================================');
	console.log(`  Goal-schema migration — ${APPLY ? 'APPLY' : 'DRY RUN'}`);
	console.log(`  Target: ${DIRECTUS_URL}`);
	console.log('=========================================');

	await setupSchema();
	await backfillGoals();
	await migrateTeamGoals();
	await migrateFinancialGoals();

	console.log('\nDone.');
	if (!APPLY) console.log('Re-run with --apply to commit.');
}

main().catch((err) => {
	console.error('Migration failed:', err);
	process.exit(1);
});
