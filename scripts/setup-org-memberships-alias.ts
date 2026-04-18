#!/usr/bin/env npx tsx
/**
 * Add an o2m alias field `memberships` on the `organizations` collection,
 * exposing the reverse of `org_memberships.organization` (which is an m2o
 * from `org_memberships` to `organizations`).
 *
 * Why: without this alias, Directus filter expressions cannot traverse from
 * an organization to its memberships. The row-permission rule installed by
 * `setup-org-row-permissions.ts` uses exactly that traversal:
 *
 *   { organization: { memberships: { user: { _eq: $CURRENT_USER },
 *                                    status: { _eq: 'active' } } } }
 *
 * Safety:
 * - The alias is a virtual field. No database column is created.
 * - The operation adds the field and an o2m relation linking the collections
 *   via `org_memberships.organization`. It does not touch existing data.
 * - Dry-run by default. Requires `--apply` to write.
 * - Idempotent: skips if the field already exists.
 *
 * Usage:
 *   pnpm tsx scripts/setup-org-memberships-alias.ts          # dry-run
 *   pnpm tsx scripts/setup-org-memberships-alias.ts --apply  # write
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

async function fieldExists(): Promise<boolean> {
  const { data, status } = await directusRequest<any>('/fields/organizations/memberships');
  return status === 200 && !!data;
}

// The /relations endpoint does not support filter query params reliably,
// so pull the full list and scan client-side.
async function findRelation(): Promise<any | null> {
  const { data } = await directusRequest<any[]>('/relations?limit=-1');
  if (!data) return null;
  return data.find((r) => r.collection === 'org_memberships' && r.field === 'organization') || null;
}

async function main() {
  console.log(`\n${APPLY ? '🔧 APPLY' : '🔍 DRY-RUN'} mode — Directus: ${DIRECTUS_URL}\n`);

  const hasField = await fieldExists();
  const relation = await findRelation();
  const hasRelationMeta = !!relation;
  const hasMembershipsAlias = relation?.meta?.one_field === 'memberships';

  console.log(`organizations.memberships alias field:              ${hasField ? 'present' : 'missing'}`);
  console.log(`/relations row for org_memberships.organization:    ${hasRelationMeta ? 'present' : 'missing'}`);
  console.log(`  meta.one_field === "memberships":                 ${hasMembershipsAlias ? 'yes' : 'no'}\n`);

  if (hasField && hasMembershipsAlias) {
    console.log('Nothing to do. Alias is already in place.');
    return;
  }

  // 1. Field on `organizations` — virtual alias, no DB column.
  const fieldPayload = {
    collection: 'organizations',
    field: 'memberships',
    type: 'alias',
    meta: {
      interface: 'list-o2m',
      special: ['o2m'],
      note: 'Active membership rows. Used by the row-permission rule in setup-org-row-permissions.ts.',
    },
    schema: null,
  };

  // 2. Relation metadata. If no row exists, POST a new one. If a row exists
  //    without one_field='memberships', PATCH it. Both operations only touch
  //    Directus metadata — the underlying FK column is unchanged.
  const relationCreatePayload = {
    collection: 'org_memberships',
    field: 'organization',
    related_collection: 'organizations',
    meta: {
      one_field: 'memberships',
      one_deselect_action: 'nullify',
      sort_field: null,
      junction_field: null,
    },
  };

  console.log('Plan:');
  if (!hasField) {
    console.log('  1. POST /fields/organizations — create alias field `memberships`');
  } else {
    console.log('  1. skip: alias field already exists');
  }
  if (!hasRelationMeta) {
    console.log('  2. POST /relations — register org_memberships.organization → organizations (one_field: "memberships")');
  } else if (!hasMembershipsAlias) {
    console.log(`  2. PATCH /relations/${relation.meta?.id} — set meta.one_field = "memberships"`);
  } else {
    console.log('  2. skip: relation already exposes memberships');
  }
  console.log('');

  if (!APPLY) {
    console.log('This was a DRY RUN. Re-run with --apply to write changes.');
    return;
  }

  if (!hasField) {
    const { error } = await directusRequest('/fields/organizations', 'POST', fieldPayload);
    if (error) {
      console.error(`Failed to create field: ${error}`);
      process.exit(1);
    }
    console.log('✓ Created organizations.memberships alias field');
  }

  if (!hasRelationMeta) {
    const { error } = await directusRequest('/relations', 'POST', relationCreatePayload);
    if (error) {
      console.error(`Failed to create relation: ${error}`);
      process.exit(1);
    }
    console.log('✓ Created relation row with meta.one_field = "memberships"');
  } else if (!hasMembershipsAlias) {
    const metaId = relation.meta?.id;
    if (!metaId) {
      console.error('Fatal: found relation row but no meta.id to patch.');
      process.exit(1);
    }
    const { error } = await directusRequest(`/relations/${metaId}`, 'PATCH', {
      meta: { ...(relation.meta ?? {}), one_field: 'memberships' },
    });
    if (error) {
      console.error(`Failed to patch relation: ${error}`);
      process.exit(1);
    }
    console.log('✓ Patched relation to expose memberships o2m alias');
  }

  console.log('\nDone. Next: run `pnpm tsx scripts/setup-org-row-permissions.ts` (dry-run) to confirm the filter resolves.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
