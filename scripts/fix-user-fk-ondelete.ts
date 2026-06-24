#!/usr/bin/env npx tsx
/**
 * Fix FK on-delete rules that block deleting a `directus_users` row.
 *
 * Symptom this fixes:
 *   [INTERNAL_SERVER_ERROR] delete from "directus_users" ... violates foreign
 *   key constraint "comments_user_created_foreign" on table "comments"
 *
 * Root cause (diagnosed 2026-06-24):
 *   ~171 relations to `directus_users` — almost all the auto-stamped
 *   `user_created` / `user_updated` audit fields — have a PHYSICAL foreign key
 *   of ON DELETE NO ACTION, even though Directus's own metadata
 *   (`one_deselect_action = 'nullify'`) says they should be SET NULL. The
 *   Directus meta and the Postgres constraint have DRIFTED apart. Because
 *   Directus already believes the relation is "nullify", every API repair
 *   path is a no-op or blocked:
 *     - PATCH /relations            -> 200 but runs no ALTER (no meta diff)
 *     - POST  /schema/diff          -> 413, snapshot is 2.77 MB > payload limit
 *     - POST  /schema/apply?force   -> still requires a hash only /diff can mint
 *   So the fix has to be raw SQL run directly against Postgres.
 *
 * What this script does:
 *   - Audits every relation whose related_collection is `directus_users` and
 *     whose physical on_delete is NO ACTION / RESTRICT (introspected live, so
 *     constraint names are exact).
 *   - Emits a transactional .sql file that DROPs and re-ADDs each constraint
 *     with the correct on_delete:
 *       * NULLABLE column  -> ON DELETE SET NULL  (row survives, author clears)
 *       * NOT NULL column  -> ON DELETE CASCADE   (dependent row deleted w/ user)
 *
 * Usage:
 *   pnpm tsx scripts/fix-user-fk-ondelete.ts                       # audit summary
 *   pnpm tsx scripts/fix-user-fk-ondelete.ts --emit-sql            # write scripts/fix-user-fk-ondelete.sql
 *   pnpm tsx scripts/fix-user-fk-ondelete.ts --emit-sql --out /tmp/x.sql
 *
 * Then run the SQL against the Directus database, e.g.:
 *   psql "$DATABASE_URL" -f scripts/fix-user-fk-ondelete.sql
 *
 * Requires DIRECTUS_SERVER_TOKEN (admin) + DIRECTUS_URL in .env.
 */

import 'dotenv/config';
import { writeFileSync } from 'node:fs';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';

const EMIT_SQL = process.argv.includes('--emit-sql');
const outFlagIdx = process.argv.indexOf('--out');
const OUT_PATH = outFlagIdx !== -1 ? process.argv[outFlagIdx + 1] : 'scripts/fix-user-fk-ondelete.sql';

if (!DIRECTUS_TOKEN) {
	console.error('Error: DIRECTUS_SERVER_TOKEN (or DIRECTUS_ADMIN_TOKEN) env var required');
	process.exit(1);
}

const headers = { Authorization: `Bearer ${DIRECTUS_TOKEN}` };
const BLOCKING = new Set(['NO ACTION', 'RESTRICT', null, '', undefined]);

interface Relation {
	collection: string;
	field: string;
	related_collection: string;
	schema?: {
		on_delete?: string | null;
		constraint_name?: string | null;
		column?: string | null;
		foreign_key_table?: string | null;
		foreign_key_column?: string | null;
	} | null;
}

async function get<T>(path: string): Promise<T> {
	const res = await fetch(`${DIRECTUS_URL}${path}`, { headers });
	if (!res.ok) throw new Error(`GET ${path} -> ${res.status} ${await res.text()}`);
	return (await res.json()).data as T;
}

const q = (id: string) => `"${id.replace(/"/g, '""')}"`;

async function main() {
	console.log(`Directus: ${DIRECTUS_URL}\n`);

	const [relations, fields] = await Promise.all([
		get<Relation[]>('/relations?limit=-1'),
		get<{ collection: string; field: string; schema?: { is_nullable?: boolean } | null }[]>('/fields?limit=-1'),
	]);

	const nullable = new Map<string, boolean>();
	for (const f of fields) {
		if (f.schema) nullable.set(`${f.collection}.${f.field}`, f.schema.is_nullable !== false);
	}

	const blocking = relations
		.filter((r) => r.related_collection === 'directus_users' && BLOCKING.has(r.schema?.on_delete ?? null))
		.sort((a, b) => `${a.collection}.${a.field}`.localeCompare(`${b.collection}.${b.field}`));

	const plan = blocking.map((r) => {
		const isNullable = nullable.get(`${r.collection}.${r.field}`) ?? true;
		const rule: 'SET NULL' | 'CASCADE' = isNullable ? 'SET NULL' : 'CASCADE';
		const constraint = r.schema?.constraint_name || `${r.collection}_${r.field}_foreign`;
		const column = r.schema?.column || r.field;
		const refTable = r.schema?.foreign_key_table || 'directus_users';
		const refCol = r.schema?.foreign_key_column || 'id';
		return { ...r, rule, constraint, column, refTable, refCol, isNullable };
	});

	const setNull = plan.filter((p) => p.rule === 'SET NULL');
	const cascade = plan.filter((p) => p.rule === 'CASCADE');

	console.log(`Blocking relations -> directus_users (NO ACTION/RESTRICT): ${plan.length}`);
	console.log(`  ${setNull.length} nullable  -> ON DELETE SET NULL`);
	console.log(`  ${cascade.length} not-null  -> ON DELETE CASCADE`);
	if (cascade.length) {
		console.log('\n  CASCADE targets (dependent row deleted with the user):');
		for (const p of cascade) console.log(`    ${p.collection}.${p.column}`);
	}

	if (!EMIT_SQL) {
		console.log(`\nRun with --emit-sql to write the migration to ${OUT_PATH}.`);
		return;
	}

	// Emit a defensive plpgsql DO block instead of bare ALTERs because:
	//   1. Many targets are Directus meta-only relations with NO physical column
	//      / FK — we must skip those, not error on them.
	//   2. ADD CONSTRAINT validates existing rows; audit columns accumulate
	//      ORPHANS (refs to already-deleted users), so we null them (or delete
	//      the row, for NOT NULL CASCADE targets) BEFORE (re)adding the FK.
	//   3. The whole block runs in one implicit transaction — all or nothing.
	const sqlEsc = (s: string) => s.replace(/'/g, "''");
	const rows = plan
		.map((p) => `    ('${sqlEsc(p.collection)}','${sqlEsc(p.column)}','${sqlEsc(p.constraint)}','${p.rule}')`)
		.join(',\n');

	const sql = `-- Fix ON DELETE rules on FKs to directus_users that block user deletion.
-- Generated by scripts/fix-user-fk-ondelete.ts from live schema introspection.
-- Idempotent + safe to re-run. For each (table,column) referencing a user:
--   * skips it if the column does not physically exist
--   * nulls orphan refs (or deletes the row for NOT NULL CASCADE targets)
--   * drops any existing FK and re-adds it with the correct ON DELETE rule
DO $mig$
DECLARE
  r record;
  n_clean bigint;
BEGIN
  FOR r IN SELECT * FROM (VALUES
${rows}
  ) AS t(tbl, col, con, rule)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = r.tbl AND column_name = r.col
    ) THEN
      RAISE NOTICE 'skip %.% (no such column)', r.tbl, r.col;
      CONTINUE;
    END IF;

    IF r.rule = 'CASCADE' THEN
      EXECUTE format(
        'DELETE FROM %I WHERE %I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM directus_users u WHERE u.id = %I.%I)',
        r.tbl, r.col, r.tbl, r.col);
    ELSE
      EXECUTE format(
        'UPDATE %I SET %I = NULL WHERE %I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM directus_users u WHERE u.id = %I.%I)',
        r.tbl, r.col, r.col, r.tbl, r.col);
    END IF;
    GET DIAGNOSTICS n_clean = ROW_COUNT;
    IF n_clean > 0 THEN
      RAISE NOTICE 'cleaned % orphan(s) on %.%', n_clean, r.tbl, r.col;
    END IF;

    -- The Directus API mis-reports nullability for some columns (e.g.
    -- time_entries.user), so a SET NULL FK can land on a NOT NULL column and
    -- then fail at delete time. If we're about to SET NULL, widen the column.
    IF r.rule <> 'CASCADE' AND EXISTS (
      SELECT 1 FROM pg_attribute a
      JOIN pg_class cl ON cl.oid = a.attrelid
      JOIN pg_namespace ns ON ns.oid = cl.relnamespace AND ns.nspname = 'public'
      WHERE cl.relname = r.tbl AND a.attname = r.col AND a.attnum > 0 AND a.attnotnull
    ) THEN
      EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP NOT NULL', r.tbl, r.col);
      RAISE NOTICE 'dropped NOT NULL on %.% so SET NULL can apply', r.tbl, r.col;
    END IF;

    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', r.tbl, r.con);
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES directus_users(id) ON DELETE ' || r.rule,
      r.tbl, r.con, r.col);
  END LOOP;
END
$mig$;
`;

	writeFileSync(OUT_PATH, sql);
	console.log(`\nWrote DO block covering ${plan.length} target(s) to ${OUT_PATH}`);
	console.log(`Apply with:  psql "$DATABASE_URL" -f ${OUT_PATH}`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
