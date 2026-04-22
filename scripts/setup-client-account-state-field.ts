#!/usr/bin/env npx tsx
/**
 * Tier 2 item I — Phase 1: Add `clients.account_state` field
 *
 * Splits Client's status taxonomy:
 *   - `status` will become a lifecycle enum (published|draft|archived) —
 *     mirrors contacts/leads. Cutover happens in
 *     `setup-client-status-lifecycle-enum.ts` AFTER data migration.
 *   - `account_state` (this script) holds the customer relationship state
 *     (active|prospect|inactive|churned) that lives on `status` today.
 *
 * Run order:
 *   1. `pnpm tsx scripts/setup-client-account-state-field.ts --apply`   ← additive only
 *   2. `pnpm tsx scripts/migrate-client-status-data.ts --apply`         ← copies status → account_state, sets status='published'
 *   3. (refactor code to read account_state for semantic state, status for lifecycle)
 *   4. `pnpm tsx scripts/setup-client-status-lifecycle-enum.ts --apply` ← swaps status enum to published/draft/archived
 *
 * Safety:
 *   - Additive only. No existing field touched. Safe to re-run.
 *   - Dry-run by default. Requires `--apply` to write.
 *   - Idempotent: skips if `account_state` already exists.
 *
 * Field config mirrors the existing `clients.status` interface so the
 * Directus admin UI feels identical (same colors, same dot display).
 */

import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';

if (!DIRECTUS_TOKEN) {
  console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN environment variable is required');
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

async function fieldExists(collection: string, field: string): Promise<boolean> {
  const { status } = await directusRequest<any>(`/fields/${collection}/${field}`);
  return status === 200;
}

const ACCOUNT_STATE_FIELD = {
  field: 'account_state',
  type: 'string',
  meta: {
    interface: 'select-dropdown',
    special: null,
    options: {
      choices: [
        { text: 'Active', value: 'active', color: 'var(--theme--primary)' },
        { text: 'Prospect', value: 'prospect', color: 'var(--theme--foreground)' },
        { text: 'Inactive', value: 'inactive', color: 'var(--theme--warning)' },
        { text: 'Churned', value: 'churned', color: 'var(--theme--danger)' },
      ],
    },
    display: 'labels',
    display_options: {
      showAsDot: true,
      choices: [
        { text: 'Active', value: 'active', foreground: 'var(--theme--primary)', background: 'var(--theme--primary-background)' },
        { text: 'Prospect', value: 'prospect', foreground: 'var(--theme--foreground)', background: 'var(--theme--background-normal)' },
        { text: 'Inactive', value: 'inactive', foreground: 'var(--theme--warning)', background: 'var(--theme--warning-background)' },
        { text: 'Churned', value: 'churned', foreground: 'var(--theme--danger)', background: 'var(--theme--danger-background)' },
      ],
    },
    note: 'Customer relationship state. Lifecycle (published/draft/archived) lives on `status`.',
    width: 'half',
    sort: 3,
    searchable: true,
  },
  schema: {
    default_value: 'active',
    is_nullable: true,
    max_length: 255,
  },
};

async function main() {
  console.log(`\n${APPLY ? '🔧 APPLY' : '🔍 DRY-RUN'} mode — Directus: ${DIRECTUS_URL}`);
  console.log('\n── clients.account_state');

  const exists = await fieldExists('clients', 'account_state');
  console.log(`  field clients.account_state: ${exists ? 'present' : 'missing'}`);

  if (exists) {
    console.log('\n  ✓ Nothing to do. Field already exists.');
    return;
  }

  console.log('\nPlan:');
  console.log('  - POST /fields/clients — create `account_state` (string, dropdown, default "active", nullable)');
  console.log('    enum: active | prospect | inactive | churned');
  console.log('    interface mirrors current clients.status (same colors + dot display)');

  if (!APPLY) {
    console.log('\nThis was a DRY RUN. Re-run with --apply to write.');
    return;
  }

  const { error } = await directusRequest('/fields/clients', 'POST', ACCOUNT_STATE_FIELD);
  if (error) {
    console.error(`\n✗ Failed: ${error}`);
    process.exit(1);
  }
  console.log('\n✓ Created clients.account_state');
  console.log('\nNext:');
  console.log('  1. `pnpm tsx scripts/migrate-client-status-data.ts` (dry-run)');
  console.log('  2. `pnpm tsx scripts/migrate-client-status-data.ts --apply`');
  console.log('  3. `pnpm generate:types` to refresh shared/directus.ts');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
