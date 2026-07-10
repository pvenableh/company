#!/usr/bin/env npx tsx
/**
 * Add a nullable `category` field to `channels`.
 *
 * One-level "folder" for org-level channels (those with no client/project),
 * e.g. Announcements / Eng / Random. Client- and project-scoped channels are
 * grouped by their existing association instead, so `category` never competes
 * with those axes — it only labels the General bucket.
 * See project_channels_apps_home.
 *
 * Idempotent.  pnpm tsx scripts/setup-channel-category-field.ts
 */

import 'dotenv/config'

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055'
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || ''

if (!DIRECTUS_TOKEN) {
  console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN environment variable is required')
  process.exit(1)
}

async function createField(collection: string, field: Record<string, any>) {
  console.log(`  Creating field: ${collection}.${field.field}`)
  const res = await fetch(`${DIRECTUS_URL}/fields/${collection}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DIRECTUS_TOKEN}` },
    body: JSON.stringify(field),
  })
  const text = await res.text()
  if (res.status === 409 || text.includes('already exists')) { console.log('    -> Already exists, skipping'); return }
  if (!res.ok) { console.error(`    -> Error: ${res.status}: ${text}`); process.exit(1) }
  console.log('    -> Created')
}

async function main() {
  console.log('Adding channels.category...')
  console.log(`Directus URL: ${DIRECTUS_URL}\n`)

  await createField('channels', {
    field: 'category',
    type: 'string',
    meta: {
      interface: 'input',
      note: 'One-level folder for org-level channels (Announcements, Eng, …). Ignored for client/project channels.',
      options: { placeholder: 'e.g. Announcements' },
    },
    schema: {},
  })

  console.log('\n✅ channels.category added.')
  console.log('Run `pnpm generate:types` to update TypeScript types.')
}

main().catch((e) => { console.error(e); process.exit(1) })
