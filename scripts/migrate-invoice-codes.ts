#!/usr/bin/env npx tsx
/**
 * Migrate 2026 invoice codes from legacy format to new org-prefixed format.
 *
 * Legacy:  INV-{CLIENT}-{YEAR}-{NNNN}
 * New:     INV-HUE-{CLIENT}-{YEAR}-{NNNN}
 *
 * Only affects invoices where the code matches INV-{XXX}-2026-{NNNN}
 * (i.e. no org code yet). Skips codes that already have the org prefix.
 *
 * Usage:
 *   npx tsx scripts/migrate-invoice-codes.ts              # dry-run
 *   npx tsx scripts/migrate-invoice-codes.ts --execute     # apply changes
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

const dryRun = !process.argv.includes('--execute');
const ORG_CODE = 'HUE';

const directus = createDirectus(DIRECTUS_URL).with(rest()).with(authentication('json'));
directus.setToken(DIRECTUS_SERVER_TOKEN);

async function run() {
  if (dryRun) console.log('=== DRY RUN (pass --execute to apply changes) ===\n');

  // Fetch all 2026 invoices with legacy format: INV-{CLIENT}-2026-{NNNN}
  const invoices = await directus.request(
    readItems('invoices', {
      fields: ['id', 'invoice_code'],
      filter: {
        invoice_code: { _contains: '-2026-' },
      },
      limit: -1,
    })
  ) as any[];

  console.log(`Found ${invoices.length} invoices with "-2026-" in code.\n`);

  // Match legacy format: INV-{CLIENT_CODE}-2026-{NNNN}
  // But NOT already migrated: INV-HUE-{CLIENT_CODE}-2026-{NNNN}
  const legacyPattern = /^INV-([A-Z0-9]+)-2026-(\d+)$/;
  const alreadyMigrated = new RegExp(`^INV-${ORG_CODE}-[A-Z0-9]+-2026-\\d+$`);

  let updated = 0;
  let skipped = 0;

  for (const inv of invoices) {
    const code = inv.invoice_code;
    if (!code) continue;

    // Skip if already has the org prefix
    if (alreadyMigrated.test(code)) {
      console.log(`  SKIP (already migrated): ${code}`);
      skipped++;
      continue;
    }

    const match = code.match(legacyPattern);
    if (!match) {
      console.log(`  SKIP (unexpected format): ${code}`);
      skipped++;
      continue;
    }

    const clientCode = match[1];
    const seqNum = match[2];
    const newCode = `INV-${ORG_CODE}-${clientCode}-2026-${seqNum}`;

    console.log(`  ${code}  →  ${newCode}`);

    if (!dryRun) {
      await directus.request(
        updateItem('invoices', inv.id, { invoice_code: newCode })
      );
    }
    updated++;
  }

  console.log(`\nDone. ${updated} updated, ${skipped} skipped.`);
  if (dryRun && updated > 0) {
    console.log('Run with --execute to apply these changes.');
  }
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
