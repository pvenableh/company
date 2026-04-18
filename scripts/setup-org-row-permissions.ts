#!/usr/bin/env npx tsx
/**
 * ⚠️  DEPRECATED 2026-04-17. DO NOT RUN WITHOUT RE-ASSESSING SCOPE.
 *
 * Why this was dropped: the original premise was "tighten authenticated-user
 * reads to their own org via a row-rule filter, since client-side org filters
 * are the only tenant-data gate." After running the audit, we found that the
 * Public policy has ~175 unfiltered read permissions across tenant
 * collections — and those are intentional per product decision. With reads
 * open to anonymous clients by design, narrowing authenticated-policy reads
 * accomplishes nothing for tenant isolation; it would just be cosmetic.
 *
 * The script is left in the repo for two reasons:
 *   1. The /relations traversal and policy-discovery code is still useful
 *      if a future pass needs to apply write-side filters.
 *   2. The `organizations.memberships` alias and row-filter syntax it uses
 *      is the reference for how to write such a filter.
 *
 * If you're reconsidering this pass, FIRST check whether the Public read
 * posture has changed. If Public reads are still intentional, don't run
 * this. If the product stance flipped, the script is a reasonable starting
 * point but re-review the target policies list and SKIP_COLLECTIONS set.
 *
 * See: memory/pass0_data_fetch_safety.md for the full reasoning.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ORIGINAL DESCRIPTION (kept for reference):
 *
 * Directus Org-Scoped Row Permissions Setup Script — DRAFT (do not run without review)
 *
 * Adds row-level `read` permission filters to every collection that has an
 * `organization` field, so non-admin users can only read rows belonging to an
 * org they are a member of. Without this, most collections are wide-open at
 * the row level (permissions:null) and client-side org filters are the only
 * tenant-data gate.
 *
 * Row rule applied:
 *   { organization: { memberships: {
 *       user: { _eq: '$CURRENT_USER' },
 *       status: { _eq: 'active' },
 *   } } }
 *
 * Uses the `org_memberships` collection — canonical per a 2026-04-17 audit:
 * 50 active memberships vs 8 legacy junction rows, with 43 memberships
 * having no junction entry. The legacy `organizations_directus_users`
 * junction is ignored. One stale junction row — API Admin in the "hue" org —
 * intentionally loses read access via this change.
 *
 * PREREQUISITE: the `memberships` field must exist on the `organizations`
 * collection as an o2m alias pointing to `org_memberships.organization`.
 * Run `scripts/setup-org-memberships-alias.ts` first to add it.
 *
 * SAFETY:
 *   - Dry-run by default. Prints the change plan without touching Directus.
 *   - Requires `--apply` to write.
 *   - Only touches `read` permissions in this first pass — does not change
 *     create/update/delete.
 *   - Skips any collection listed in SKIP_COLLECTIONS (AI/carddesk use their
 *     own owner-based rules; don't overwrite them).
 *   - Skips any existing `read` permission whose filter already matches.
 *
 * PRE-RUN CHECKLIST:
 *   1. Confirm every active user has at least one entry in
 *      organizations_directus_users for every org whose data they should see.
 *      Users missing a junction row will lose read access.
 *   2. Take a Directus backup (snapshot the permissions table at minimum).
 *   3. Run without --apply first. Review the plan.
 *   4. Run with --apply on a staging instance before production.
 *
 * Usage:
 *   pnpm tsx scripts/setup-org-row-permissions.ts              # dry-run
 *   pnpm tsx scripts/setup-org-row-permissions.ts --apply      # write
 *   pnpm tsx scripts/setup-org-row-permissions.ts --collection=invoices --apply
 *
 * Revert:
 *   This script does not delete existing permissions; to revert, restore the
 *   pre-change permissions table from the backup taken in step 2.
 */

import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';

if (!DIRECTUS_TOKEN) {
  console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN environment variable is required');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const COLLECTION_ARG = process.argv.find((a) => a.startsWith('--collection='))?.split('=')[1];

const ADMIN_ROLE_ID = '3a63a4e1-c82e-46f8-9993-7f11ac6a4b01';

// Collections that already have their own ownership rules or shouldn't be
// touched. Do NOT overwrite.
const SKIP_COLLECTIONS = new Set<string>([
  // AI-suite — handled by setup-ai-permissions.ts with user-ownership rules.
  'ai_preferences',
  'ai_chat_sessions',
  'ai_chat_messages',
  'ai_notes',
  'ai_notes_ai_tag',
  'ai_notes_ai_tags',
  'ai_tags',
  'ai_context_snapshots',
  'ai_notice_history',
  'ai_usage_logs',
  'financial_goals',
  // System / identity collections.
  'directus_users',
  'directus_files',
  'directus_folders',
  'organizations',
  'org_memberships',
  'org_roles',
  'organizations_directus_users',
]);

// Policies that this script applies to. Restricted by design:
//   - Administrator: admin_access bypass — can't restrict.
//   - $t:public_label (Public): unauthenticated; should never read org data.
//     Handled separately if it needs any access at all.
//   - Client: external client portal; access is scoped by client, not org.
//     Handle in a followup pass with a client-scoped filter.
// In this first pass only tighten existing reads for Client Manager and
// Carddesk User (the main team/app roles).
const TARGET_POLICY_NAMES = new Set<string>(['Client Manager', 'Carddesk User']);

const ROW_FILTER = {
  organization: {
    memberships: {
      user: { _eq: '$CURRENT_USER' },
      status: { _eq: 'active' },
    },
  },
};

// ─── API helpers ──────────────────────────────────────────────────────────────

async function directusRequest<T = unknown>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  body?: unknown,
): Promise<{ data: T | null; error: string | null }> {
  try {
    const response = await fetch(`${DIRECTUS_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DIRECTUS_TOKEN}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    if (!response.ok) return { data: null, error: `${response.status}: ${text}` };
    const json = text ? JSON.parse(text) : {};
    return { data: (json.data ?? null) as T, error: null };
  } catch (err: any) {
    return { data: null, error: err.message };
  }
}

// ─── Discovery ────────────────────────────────────────────────────────────────

async function getCollectionsWithOrganizationField(): Promise<string[]> {
  // Directus system endpoints ignore `filter` query params. Fetch everything
  // and filter client-side.
  const { data: fields, error } = await directusRequest<any[]>('/fields?limit=-1');
  if (error || !fields) {
    console.error('Failed to enumerate fields:', error);
    process.exit(1);
  }
  const collections = new Set<string>();
  for (const f of fields) {
    if (f.field !== 'organization') continue;
    if (!f.collection) continue;
    collections.add(f.collection as string);
  }
  return [...collections]
    .filter((c) => !SKIP_COLLECTIONS.has(c))
    .filter((c) => !c.startsWith('directus_'))
    .filter((c) => (COLLECTION_ARG ? c === COLLECTION_ARG : true))
    .sort();
}

async function getTargetPolicies(): Promise<Array<{ id: string; name: string }>> {
  const { data } = await directusRequest<any[]>(
    '/policies?fields=id,name,admin_access&limit=-1',
  );
  return (data || [])
    .filter((p) => !p.admin_access && TARGET_POLICY_NAMES.has(p.name))
    .map((p) => ({ id: p.id, name: p.name }));
}

// Cache of all permissions rows. Directus system endpoints ignore `filter`
// query params, so we fetch once and filter client-side.
let _permissionsCache: any[] | null = null;
async function loadAllPermissions(): Promise<any[]> {
  if (_permissionsCache) return _permissionsCache;
  const { data, error } = await directusRequest<any[]>('/permissions?limit=-1');
  if (error || !data) {
    console.error('Failed to load permissions:', error);
    process.exit(1);
  }
  _permissionsCache = data;
  return data;
}

async function getExistingReadPermission(
  policyId: string,
  collection: string,
): Promise<{ id: string; permissions: any } | null> {
  const all = await loadAllPermissions();
  const match = all.find(
    (p) =>
      (p.policy === policyId || p.policy?.id === policyId) &&
      p.collection === collection &&
      p.action === 'read',
  );
  return match ?? null;
}

function filterMatches(existing: any): boolean {
  try {
    return JSON.stringify(existing) === JSON.stringify(ROW_FILTER);
  } catch {
    return false;
  }
}

// ─── Apply ────────────────────────────────────────────────────────────────────

// Outcomes:
//   skip  — existing permission already matches the desired filter.
//   narrow — existing permission has a different (or null) filter; we tighten it.
//   none  — no existing read permission; we INTENTIONALLY do not create one,
//           because creating would grant access the policy didn't have before.
//   fail  — API error.
async function applyToPolicy(
  policy: { id: string; name: string },
  collection: string,
): Promise<'skip' | 'narrow' | 'none' | 'fail'> {
  const existing = await getExistingReadPermission(policy.id, collection);
  if (!existing) return 'none';

  if (filterMatches(existing.permissions)) return 'skip';

  if (!APPLY) return 'narrow';
  const { error } = await directusRequest(`/permissions/${existing.id}`, 'PATCH', {
    permissions: ROW_FILTER,
  });
  return error ? 'fail' : 'narrow';
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${APPLY ? '🔧 APPLY' : '🔍 DRY-RUN'} mode — Directus: ${DIRECTUS_URL}\n`);
  if (COLLECTION_ARG) console.log(`Scoped to collection: ${COLLECTION_ARG}\n`);

  const collections = await getCollectionsWithOrganizationField();
  const policies = await getTargetPolicies();

  console.log(`Collections with 'organization' field (after skips): ${collections.length}`);
  console.log(`Target policies: ${policies.length} (${policies.map((p) => p.name).join(', ')})\n`);
  collections.forEach((c) => console.log(`  - ${c}`));

  const results: Record<'skip' | 'narrow' | 'none' | 'fail', number> = {
    skip: 0, narrow: 0, none: 0, fail: 0,
  };

  for (const collection of collections) {
    console.log(`\n── ${collection} ──`);
    for (const policy of policies) {
      const outcome = await applyToPolicy(policy, collection);
      results[outcome]++;
      const icon = { skip: '✓', narrow: '~', none: '·', fail: '✗' }[outcome];
      console.log(`  ${icon} ${policy.name.padEnd(20)} ${outcome}`);
    }
  }

  console.log('\n── Summary ──');
  console.log(`  skip   (already correct):            ${results.skip}`);
  console.log(`  narrow (tighten existing read):      ${results.narrow}`);
  console.log(`  none   (no existing read; untouched): ${results.none}`);
  console.log(`  fail:                                ${results.fail}`);
  if (!APPLY) {
    console.log(`\nThis was a DRY RUN. Re-run with --apply to write changes.`);
  }
  if (results.fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
