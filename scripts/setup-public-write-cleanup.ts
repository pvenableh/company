#!/usr/bin/env npx tsx
/**
 * Revoke unfiltered write permissions on the Directus Public policy.
 *
 * Context (Pass 0 follow-up, 2026-04-17):
 * The Public policy (id abf8a154-5b1c-4a46-ac9c-7300570f4f17) has 33 grants
 * with `permissions: null` for create/update/delete/share on 12 collections.
 * A codebase audit confirmed that every real intake flow (Twilio call logs,
 * Stripe webhooks, public video booking/join, org invites, folder creation,
 * legacy contact form) goes through a server route that uses a static/server
 * Directus token — none of them rely on the Public policy for writes.
 *
 * Public READ grants (175 of them) are intentional per product decision and
 * are NOT touched by this script.
 *
 * Safety:
 * - Dry-run by default. Requires `--apply` to delete permission rows.
 * - Idempotent: if a targeted permission row is already gone, it's skipped.
 * - Only touches the Public policy. Administrator / Client Manager /
 *   Carddesk User / Client are not considered.
 * - A backup of the full /permissions table should be taken before --apply
 *   (see .backups/ or re-run: `curl "$URL/permissions?limit=-1" -H
 *   "Authorization: Bearer $TOKEN" > .backups/permissions-$(date -u +%Y%m%d-%H%M%SZ).json`).
 *
 * Usage:
 *   pnpm tsx scripts/setup-public-write-cleanup.ts          # dry-run
 *   pnpm tsx scripts/setup-public-write-cleanup.ts --apply  # delete rows
 */

import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';

if (!DIRECTUS_TOKEN) {
  console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN environment variable is required');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');

const PUBLIC_POLICY_ID = 'abf8a154-5b1c-4a46-ac9c-7300570f4f17';

type Action = 'create' | 'update' | 'delete' | 'share';

// Every unfiltered Public write as of 2026-04-17. All are REVOKE.
// Reasoning lives in the closing memo; the script just deletes them.
const REVOKE_TARGETS: Array<{ collection: string; action: Action }> = [
  { collection: 'call_logs', action: 'create' },
  { collection: 'directus_comments', action: 'create' },
  { collection: 'directus_folders', action: 'create' },
  { collection: 'directus_folders', action: 'update' },
  { collection: 'goal_snapshots', action: 'create' },
  { collection: 'goal_snapshots', action: 'update' },
  { collection: 'goal_snapshots', action: 'delete' },
  { collection: 'goals', action: 'create' },
  { collection: 'goals', action: 'update' },
  { collection: 'goals', action: 'delete' },
  { collection: 'invoices', action: 'update' },
  { collection: 'invoices_projects', action: 'create' },
  { collection: 'invoices_projects', action: 'update' },
  { collection: 'invoices_projects', action: 'delete' },
  { collection: 'organizations', action: 'create' },
  { collection: 'organizations', action: 'update' },
  { collection: 'organizations_directus_users', action: 'create' },
  { collection: 'organizations_directus_users', action: 'update' },
  { collection: 'organizations_directus_users', action: 'delete' },
  { collection: 'organizations_directus_users', action: 'share' },
  { collection: 'payments_received', action: 'create' },
  { collection: 'payments_received', action: 'update' },
  { collection: 'payments_received', action: 'delete' },
  { collection: 'payments_received', action: 'share' },
  { collection: 'requests', action: 'create' },
  { collection: 'requests', action: 'update' },
  { collection: 'requests', action: 'delete' },
  { collection: 'requests', action: 'share' },
  { collection: 'services', action: 'create' },
  { collection: 'services', action: 'update' },
  { collection: 'services', action: 'delete' },
  { collection: 'services', action: 'share' },
  { collection: 'video_meeting_attendees', action: 'create' },
];

interface Permission {
  id: number;
  collection: string;
  action: string;
  policy: string | null;
  permissions: unknown;
  fields: unknown;
}

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

// /permissions ignores filter query params reliably; pull all and filter client-side.
async function fetchPublicPermissions(): Promise<Permission[]> {
  const { data, error } = await directusRequest<Permission[]>('/permissions?limit=-1');
  if (error || !data) throw new Error(`Failed to fetch permissions: ${error}`);
  return data.filter((p) => p.policy === PUBLIC_POLICY_ID);
}

async function main() {
  console.log(`\n${APPLY ? '🔧 APPLY' : '🔍 DRY-RUN'} mode — Directus: ${DIRECTUS_URL}\n`);

  const publicPerms = await fetchPublicPermissions();

  type Plan = {
    collection: string;
    action: Action;
    rowId: number | null;
    unfiltered: boolean;
  };

  // Directus treats both `null` and `{}` (empty object) as "no filter".
  const isUnfiltered = (p: unknown): boolean =>
    p === null || (typeof p === 'object' && p !== null && Object.keys(p as object).length === 0);

  const plan: Plan[] = REVOKE_TARGETS.map(({ collection, action }) => {
    const row = publicPerms.find((p) => p.collection === collection && p.action === action);
    return {
      collection,
      action,
      rowId: row?.id ?? null,
      unfiltered: row ? isUnfiltered(row.permissions) : false,
    };
  });

  const toDelete = plan.filter((p) => p.rowId !== null);
  const missing = plan.filter((p) => p.rowId === null);
  const filteredAlready = plan.filter((p) => p.rowId !== null && !p.unfiltered);

  console.log('Plan:');
  console.log(`  Total targets:                          ${plan.length}`);
  console.log(`  Already gone (nothing to do):           ${missing.length}`);
  console.log(`  Present and filtered (leave alone):     ${filteredAlready.length}`);
  console.log(`  Present and unfiltered (will revoke):   ${toDelete.filter((p) => p.unfiltered).length}\n`);

  if (missing.length > 0) {
    console.log('Skipped — already absent:');
    for (const p of missing) console.log(`  - ${p.collection}.${p.action}`);
    console.log('');
  }

  if (filteredAlready.length > 0) {
    console.log('Skipped — already narrowed (row has a filter; not in scope for this pass):');
    for (const p of filteredAlready) console.log(`  - ${p.collection}.${p.action} (id ${p.rowId})`);
    console.log('');
  }

  const deletable = toDelete.filter((p) => p.unfiltered);
  if (deletable.length === 0) {
    console.log('Nothing to do. Public policy has no unfiltered write grants in the target set.');
    return;
  }

  console.log(`Will DELETE ${deletable.length} unfiltered Public write grant(s):`);
  for (const p of deletable) {
    console.log(`  - DELETE /permissions/${p.rowId}   (${p.collection}.${p.action})`);
  }
  console.log('');

  if (!APPLY) {
    console.log('This was a DRY RUN. Re-run with --apply to delete these rows.');
    console.log('Reminder: take a backup first:');
    console.log(`  curl -s "${DIRECTUS_URL}/permissions?limit=-1" -H "Authorization: Bearer $DIRECTUS_SERVER_TOKEN" > .backups/permissions-$(date -u +%Y%m%d-%H%M%SZ).json`);
    return;
  }

  let ok = 0;
  let fail = 0;
  for (const p of deletable) {
    const { error } = await directusRequest(`/permissions/${p.rowId}`, 'DELETE');
    if (error) {
      console.error(`  ✗ ${p.collection}.${p.action} (id ${p.rowId}): ${error}`);
      fail++;
    } else {
      console.log(`  ✓ ${p.collection}.${p.action} (id ${p.rowId}) revoked`);
      ok++;
    }
  }

  console.log(`\nDone. ${ok} revoked, ${fail} failed.`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
