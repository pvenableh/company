#!/usr/bin/env npx tsx
/**
 * Widens social_accounts.access_token + refresh_token to unlimited TEXT.
 *
 * Symptom this fixes:
 *   Facebook OAuth callback fails with VALUE_TOO_LONG on access_token
 *   because the encrypted page token (~470 chars) exceeds an old varchar cap.
 *
 * Run against whichever Directus the live frontend is writing to:
 *   DIRECTUS_URL=https://admin.huestudios.company \
 *   DIRECTUS_SERVER_TOKEN=... \
 *   pnpm tsx scripts/fix-social-token-columns.ts
 */

import 'dotenv/config'

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055'
const DIRECTUS_TOKEN =
  process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || ''

if (!DIRECTUS_TOKEN) {
  console.error('❌ DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN is required')
  process.exit(1)
}

async function patchField(field: string, isNullable: boolean) {
  const url = `${DIRECTUS_URL}/fields/social_accounts/${field}`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DIRECTUS_TOKEN}`,
    },
    body: JSON.stringify({
      type: 'text',
      schema: {
        name: field,
        table: 'social_accounts',
        data_type: 'text',
        max_length: null,
        is_nullable: isNullable,
      },
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`PATCH ${field} failed: ${res.status} ${body}`)
  }
  console.log(`  ✅ ${field} → text / unlimited`)
}

async function main() {
  console.log(`🔧 Targeting ${DIRECTUS_URL}`)
  await patchField('access_token', false)
  await patchField('refresh_token', true)
  console.log('✨ Done')
}

main().catch((err) => {
  console.error('❌', err)
  process.exit(1)
})
