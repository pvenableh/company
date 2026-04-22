#!/usr/bin/env npx tsx
/**
 * Tier 2 item I — Phase 2: Migrate clients.status data
 *
 * Per row:
 *   1. Set `account_state = status` (the old semantic value).
 *   2. Set `status = 'published'` (the new lifecycle value).
 *
 * Idempotent guard: skip rows where `account_state` is already set AND
 * `status` is already in the lifecycle enum (published|draft|archived).
 *
 * Run after `setup-client-account-state-field.ts --apply`.
 * Run BEFORE the code refactor that switches reads to account_state —
 * otherwise existing filters like `status=active` return 0 rows during the
 * window between this script + the refactor. The intended sequencing for a
 * single-developer cutover is: script 1 → script 2 → code refactor + commit
 * → script 3 (enum cutover).
 *
 * Safety:
 *   - Dry-run by default. Requires `--apply` to write.
 *   - Idempotent: skipped rows reported separately.
 *   - Shows sample (up to 10) of planned changes before applying.
 *   - Stops with non-zero exit if any row has a status outside the known
 *     enum (active|prospect|inactive|churned|published|draft|archived) —
 *     surfaces the unexpected value for manual review instead of guessing.
 */

import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';

if (!DIRECTUS_TOKEN) {
  console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN environment variable is required');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');

const SEMANTIC_VALUES = new Set(['active', 'prospect', 'inactive', 'churned']);
const LIFECYCLE_VALUES = new Set(['published', 'draft', 'archived']);

type ClientRow = {
  id: string;
  name: string;
  status: string | null;
  account_state: string | null;
};

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

async function fetchAllClients(): Promise<{ rows: ClientRow[]; fieldExists: boolean }> {
  // First try with account_state. If the field doesn't exist yet (script 1 not
  // run), retry without it and synthesize null — lets the dry-run still show
  // the planned changes before the field is created.
  const withField = new URLSearchParams({ fields: 'id,name,status,account_state', limit: '-1' });
  const { data, error } = await directusRequest<ClientRow[]>(`/items/clients?${withField}`);
  if (!error) return { rows: data || [], fieldExists: true };

  if (/account_state/i.test(error) && /FORBIDDEN|does not exist/i.test(error)) {
    console.log('  (account_state field not present yet — dry-run will treat all rows as unmigrated)');
    const fallback = new URLSearchParams({ fields: 'id,name,status', limit: '-1' });
    const { data: rawRows, error: err2 } = await directusRequest<Array<{ id: string; name: string; status: string | null }>>(
      `/items/clients?${fallback}`,
    );
    if (err2) throw new Error(`Failed to fetch clients (fallback): ${err2}`);
    return {
      rows: (rawRows || []).map((r) => ({ ...r, account_state: null })),
      fieldExists: false,
    };
  }
  throw new Error(`Failed to fetch clients: ${error}`);
}

type Plan = {
  toMigrate: ClientRow[];
  alreadyMigrated: ClientRow[];
  unknown: ClientRow[];
  bySource: Record<string, number>;
};

function buildPlan(rows: ClientRow[]): Plan {
  // Pivot on `status` alone. A row needs migration iff its status is still on
  // the semantic enum — regardless of what's in account_state, because adding
  // the field auto-backfilled every existing row with the default ('active'),
  // which is wrong for inactive/prospect/churned clients. We must overwrite
  // account_state from the source-of-truth status.
  const toMigrate: ClientRow[] = [];
  const alreadyMigrated: ClientRow[] = [];
  const unknown: ClientRow[] = [];
  const bySource: Record<string, number> = {};

  for (const r of rows) {
    const status = r.status;
    if (status != null && LIFECYCLE_VALUES.has(status)) {
      alreadyMigrated.push(r);
    } else if (status != null && SEMANTIC_VALUES.has(status)) {
      toMigrate.push(r);
      bySource[status] = (bySource[status] || 0) + 1;
    } else if (status == null) {
      toMigrate.push(r);
      bySource['(null)'] = (bySource['(null)'] || 0) + 1;
    } else {
      unknown.push(r);
    }
  }

  return { toMigrate, alreadyMigrated, unknown, bySource };
}

async function main() {
  console.log(`\n${APPLY ? '🔧 APPLY' : '🔍 DRY-RUN'} mode — Directus: ${DIRECTUS_URL}`);
  console.log('\nFetching clients…');
  const { rows, fieldExists } = await fetchAllClients();
  console.log(`  Total rows: ${rows.length}`);

  if (APPLY && !fieldExists) {
    console.error('\n✗ account_state field does not exist on clients. Run `setup-client-account-state-field.ts --apply` first.');
    process.exit(2);
  }

  const { toMigrate, alreadyMigrated, unknown, bySource } = buildPlan(rows);

  console.log(`\nPlan summary:`);
  console.log(`  to migrate:        ${toMigrate.length}`);
  console.log(`  already migrated:  ${alreadyMigrated.length}  (skipped)`);
  console.log(`  unknown status:    ${unknown.length}  (NEEDS REVIEW)`);

  if (Object.keys(bySource).length) {
    console.log('\nSource breakdown (old status → account_state):');
    for (const [k, v] of Object.entries(bySource)) {
      console.log(`  ${k.padEnd(10)} → ${k === '(null)' ? 'active' : k.padEnd(10)} : ${v} rows`);
    }
  }

  if (unknown.length > 0) {
    console.log('\n⚠ Rows with unknown status values — refusing to migrate. Review manually:');
    for (const r of unknown) {
      console.log(`  - ${r.id}  "${r.name}"  status="${r.status}"  account_state="${r.account_state ?? ''}"`);
    }
    process.exit(2);
  }

  if (toMigrate.length === 0) {
    console.log('\n✓ Nothing to migrate. All rows already have account_state + lifecycle status.');
    return;
  }

  console.log('\nSample (first 10 rows to migrate):');
  for (const r of toMigrate.slice(0, 10)) {
    const newAccountState = r.status == null ? 'active' : r.status;
    console.log(
      `  ${r.id}  "${r.name.padEnd(30).slice(0, 30)}"  ` +
      `status: "${r.status ?? '(null)'}" → "published"   ` +
      `account_state: "${r.account_state ?? '(null)'}" → "${newAccountState}"`,
    );
  }
  if (toMigrate.length > 10) console.log(`  … and ${toMigrate.length - 10} more`);

  if (!APPLY) {
    console.log('\nThis was a DRY RUN. Re-run with --apply to write.');
    return;
  }

  console.log(`\nWriting ${toMigrate.length} rows…`);
  let ok = 0;
  let fail = 0;
  for (const r of toMigrate) {
    const newAccountState = r.status == null ? 'active' : r.status;
    const { error } = await directusRequest(`/items/clients/${r.id}`, 'PATCH', {
      account_state: newAccountState,
      status: 'published',
    });
    if (error) {
      console.error(`  ✗ ${r.id} "${r.name}": ${error}`);
      fail++;
    } else {
      ok++;
    }
  }
  console.log(`\nResult: ${ok} updated, ${fail} failed.`);
  if (fail > 0) process.exit(1);

  console.log('\nNext:');
  console.log('  1. Refactor code to read account_state for semantic state, status for lifecycle.');
  console.log('  2. `pnpm generate:types` to refresh shared/directus.ts (after script 3).');
  console.log('  3. `pnpm tsx scripts/setup-client-status-lifecycle-enum.ts --apply` to swap the status enum interface.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
