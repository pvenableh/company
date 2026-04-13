#!/usr/bin/env npx tsx
/**
 * Directus AI Context Snapshots Collection Setup Script
 *
 * Creates the ai_context_snapshots collection for the Context Broker.
 * Stores pre-built org-level AI context with TTL-based expiration.
 *
 *   pnpm tsx scripts/setup-ai-context-snapshots.ts
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
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
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
      if (response.status === 409) return { data: null, error: 'already_exists' }
      return { data: null, error: `${response.status}: ${text}` }
    }
    const json = text ? JSON.parse(text) : {}
    return { data: json.data ?? null, error: null }
  } catch (err: any) {
    return { data: null, error: err.message }
  }
}

async function createCollection(collection: string, meta: Record<string, any>) {
  console.log(`  Creating collection: ${collection}`)
  const { error } = await directusRequest('/collections', 'POST', { collection, meta, schema: {} })
  if (error === 'already_exists') { console.log(`    -> Already exists, skipping`); return true }
  if (error) { console.error(`    -> Error: ${error}`); return false }
  console.log(`    -> Created`); return true
}

async function createField(collection: string, field: Record<string, any>) {
  console.log(`  Creating field: ${collection}.${field.field}`)
  const { error } = await directusRequest(`/fields/${collection}`, 'POST', field)
  if (error === 'already_exists' || error?.includes('already exists')) { console.log(`    -> Already exists, skipping`); return true }
  if (error) { console.error(`    -> Error: ${error}`); return false }
  console.log(`    -> Created`); return true
}

async function createRelation(relation: Record<string, any>) {
  console.log(`  Creating relation: ${relation.collection}.${relation.field} -> ${relation.related_collection}`)
  const { error } = await directusRequest('/relations', 'POST', relation)
  if (error === 'already_exists' || error?.includes('already exists')) { console.log(`    -> Already exists, skipping`); return true }
  if (error) { console.error(`    -> Error: ${error}`); return false }
  console.log(`    -> Created`); return true
}

async function main() {
  console.log('Setting up ai_context_snapshots collection...')
  console.log(`Directus URL: ${DIRECTUS_URL}\n`)

  await createCollection('ai_context_snapshots', {
    icon: 'cached',
    note: 'Pre-built org-level AI context snapshots for the Context Broker',
    hidden: true,
    singleton: false,
    sort_field: null,
    archive_field: null,
  })

  // Let Directus auto-create the integer PK (id already exists after createCollection)

  await createField('ai_context_snapshots', {
    field: 'organization',
    type: 'integer',
    meta: { interface: 'select-dropdown-m2o', special: ['m2o'], required: true, hidden: true },
    schema: {},
  })

  await createField('ai_context_snapshots', {
    field: 'context_type',
    type: 'string',
    meta: {
      interface: 'select-dropdown',
      options: {
        choices: [
          { text: 'Full', value: 'full' },
          { text: 'Clients', value: 'clients' },
          { text: 'Projects', value: 'projects' },
          { text: 'Invoices', value: 'invoices' },
          { text: 'Deals', value: 'deals' },
          { text: 'Brand', value: 'brand' },
        ],
      },
      required: true,
    },
    schema: { default_value: 'full' },
  })

  await createField('ai_context_snapshots', {
    field: 'data',
    type: 'json',
    meta: { interface: 'input-code', note: 'Serialized context snapshot (JSON)' },
    schema: {},
  })

  await createField('ai_context_snapshots', {
    field: 'token_estimate',
    type: 'integer',
    meta: { interface: 'input', note: 'Approximate token count of the data field' },
    schema: { default_value: 0 },
  })

  await createField('ai_context_snapshots', {
    field: 'date_created',
    type: 'timestamp',
    meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true },
    schema: {},
  })

  await createField('ai_context_snapshots', {
    field: 'expires_at',
    type: 'timestamp',
    meta: { interface: 'datetime', note: 'When this snapshot becomes stale' },
    schema: {},
  })

  // Relation: organization -> organizations
  await createRelation({
    collection: 'ai_context_snapshots',
    field: 'organization',
    related_collection: 'organizations',
    meta: { sort_field: null },
  })

  console.log('\n✅ ai_context_snapshots setup complete!')
  console.log('Run `pnpm generate:types` to update TypeScript types.')
}

main().catch(console.error)
