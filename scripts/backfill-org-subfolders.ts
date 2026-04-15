#!/usr/bin/env npx tsx
/**
 * Backfill org subfolders: create Clients/Financials/Uploads under each org's
 * root folder, and move existing client folders under Clients/.
 *
 * Usage:
 *   npx tsx scripts/backfill-org-subfolders.ts [--execute]
 *
 * Without --execute, runs in dry-run mode (no writes).
 * Reads DIRECTUS_URL and DIRECTUS_SERVER_TOKEN from .env (or environment).
 */

import { createDirectus, rest, authentication, readItems, createItem, updateItem, readFolders, createFolder, updateFolder } from '@directus/sdk';
import { config } from 'dotenv';

config();

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'https://admin.earnest.guru';
const DIRECTUS_SERVER_TOKEN = process.env.DIRECTUS_SERVER_TOKEN;

if (!DIRECTUS_SERVER_TOKEN) {
  console.error('ERROR: DIRECTUS_SERVER_TOKEN is not set. Add it to your .env file.');
  process.exit(1);
}

const dryRun = !process.argv.includes('--execute');

const directus = createDirectus(DIRECTUS_URL).with(rest()).with(authentication('json'));
directus.setToken(DIRECTUS_SERVER_TOKEN);

const SUBFOLDER_NAMES = ['Clients', 'Financials', 'Uploads'] as const;

async function run() {
  if (dryRun) console.log('=== DRY RUN (pass --execute to apply changes) ===\n');

  // 1. Fetch all orgs that have a folder
  const orgs = await directus.request(
    readItems('organizations', {
      filter: { folder: { _nnull: true } },
      fields: ['id', 'name', 'folder'],
      limit: -1,
    })
  ) as any[];

  console.log(`Found ${orgs.length} org(s) with folders.\n`);

  for (const org of orgs) {
    const orgFolderId = typeof org.folder === 'object' ? org.folder.id : org.folder;
    console.log(`--- ${org.name} (${org.id}) — folder: ${orgFolderId}`);

    // 2. Get existing children of the org folder
    const children = await directus.request(
      readFolders({
        filter: { parent: { _eq: orgFolderId } },
        fields: ['id', 'name'],
        limit: -1,
      })
    ) as any[];

    const existingNames = new Set(children.map((c: any) => c.name));
    const subfolderIds: Record<string, string> = {};

    // Record existing subfolder IDs
    for (const child of children) {
      if (SUBFOLDER_NAMES.includes(child.name)) {
        subfolderIds[child.name] = child.id;
      }
    }

    // 3. Create missing subfolders
    for (const name of SUBFOLDER_NAMES) {
      if (existingNames.has(name)) {
        console.log(`  [skip] ${name}/ already exists (${subfolderIds[name]})`);
      } else {
        if (dryRun) {
          console.log(`  [create] Would create ${name}/ under org folder`);
        } else {
          const folder = await directus.request(
            createFolder({ name, parent: orgFolderId })
          ) as any;
          subfolderIds[name] = folder.id;
          console.log(`  [create] Created ${name}/ (${folder.id})`);
        }
      }
    }

    // 4. Move existing client folders under Clients/
    const clientsFolderId = subfolderIds['Clients'];
    if (!clientsFolderId && dryRun) {
      console.log(`  [info] Would move client folders under Clients/ (not yet created in dry run)`);
    }

    // Fetch clients for this org that have folders
    const clients = await directus.request(
      readItems('clients', {
        filter: {
          organization: { _eq: org.id },
          folder: { _nnull: true },
        },
        fields: ['id', 'name', 'folder'],
        limit: -1,
      })
    ) as any[];

    for (const client of clients) {
      const clientFolderId = typeof client.folder === 'object' ? client.folder.id : client.folder;

      // Check if this client folder is directly under org root (not already under Clients/)
      const clientFolder = children.find((c: any) => c.id === clientFolderId);
      if (!clientFolder) continue; // Not a direct child of org root — might already be nested

      // Skip if it's one of the system subfolders
      if (SUBFOLDER_NAMES.includes(clientFolder.name as any)) continue;

      if (dryRun) {
        console.log(`  [move] Would move "${clientFolder.name}" (${clientFolderId}) under Clients/`);
      } else if (clientsFolderId) {
        await directus.request(
          updateFolder(clientFolderId, { parent: clientsFolderId })
        );
        console.log(`  [move] Moved "${clientFolder.name}" (${clientFolderId}) under Clients/`);
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
