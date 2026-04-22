#!/usr/bin/env npx tsx
/**
 * Tier 2 item I — Phase 3: Cut over `clients.status` to lifecycle enum
 *
 * Replaces the existing `clients.status` field interface options + display
 * options + default + nullability so it mirrors `contacts.status` and
 * `leads.status`:
 *   - enum: published | draft | archived
 *   - default: published
 *   - is_nullable: false
 *
 * Run AFTER:
 *   1. `setup-client-account-state-field.ts --apply`        (additive)
 *   2. `migrate-client-status-data.ts --apply`              (data copy)
 *   3. Code refactor that reads account_state for semantic state
 *      (otherwise filters like status='active' return 0 rows once this
 *      script lands).
 *
 * Safety:
 *   - Dry-run by default. Requires `--apply` to write.
 *   - Refuses to apply if any clients row still has a non-lifecycle
 *     `status` value — surfaces the unmigrated rows so you know to run
 *     script 2 first.
 *   - Idempotent: skips if `status` field already has the lifecycle enum
 *     (compares choices set).
 *
 * The underlying DB column type (varchar/255) is NOT changed — only the
 * Directus field meta. The data is already lifecycle values from script 2.
 */

import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';

if (!DIRECTUS_TOKEN) {
  console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN environment variable is required');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');

const LIFECYCLE_VALUES = new Set(['published', 'draft', 'archived']);

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

const NEW_STATUS_FIELD_PATCH = {
  meta: {
    interface: 'select-dropdown',
    special: null,
    options: {
      choices: [
        { text: '$t:published', value: 'published', color: 'var(--theme--primary)' },
        { text: '$t:draft', value: 'draft', color: 'var(--theme--foreground)' },
        { text: '$t:archived', value: 'archived', color: 'var(--theme--warning)' },
      ],
    },
    display: 'labels',
    display_options: {
      showAsDot: true,
      choices: [
        { text: '$t:published', value: 'published', color: 'var(--theme--primary)', foreground: 'var(--theme--primary)', background: 'var(--theme--primary-background)' },
        { text: '$t:draft', value: 'draft', color: 'var(--theme--foreground)', foreground: 'var(--theme--foreground)', background: 'var(--theme--background-normal)' },
        { text: '$t:archived', value: 'archived', color: 'var(--theme--warning)', foreground: 'var(--theme--warning)', background: 'var(--theme--warning-background)' },
      ],
    },
    width: 'half',
    sort: 2,
    searchable: true,
  },
  schema: {
    default_value: 'published',
    is_nullable: false,
  },
};

async function main() {
  console.log(`\n${APPLY ? '🔧 APPLY' : '🔍 DRY-RUN'} mode — Directus: ${DIRECTUS_URL}`);

  // 1. Verify all rows are already on lifecycle values.
  console.log('\n── Verifying data is fully migrated…');
  const params = new URLSearchParams({
    fields: 'id,name,status',
    limit: '-1',
  });
  const { data: rows, error: rowsErr } = await directusRequest<Array<{ id: string; name: string; status: string | null }>>(
    `/items/clients?${params}`,
  );
  if (rowsErr) throw new Error(`Failed to fetch clients: ${rowsErr}`);

  const stragglers = (rows || []).filter((r) => !r.status || !LIFECYCLE_VALUES.has(r.status));
  if (stragglers.length > 0) {
    const verb = APPLY ? '✗ Refusing to apply' : '⚠ Heads-up';
    console.log(`\n${verb}: ${stragglers.length} client(s) still on the semantic enum. Run \`migrate-client-status-data.ts --apply\` first.`);
    console.log('  Sample:');
    for (const r of stragglers.slice(0, 5)) {
      console.log(`    - ${r.id}  "${r.name}"  status="${r.status ?? '(null)'}"`);
    }
    if (stragglers.length > 5) console.log(`    … and ${stragglers.length - 5} more`);
    if (APPLY) process.exit(2);
    console.log('\n  (continuing dry-run plan below — these would block --apply.)');
  } else {
    console.log(`  ✓ All ${rows!.length} rows have lifecycle status values.`);
  }

  // 2. Check current field config for idempotency.
  console.log('\n── Checking current clients.status field config…');
  const { data: field, error: fieldErr } = await directusRequest<any>('/fields/clients/status');
  if (fieldErr) throw new Error(`Failed to read field: ${fieldErr}`);

  const currentChoices: Array<{ value: string }> = field?.meta?.options?.choices ?? [];
  const currentValues = new Set(currentChoices.map((c) => c.value));
  const isAlreadyLifecycle =
    currentValues.size === 3 &&
    currentValues.has('published') &&
    currentValues.has('draft') &&
    currentValues.has('archived');

  console.log(`  current enum: ${[...currentValues].join(' | ') || '(empty)'}`);
  console.log(`  already lifecycle? ${isAlreadyLifecycle ? 'YES' : 'NO'}`);

  if (isAlreadyLifecycle) {
    console.log('\n  ✓ Nothing to do. Field already on lifecycle enum.');
    return;
  }

  console.log('\nPlan:');
  console.log('  PATCH /fields/clients/status');
  console.log('    options.choices       → published | draft | archived');
  console.log('    schema.default_value  → "published"');
  console.log('    schema.is_nullable    → false');

  if (!APPLY) {
    console.log('\nThis was a DRY RUN. Re-run with --apply to write.');
    return;
  }

  const { error: patchErr } = await directusRequest('/fields/clients/status', 'PATCH', NEW_STATUS_FIELD_PATCH);
  if (patchErr) {
    console.error(`\n✗ Patch failed: ${patchErr}`);
    process.exit(1);
  }
  console.log('\n✓ clients.status now uses the lifecycle enum.');
  console.log('\nNext:');
  console.log('  - `pnpm generate:types` to refresh shared/directus.ts (Client.status type narrows to lifecycle).');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
