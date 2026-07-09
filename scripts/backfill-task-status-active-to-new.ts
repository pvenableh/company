#!/usr/bin/env npx tsx
/**
 * Backfill: tasks.status 'active' → 'new'.
 *
 * WHY: two task surfaces historically wrote different "To Do" values —
 * ticket-embedded task code wrote 'active', while the server + standalone
 * project Board wrote the canonical 'new' (the value in the tasks.status field
 * choices). All readers tolerate both (statusToColumn falls through to To Do),
 * so this was cosmetic — but the client writers have now been unified on 'new'
 * (see app/components/Tickets/* + app/composables/useTasksList.js). This one-off
 * migrates the historical 'active' rows so the whole `tasks` collection speaks
 * one To Do value.
 *
 * SAFE: no reader queries the `tasks` collection by status = 'active' (verified
 * — the only status=_eq=active filter in the app targets directus_users, not
 * tasks; the TasksList "Active" filter tab is value-agnostic: status !==
 * 'completed'). So flipping 'active' → 'new' changes no visible behavior.
 *
 * Idempotent: only touches rows still at status='active'. Re-running after a
 * successful apply finds zero rows.
 *
 * Usage:
 *   npx tsx scripts/backfill-task-status-active-to-new.ts            # dry run
 *   npx tsx scripts/backfill-task-status-active-to-new.ts --execute  # apply
 *
 * Reads DIRECTUS_URL and DIRECTUS_SERVER_TOKEN from .env (or environment).
 */

import { createDirectus, rest, authentication, readItems, updateItems } from '@directus/sdk';
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

const directus = createDirectus(DIRECTUS_URL).with(rest()).with(authentication('json'));
directus.setToken(DIRECTUS_SERVER_TOKEN);

type Task = { id: string; status?: string | null; title?: string | null };

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function run() {
  console.log(dryRun ? '=== DRY RUN (pass --execute to apply) ===\n' : '=== EXECUTE MODE (writes enabled) ===\n');

  const rows = (await directus.request(
    readItems('tasks', {
      filter: { status: { _eq: 'active' } },
      fields: ['id', 'status', 'title'],
      limit: -1,
    }),
  )) as Task[];

  console.log(`Found ${rows.length} task(s) with status='active'.\n`);

  if (rows.length === 0) {
    console.log('Nothing to do. Exiting.');
    return;
  }

  // Preview a sample so a human can sanity-check the target rows.
  const sample = rows.slice(0, 10);
  console.log('Sample:');
  for (const t of sample) console.log(`  - ${t.id}  ${t.title ? `"${t.title}"` : '(no title)'}`);
  if (rows.length > sample.length) console.log(`  … and ${rows.length - sample.length} more`);
  console.log('');

  if (dryRun) {
    console.log(`(Dry run — ${rows.length} row(s) would be set status='active' → 'new'. Re-run with --execute to apply.)`);
    return;
  }

  const ids = rows.map((t) => t.id);
  let updated = 0;
  for (const group of chunk(ids, 100)) {
    await directus.request(updateItems('tasks', group, { status: 'new' }));
    updated += group.length;
    console.log(`  [ok] updated ${updated}/${ids.length}`);
  }

  // Verify none remain.
  const remaining = (await directus.request(
    readItems('tasks', { filter: { status: { _eq: 'active' } }, fields: ['id'], limit: 1 }),
  )) as Task[];

  console.log('');
  console.log('==========================================');
  console.log('  Summary');
  console.log('==========================================');
  console.log(`Updated: ${updated}`);
  console.log(`Still status='active': ${remaining.length === 0 ? '0 ✅' : `${remaining.length}+ ⚠️ (re-run)`}`);
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
