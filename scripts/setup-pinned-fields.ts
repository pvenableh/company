#!/usr/bin/env npx tsx
/**
 * Adds a boolean `pinned` field to `projects` and `clients` (mirrors the
 * existing `cd_contacts.pinned`). Powers the pin-to-top toggle + pinned-first
 * ordering on the command-center widgets and list surfaces.
 *
 * Idempotent — re-runs safely.
 *
 *   pnpm tsx scripts/setup-pinned-fields.ts
 */
import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!TOKEN) { console.error('DIRECTUS_SERVER_TOKEN required'); process.exit(1); }

async function addPinned(collection: string) {
  const r = await fetch(`${DIRECTUS_URL}/fields/${collection}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({
      field: 'pinned',
      type: 'boolean',
      meta: {
        interface: 'boolean',
        special: ['cast-boolean'],
        note: 'Pinned to the top of widgets / lists for quick access.',
        width: 'half',
      },
      schema: { default_value: false, is_nullable: false },
    }),
  });
  const text = await r.text();
  if (r.ok) console.log(`  ${collection}.pinned -> created`);
  else if (r.status === 400 && /already exists/i.test(text)) console.log(`  ${collection}.pinned -> already exists`);
  else { console.error(`  ${collection}.pinned -> error ${r.status}: ${text}`); process.exit(1); }
}

async function main() {
  console.log('Adding pinned fields to projects + clients ...');
  await addPinned('projects');
  await addPinned('clients');
  console.log('Done.');
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
