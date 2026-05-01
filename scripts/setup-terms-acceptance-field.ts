#!/usr/bin/env npx tsx
/**
 * Adds `terms_accepted_at` (timestamp) to directus_users.
 *
 * Captured on:
 *   - /register form submission (initial consent)
 *   - /organization/new payment step (re-affirmation; updates the field)
 *
 * Run:
 *   pnpm tsx scripts/setup-terms-acceptance-field.ts
 *
 * After running, regenerate types:
 *   pnpm generate:types
 */

import 'dotenv/config'

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055'
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || ''

if (!DIRECTUS_TOKEN) {
  console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN environment variable is required')
  process.exit(1)
}

async function directusRequest<T = unknown>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' = 'GET',
  body?: unknown
): Promise<{ data: T | null; error: string | null }> {
  try {
    const response = await fetch(`${DIRECTUS_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DIRECTUS_TOKEN}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    const text = await response.text()
    if (!response.ok) {
      const err = text ? JSON.parse(text) : {}
      return { data: null, error: err.errors?.[0]?.message || `HTTP ${response.status}` }
    }

    const json = text ? JSON.parse(text) : {}
    return { data: json.data ?? null, error: null }
  } catch (err: any) {
    return { data: null, error: err.message }
  }
}

async function fieldExists(collection: string, field: string): Promise<boolean> {
  const { error } = await directusRequest(`/fields/${collection}/${field}`)
  return !error
}

async function createField(collection: string, field: string, config: any): Promise<void> {
  const exists = await fieldExists(collection, field)
  if (exists) {
    console.log(`  ✓ ${collection}.${field} already exists`)
    return
  }

  const { error } = await directusRequest(`/fields/${collection}`, 'POST', {
    field,
    ...config,
  })

  if (error) {
    console.error(`  ✗ ${collection}.${field} failed: ${error}`)
  } else {
    console.log(`  + ${collection}.${field} created`)
  }
}

async function main() {
  console.log('\n── Terms Acceptance Field Setup ──\n')
  console.log(`Directus: ${DIRECTUS_URL}\n`)

  console.log('directus_users collection:')
  await createField('directus_users', 'terms_accepted_at', {
    type: 'timestamp',
    meta: {
      interface: 'datetime',
      display: 'datetime',
      note: 'When the user agreed to Terms of Service & Privacy Policy. Set on registration; updated on subscription checkout re-affirmation.',
      readonly: true,
      hidden: false,
      width: 'half',
    },
    schema: {
      is_nullable: true,
      default_value: null,
    },
  })

  console.log('\n── Done ──\n')
  console.log('Next: pnpm generate:types')
}

main().catch((err) => {
  console.error('Setup failed:', err)
  process.exit(1)
})
