#!/usr/bin/env npx tsx
/**
 * Backfill null-org leads with a resolved organization so the upcoming
 * useLeads tenant-data guard doesn't hide them.
 *
 * Strategy for each lead with organization IS NULL:
 *   1. Look up the lead's user_created in organizations_directus_users.
 *   2. If the user has exactly one org, assign that.
 *   3. If the user has multiple orgs, prefer the one whose name starts
 *      with "hue" (the legacy tenant these leads came from).
 *   4. If the user has zero orgs (system/API user case), fall back to
 *      --default-org=<uuid>.
 *
 * Usage:
 *   npx tsx scripts/backfill-null-org-leads.ts                         # dry run
 *   npx tsx scripts/backfill-null-org-leads.ts --execute                # apply
 *   npx tsx scripts/backfill-null-org-leads.ts --default-org=<uuid>     # fallback
 *   npx tsx scripts/backfill-null-org-leads.ts --diagnose                # only inspect users
 *
 * Idempotent: re-running is safe. Only updates leads that still have
 * organization IS NULL.
 *
 * Reads DIRECTUS_URL and DIRECTUS_SERVER_TOKEN from .env (or environment).
 */

import { createDirectus, rest, authentication, readItems, updateItem } from '@directus/sdk';
import { config } from 'dotenv';

config();

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'https://admin.earnest.guru';
const DIRECTUS_SERVER_TOKEN = process.env.DIRECTUS_SERVER_TOKEN;

if (!DIRECTUS_SERVER_TOKEN) {
  console.error('ERROR: DIRECTUS_SERVER_TOKEN is not set. Add it to your .env file.');
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = !args.includes('--execute');
const diagnoseOnly = args.includes('--diagnose');
const defaultOrgArg = args.find((a) => a.startsWith('--default-org='));
const defaultOrg = defaultOrgArg ? defaultOrgArg.split('=')[1] : null;

const directus = createDirectus(DIRECTUS_URL).with(rest()).with(authentication('json'));
directus.setToken(DIRECTUS_SERVER_TOKEN);

type Lead = { id: number | string; source?: string | null; stage?: string | null; user_created?: string | null; organization?: string | null };
type OrgMembership = { user: string; organization: string };
type Org = { id: string; name: string };

async function resolveUserOrg(
  userId: string,
  memberships: OrgMembership[],
  orgs: Map<string, Org>,
): Promise<{ orgId: string | null; reason: string }> {
  const userMemberships = memberships.filter((m) => m.user === userId);

  if (userMemberships.length === 0) {
    if (!defaultOrg) return { orgId: null, reason: 'no memberships + no --default-org' };
    return { orgId: defaultOrg, reason: `fallback to --default-org=${defaultOrg}` };
  }

  if (userMemberships.length === 1) {
    return { orgId: userMemberships[0].organization, reason: 'single membership' };
  }

  // Multiple — prefer "hue" by name
  const huePreferred = userMemberships.find((m) => {
    const org = orgs.get(m.organization);
    if (!org) return false;
    return (org.name || '').toLowerCase().startsWith('hue');
  });

  if (huePreferred) {
    return { orgId: huePreferred.organization, reason: 'multiple memberships, preferred hue' };
  }

  // Fallback: first membership
  return {
    orgId: userMemberships[0].organization,
    reason: `multiple memberships (${userMemberships.length}), no hue match, picked first`,
  };
}

async function run() {
  if (diagnoseOnly) console.log('=== DIAGNOSE MODE (no writes, extra detail) ===\n');
  else if (dryRun) console.log('=== DRY RUN (pass --execute to apply changes) ===\n');
  else console.log('=== EXECUTE MODE (writes enabled) ===\n');

  // 1. Fetch all null-org leads
  const nullOrgLeads = (await directus.request(
    readItems('leads', {
      filter: { organization: { _null: true } },
      fields: ['id', 'source', 'stage', 'user_created', 'organization'],
      limit: -1,
    }),
  )) as Lead[];

  console.log(`Found ${nullOrgLeads.length} lead(s) with organization IS NULL.\n`);

  if (nullOrgLeads.length === 0) {
    console.log('Nothing to do. Exiting.');
    return;
  }

  // 2. Collect distinct user_created ids
  const userIds = Array.from(
    new Set(nullOrgLeads.map((l) => l.user_created).filter((u): u is string => !!u)),
  );

  console.log(`Distinct user_created ids: ${userIds.length}`);
  for (const uid of userIds) console.log(`  - ${uid}`);
  console.log('');

  // 3. Fetch their org memberships in one go
  const memberships = userIds.length
    ? ((await directus.request(
        readItems('organizations_directus_users', {
          filter: { directus_users_id: { _in: userIds } },
          fields: ['directus_users_id', 'organizations_id'],
          limit: -1,
        }),
      )) as Array<{ directus_users_id: string; organizations_id: string }>)
    : [];

  const normalizedMemberships: OrgMembership[] = memberships.map((m) => ({
    user: m.directus_users_id,
    organization: m.organizations_id,
  }));

  // 4. Fetch org metadata (for slug/name preferences)
  const orgIds = Array.from(new Set(normalizedMemberships.map((m) => m.organization)));
  if (defaultOrg) orgIds.push(defaultOrg);

  const orgRecords = orgIds.length
    ? ((await directus.request(
        readItems('organizations', {
          filter: { id: { _in: Array.from(new Set(orgIds)) } },
          fields: ['id', 'name'],
          limit: -1,
        }),
      )) as Org[])
    : [];
  const orgs = new Map<string, Org>(orgRecords.map((o) => [o.id, o]));

  console.log('User → membership map:');
  for (const uid of userIds) {
    const mine = normalizedMemberships.filter((m) => m.user === uid);
    if (mine.length === 0) {
      console.log(`  ${uid}: (no memberships)`);
    } else {
      console.log(`  ${uid}:`);
      for (const m of mine) {
        const org = orgs.get(m.organization);
        console.log(`    → ${m.organization} ${org ? `(${org.name})` : '(unknown)'}`);
      }
    }
  }
  console.log('');

  if (diagnoseOnly) {
    console.log('Diagnose-only mode — not resolving leads or writing. Exiting.');
    return;
  }

  // 5. Walk leads, resolve the target org, optionally update
  const counts: Record<string, number> = {};
  let unresolved = 0;
  const unresolvedLeads: Array<{ id: number | string; label: string; reason: string }> = [];

  for (const lead of nullOrgLeads) {
    const label = `src=${lead.source || '?'} stage=${lead.stage || '?'}`;
    const userId = lead.user_created;
    if (!userId) {
      unresolved++;
      unresolvedLeads.push({ id: lead.id, label, reason: 'lead has no user_created' });
      continue;
    }

    const { orgId, reason } = await resolveUserOrg(userId, normalizedMemberships, orgs);
    if (!orgId) {
      unresolved++;
      unresolvedLeads.push({ id: lead.id, label, reason });
      continue;
    }

    const orgLabel = orgs.get(orgId)?.name || orgId;
    counts[orgId] = (counts[orgId] || 0) + 1;

    if (dryRun) {
      console.log(`  [dry] lead ${lead.id} (${label}) → ${orgLabel} (${reason})`);
    } else {
      try {
        await directus.request(updateItem('leads', lead.id, { organization: orgId }));
        console.log(`  [ok]  lead ${lead.id} (${label}) → ${orgLabel}`);
      } catch (err: any) {
        unresolved++;
        unresolvedLeads.push({ id: lead.id, label, reason: `update failed: ${err.message}` });
        console.error(`  [err] lead ${lead.id}: ${err.message}`);
      }
    }
  }

  // 6. Summary
  console.log('');
  console.log('==========================================');
  console.log('  Summary');
  console.log('==========================================');
  console.log(`Leads processed: ${nullOrgLeads.length}`);
  console.log('Assignments by org:');
  for (const [orgId, count] of Object.entries(counts)) {
    const label = orgs.get(orgId)?.name || orgId;
    console.log(`  ${label} (${orgId}): ${count}`);
  }
  console.log(`Unresolved (still null): ${unresolved}`);
  if (unresolvedLeads.length) {
    console.log('Unresolved details:');
    for (const u of unresolvedLeads) {
      console.log(`  - ${u.id} (${u.label}) — ${u.reason}`);
    }
  }
  if (dryRun) console.log('\n(Dry run — re-run with --execute to apply.)');
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
