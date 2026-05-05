#!/usr/bin/env npx tsx
/**
 * Cleanup `organizations_directus_users` rows for client-portal users.
 *
 * Background: prior to 2026-05-05, invite-client.post.ts created BOTH an
 * `org_memberships` row (role=client, scoped to one client record) AND a
 * legacy `organizations_directus_users` junction row. The junction grants
 * org-wide read access via Directus row-level filters — exactly what we
 * don't want for portal users. They should only see their scoped client
 * (and child clients), not every project/invoice/contact in the org.
 *
 * Safety rules:
 *   - Only delete junction rows where the user's ONLY membership in that
 *     org is role=client. If they ALSO have a member/manager/admin/owner
 *     membership somewhere in that same org (multi-role, e.g. a contractor
 *     who's also a client), keep the junction.
 *   - Dry run by default. Pass --apply to actually delete rows.
 *
 * Usage:
 *   pnpm tsx scripts/cleanup-client-junctions.ts            # dry run
 *   pnpm tsx scripts/cleanup-client-junctions.ts --apply    # delete rows
 */
import 'dotenv/config';
import { createDirectus, rest, staticToken, readItems, deleteItems } from '@directus/sdk';

const URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!TOKEN) { console.error('DIRECTUS_SERVER_TOKEN required'); process.exit(1); }

const APPLY = process.argv.includes('--apply');

const directus = createDirectus(URL).with(staticToken(TOKEN)).with(rest());

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (will delete)' : 'DRY RUN (no changes)'}\n`);

  // 1. Find all org_memberships with role.slug='client'
  const clientMemberships = await directus.request(
    readItems('org_memberships', {
      filter: { role: { slug: { _eq: 'client' } } },
      fields: ['id', 'user', 'organization', 'status', 'role.slug'],
      limit: -1,
    })
  ) as any[];

  console.log(`Found ${clientMemberships.length} client-role memberships.`);

  // Group by user+org
  const byUserOrg = new Map<string, { user: string; org: string; statuses: string[] }>();
  for (const m of clientMemberships) {
    const u = typeof m.user === 'object' ? m.user?.id : m.user;
    const o = typeof m.organization === 'object' ? m.organization?.id : m.organization;
    if (!u || !o) continue;
    const key = `${u}::${o}`;
    if (!byUserOrg.has(key)) byUserOrg.set(key, { user: u, org: o, statuses: [] });
    byUserOrg.get(key)!.statuses.push(m.status);
  }

  console.log(`Unique (user, org) pairs with a client membership: ${byUserOrg.size}\n`);

  let toDelete: number[] = [];
  let kept = 0;

  for (const [, { user, org }] of byUserOrg) {
    // 2. Check if this user has ANY non-client membership in this same org.
    const otherRoles = await directus.request(
      readItems('org_memberships', {
        filter: {
          user: { _eq: user },
          organization: { _eq: org },
          role: { slug: { _neq: 'client' } },
        },
        fields: ['id', 'role.slug'],
        limit: 1,
      })
    ) as any[];

    if (otherRoles.length > 0) {
      console.log(`  KEEP  user=${user} org=${org} (also has role=${otherRoles[0].role?.slug})`);
      kept++;
      continue;
    }

    // 3. Find junction row(s) for this user+org and queue for deletion.
    const junctions = await directus.request(
      readItems('organizations_directus_users', {
        filter: {
          directus_users_id: { _eq: user },
          organizations_id: { _eq: org },
        },
        fields: ['id'],
        limit: -1,
      })
    ) as any[];

    if (junctions.length === 0) {
      console.log(`  ok    user=${user} org=${org} — no junction row, already clean`);
      continue;
    }

    for (const j of junctions) {
      console.log(`  REMOVE junction#${j.id} user=${user} org=${org}`);
      toDelete.push(j.id);
    }
  }

  console.log(`\nSummary:`);
  console.log(`  Kept (user has another role in same org): ${kept}`);
  console.log(`  Junction rows queued for deletion:        ${toDelete.length}`);

  if (!APPLY) {
    console.log(`\nDry run only. Re-run with --apply to delete.`);
    return;
  }

  if (toDelete.length === 0) {
    console.log(`\nNothing to delete.`);
    return;
  }

  // Delete in batches of 100
  const BATCH = 100;
  for (let i = 0; i < toDelete.length; i += BATCH) {
    const batch = toDelete.slice(i, i + BATCH);
    await directus.request(deleteItems('organizations_directus_users', batch));
    console.log(`Deleted batch ${i / BATCH + 1} (${batch.length} rows)`);
  }
  console.log(`\nDone. Removed ${toDelete.length} legacy junction row(s).`);
}

main().catch((e) => {
  console.error('Failed:', e?.message || e);
  process.exit(1);
});
