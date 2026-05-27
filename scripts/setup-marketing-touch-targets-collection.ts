#!/usr/bin/env npx tsx
/**
 * Directus marketing_touch_targets Collection — Setup Script.
 *
 * Junction that lets one marketing_touch target many recipient buckets
 * (mailing lists OR audience segments OR a mix). Ships in P4 Item A.1 of
 * the Composition Canvas redesign to unblock per-target body variants —
 * Item A.2 (variants) only delivers value once a touch can actually
 * target more than one recipient bucket.
 *
 * Shape:
 *
 *   marketing_touch_targets
 *     id              PK, auto-increment
 *     touch           m2o → marketing_touches (CASCADE delete)
 *     organization    m2o → organizations (CASCADE delete; denormalized for
 *                     fast org-scoped queries — mirrors the marketing_touch_variants
 *                     pattern so the server token can org-filter junction reads
 *                     without joining through `touch.organization`)
 *     target_kind     'mailing_list' | 'audience_segment'  (string enum)
 *     mailing_list    m2o → mailing_lists (SET NULL; nullable — set when
 *                     target_kind = 'mailing_list')
 *     audience_filter string nullable  (the literal 'all' | 'opened_previous'
 *                     | 'unopened_previous' | 'cluster:<label>' — set when
 *                     target_kind = 'audience_segment')
 *     sort            integer nullable (chip-row display order)
 *     date_created    audit
 *     date_updated    audit
 *
 * Reverse alias `marketing_touches.targets` (o2m, virtual field) so the
 * canvas's touchToComposition mapper can project `targets.*` in one
 * fetch. Required even though the relation meta has `one_field: 'targets'`
 * — without the alias field row, deep-field walks 403 silently
 * (see feedback_directus_o2m_alias_gotcha).
 *
 * Mutex at the application layer: a row is either `target_kind='mailing_list'`
 * with `mailing_list` set + `audience_filter` null, OR
 * `target_kind='audience_segment'` with the inverse. The DB allows both
 * to be set; the Zod schema + send path enforce the XOR.
 *
 * Back-compat: marketing_touches.mailing_list + .audience_filter columns
 * stay populated by the server's create + PATCH handlers (mirror the
 * first target on write for one release) so the pre-junction send path
 * keeps working for any row that didn't get junction-migrated.
 *
 * Run:
 *   pnpm tsx scripts/setup-marketing-touch-targets-collection.ts          # dry-run
 *   pnpm tsx scripts/setup-marketing-touch-targets-collection.ts --apply  # write
 *
 * Prerequisites:
 *   - marketing_touches + mailing_lists + organizations exist
 *   - DIRECTUS_SERVER_TOKEN env var set
 *
 * Idempotent: re-running is safe.
 *
 * Permissions: no row-level perms — server endpoints route through
 * getTypedDirectus() after requireOrgMembership(), matching the
 * marketing_touches + marketing_touch_variants pattern.
 */

import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
const APPLY = process.argv.includes('--apply');

if (!DIRECTUS_TOKEN) {
	console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN env var is required');
	process.exit(1);
}

interface DirectusResult<T> {
	data: T | null;
	error: string | null;
	status: number;
}

async function directusRequest<T = unknown>(
	path: string,
	method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
	body?: unknown,
): Promise<DirectusResult<T>> {
	const response = await fetch(`${DIRECTUS_URL}${path}`, {
		method,
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${DIRECTUS_TOKEN}`,
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	const text = await response.text();
	if (!response.ok) {
		if (response.status === 409) return { data: null, error: 'already_exists', status: 409 };
		if (response.status === 400 && /already exists|already has an associated/i.test(text)) {
			return { data: null, error: 'already_exists', status: 400 };
		}
		return { data: null, error: `${response.status}: ${text}`, status: response.status };
	}
	const json = text ? JSON.parse(text) : {};
	return { data: (json.data ?? null) as T, error: null, status: response.status };
}

async function collectionExists(collection: string): Promise<boolean> {
	const { status } = await directusRequest(`/collections/${collection}`);
	return status === 200;
}

async function fieldExists(collection: string, field: string): Promise<boolean> {
	const { status } = await directusRequest(`/fields/${collection}/${field}`);
	return status === 200;
}

async function findRelation(collection: string, field: string): Promise<any | null> {
	const { data } = await directusRequest<any[]>('/relations?limit=-1');
	if (!data) return null;
	return data.find((r) => r.collection === collection && r.field === field) || null;
}

// ─── Plan + Apply ──────────────────────────────────────────────────────────

type PlannedAction = { describe: string; run: () => Promise<void> };
const planned: PlannedAction[] = [];

function plan(describe: string, run: () => Promise<void>) {
	planned.push({ describe, run });
}

async function planCollection() {
	if (await collectionExists('marketing_touch_targets')) {
		console.log('  [skip] collection marketing_touch_targets already exists');
		return;
	}
	plan('POST /collections — create `marketing_touch_targets`', async () => {
		const { error } = await directusRequest('/collections', 'POST', {
			collection: 'marketing_touch_targets',
			meta: {
				icon: 'hub',
				note: 'Per-touch recipient bucket. One row per (touch, list-or-segment) — supports multi-target sends + per-target body variants.',
				color: '#0891B2',
				hidden: false,
				singleton: false,
				accountability: 'all',
				display_template: '{{target_kind}} — {{mailing_list.name}}{{audience_filter}}',
			},
			schema: {},
		});
		if (error) throw new Error(`create collection failed: ${error}`);
		console.log('  [ok]   collection marketing_touch_targets created');
	});
}

interface FieldSpec {
	field: string;
	type: string;
	meta: Record<string, any>;
	schema?: Record<string, any> | null;
}

const FIELDS: FieldSpec[] = [
	{
		field: 'id',
		type: 'integer',
		meta: { interface: 'input', readonly: true, hidden: true },
		schema: { is_primary_key: true, has_auto_increment: true },
	},
	{
		field: 'touch',
		type: 'integer',
		meta: {
			interface: 'select-dropdown-m2o',
			special: ['m2o'],
			required: true,
			width: 'half',
			options: { template: '{{kind}} #{{sequence_index}}' },
		},
		schema: { is_nullable: false },
	},
	{
		field: 'organization',
		type: 'uuid',
		meta: {
			interface: 'select-dropdown-m2o',
			special: ['m2o'],
			required: true,
			width: 'half',
			note: 'Denormalized from touch.organization for fast org-scoped reads.',
			options: { template: '{{name}}' },
		},
		schema: { is_nullable: false },
	},
	{
		field: 'target_kind',
		type: 'string',
		meta: {
			interface: 'select-dropdown',
			required: true,
			width: 'half',
			options: {
				choices: [
					{ text: 'Mailing list', value: 'mailing_list' },
					{ text: 'Audience segment', value: 'audience_segment' },
				],
			},
		},
		schema: { is_nullable: false },
	},
	{
		field: 'mailing_list',
		type: 'integer',
		meta: {
			interface: 'select-dropdown-m2o',
			special: ['m2o'],
			width: 'half',
			note: 'Set when target_kind=mailing_list. XOR with audience_filter.',
			options: { template: '{{name}}' },
		},
		schema: { is_nullable: true },
	},
	{
		field: 'audience_filter',
		type: 'string',
		meta: {
			interface: 'input',
			width: 'half',
			note: 'Set when target_kind=audience_segment. One of: all | opened_previous | unopened_previous | cluster:<label>.',
		},
		schema: { is_nullable: true },
	},
	{
		field: 'sort',
		type: 'integer',
		meta: { interface: 'input', width: 'half', note: 'Display order in the chip row.' },
		schema: { is_nullable: true },
	},
	{
		field: 'date_created',
		type: 'timestamp',
		meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true, width: 'half' },
		schema: {},
	},
	{
		field: 'date_updated',
		type: 'timestamp',
		meta: { special: ['date-updated'], interface: 'datetime', readonly: true, hidden: true, width: 'half' },
		schema: {},
	},
];

async function planFields() {
	for (const f of FIELDS) {
		const exists = await fieldExists('marketing_touch_targets', f.field);
		if (exists) {
			console.log(`  [skip] field marketing_touch_targets.${f.field} already exists`);
			continue;
		}
		plan(`POST /fields/marketing_touch_targets — create \`${f.field}\``, async () => {
			const { error } = await directusRequest('/fields/marketing_touch_targets', 'POST', f);
			if (error === 'already_exists') {
				console.log(`  [skip] field marketing_touch_targets.${f.field} created concurrently — skipping`);
				return;
			}
			if (error) throw new Error(`create field ${f.field} failed: ${error}`);
			console.log(`  [ok]   field marketing_touch_targets.${f.field} created`);
		});
	}
}

interface RelationSpec {
	collection: string;
	field: string;
	related_collection: string;
	one_field?: string | null;
	on_delete: 'CASCADE' | 'SET NULL';
}

const RELATIONS: RelationSpec[] = [
	{
		collection: 'marketing_touch_targets',
		field: 'touch',
		related_collection: 'marketing_touches',
		one_field: 'targets',
		on_delete: 'CASCADE',
	},
	{
		collection: 'marketing_touch_targets',
		field: 'organization',
		related_collection: 'organizations',
		one_field: null,
		on_delete: 'CASCADE',
	},
	{
		collection: 'marketing_touch_targets',
		field: 'mailing_list',
		related_collection: 'mailing_lists',
		one_field: null,
		on_delete: 'SET NULL',
	},
];

async function planRelations() {
	for (const r of RELATIONS) {
		const existing = await findRelation(r.collection, r.field);
		if (existing) {
			console.log(`  [skip] relation ${r.collection}.${r.field} → ${r.related_collection} already exists`);
			if (r.one_field && existing.meta?.one_field !== r.one_field) {
				plan(
					`PATCH /relations/${r.collection}/${r.field} — set meta.one_field = "${r.one_field}"`,
					async () => {
						const { error } = await directusRequest(
							`/relations/${r.collection}/${r.field}`,
							'PATCH',
							{ meta: { ...(existing.meta ?? {}), one_field: r.one_field } },
						);
						if (error) throw new Error(`patch relation ${r.collection}.${r.field} failed: ${error}`);
						console.log(`  [ok]   relation ${r.collection}.${r.field} one_field=${r.one_field}`);
					},
				);
			}
			continue;
		}
		plan(`POST /relations — ${r.collection}.${r.field} → ${r.related_collection}`, async () => {
			const payload: Record<string, any> = {
				collection: r.collection,
				field: r.field,
				related_collection: r.related_collection,
				schema: { on_delete: r.on_delete },
				meta: {
					one_field: r.one_field ?? null,
					sort_field: null,
					one_deselect_action: 'nullify',
					junction_field: null,
				},
			};
			const { error } = await directusRequest('/relations', 'POST', payload);
			if (error) throw new Error(`create relation ${r.collection}.${r.field} failed: ${error}`);
			console.log(`  [ok]   relation ${r.collection}.${r.field} → ${r.related_collection} created`);
		});
	}
}

async function planTargetsAliasOnTouches() {
	// Per [[feedback_directus_o2m_alias_gotcha]]: setting `meta.one_field` on
	// the relation is not enough — we also need an alias field row on the
	// parent collection, otherwise `targets.*` deep walks 403 silently for
	// non-admin tokens.
	if (await fieldExists('marketing_touches', 'targets')) {
		console.log('  [skip] alias field marketing_touches.targets already exists');
		return;
	}
	plan('POST /fields/marketing_touches — create alias `targets` (o2m)', async () => {
		const { error } = await directusRequest('/fields/marketing_touches', 'POST', {
			collection: 'marketing_touches',
			field: 'targets',
			type: 'alias',
			meta: {
				interface: 'list-o2m',
				special: ['o2m'],
				note: 'Recipient buckets this touch targets. Reverse of marketing_touch_targets.touch.',
			},
			schema: null,
		});
		if (error) throw new Error(`create alias targets failed: ${error}`);
		console.log('  [ok]   alias marketing_touches.targets created');
	});
}

async function main() {
	console.log('==========================================');
	console.log('  marketing_touch_targets — Setup');
	console.log('==========================================');
	console.log(`Directus URL: ${DIRECTUS_URL}`);
	console.log(`Mode: ${APPLY ? '🔧 APPLY' : '🔍 DRY-RUN'}\n`);

	const ping = await directusRequest('/server/info');
	if (ping.error) {
		console.error(`Cannot connect to Directus: ${ping.error}`);
		process.exit(1);
	}
	console.log('Connected\n');

	console.log('--- Inspecting current state ---');
	await planCollection();
	await planFields();
	await planRelations();
	await planTargetsAliasOnTouches();

	console.log('\n--- Plan ---');
	if (planned.length === 0) {
		console.log('  (nothing to do — schema already in place)');
		return;
	}
	planned.forEach((p, i) => console.log(`  [${i + 1}] ${p.describe}`));

	if (!APPLY) {
		console.log('\nDRY-RUN — re-run with --apply to write the above.');
		return;
	}

	console.log('\n--- Applying ---');
	for (const p of planned) {
		await p.run();
	}

	console.log('\n==========================================');
	console.log('  Done');
	console.log('==========================================');
	console.log('\nNext: pnpm generate:types');
}

main().catch((err) => {
	console.error('Fatal:', err);
	process.exit(1);
});
