#!/usr/bin/env npx tsx
/**
 * Backfill org ROOT folders: create the top-level Directus folder (+ standard
 * Clients/Financials/Uploads subfolders) for every org whose `folder` is null,
 * and link it back onto `organizations.folder`.
 *
 * Why this exists: org creation used to call `createItem('directus_folders')`,
 * which the Directus SDK rejects for core collections ("Cannot use createItem
 * for core collections"). The throw was swallowed by a try/catch, so every org
 * created while that bug was live got `folder: null` and no folder structure.
 * `create.post.ts` is now fixed (uses `createFolder`); this repairs the orgs
 * created before the fix. Complements `backfill-org-subfolders.ts`, which only
 * touches orgs that ALREADY have a root folder.
 *
 * Usage:
 *   npx tsx scripts/backfill-org-root-folders.ts [--execute] [<org-id> ...]
 *
 * Without --execute it's a dry run (reads only). Pass one or more org ids to
 * limit the backfill to those orgs; omit to process every null-folder org.
 * Idempotent: re-linking a root or re-creating an existing subfolder is skipped.
 * Reads DIRECTUS_URL and DIRECTUS_SERVER_TOKEN from .env (or environment).
 */

import { createDirectus, rest, authentication, readItems, updateItem, readFolders, createFolder } from '@directus/sdk';
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
const orgIdFilter = args.filter((a) => a !== '--execute');

const directus = createDirectus(DIRECTUS_URL).with(rest()).with(authentication('json'));
directus.setToken(DIRECTUS_SERVER_TOKEN);

const SUBFOLDER_NAMES = ['Clients', 'Financials', 'Uploads'] as const;

async function run() {
  if (dryRun) console.log('=== DRY RUN (pass --execute to apply changes) ===\n');

  // Orgs missing a root folder (optionally narrowed to the ids passed on argv).
  const filter: Record<string, any> = { folder: { _null: true } };
  if (orgIdFilter.length) filter.id = { _in: orgIdFilter };

  const orgs = await directus.request(
    readItems('organizations', { filter, fields: ['id', 'name'], limit: -1 })
  ) as any[];

  console.log(`Found ${orgs.length} org(s) with no root folder.${orgIdFilter.length ? ` (filtered to ${orgIdFilter.length} id[s])` : ''}\n`);

  for (const org of orgs) {
    const orgName = (org.name || 'Organization').trim();
    console.log(`--- ${orgName} (${org.id})`);

    // 1. Create the root folder (named after the org).
    let rootId: string;
    if (dryRun) {
      console.log(`  [create] Would create root folder "${orgName}" and link organizations.folder`);
      rootId = '<dry-run>';
    } else {
      const root = await directus.request(
        createFolder({ name: orgName, parent: null })
      ) as any;
      rootId = root.id;
      await directus.request(updateItem('organizations', org.id, { folder: rootId }));
      console.log(`  [create] Root folder ${rootId} → linked to org`);
    }

    // 2. Create the standard subfolders (skip any that somehow already exist).
    const existing = dryRun || rootId === '<dry-run>'
      ? []
      : (await directus.request(
          readFolders({ filter: { parent: { _eq: rootId } }, fields: ['name'], limit: -1 })
        ) as any[]);
    const existingNames = new Set(existing.map((c: any) => c.name));

    for (const name of SUBFOLDER_NAMES) {
      if (existingNames.has(name)) {
        console.log(`  [skip] ${name}/ already exists`);
      } else if (dryRun) {
        console.log(`  [create] Would create ${name}/ under root`);
      } else {
        const sub = await directus.request(createFolder({ name, parent: rootId })) as any;
        console.log(`  [create] ${name}/ (${sub.id})`);
      }
    }

    console.log('');
  }

  console.log('Done.');
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
