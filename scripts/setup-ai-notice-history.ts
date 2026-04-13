#!/usr/bin/env npx tsx
/**
 * Directus Setup: AI Notice History + Chat Message Feedback
 *
 * 1. Creates `ai_notice_history` collection for deduplicating AI notice notifications
 * 2. Adds `feedback` JSON field to `ai_chat_messages` for thumbs up/down + corrections
 *
 *   pnpm tsx scripts/setup-ai-notice-history.ts
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
  console.log('=== Part 1: ai_notice_history collection ===\n')

  await createCollection('ai_notice_history', {
    icon: 'notifications_active',
    note: 'Tracks which AI notices have been sent as notifications to prevent duplicates',
    hidden: true,
    singleton: false,
  })

  await createField('ai_notice_history', {
    field: 'organization',
    type: 'integer',
    meta: { interface: 'select-dropdown-m2o', special: ['m2o'], required: true, hidden: true },
    schema: {},
  })

  await createField('ai_notice_history', {
    field: 'notice_hash',
    type: 'string',
    meta: { interface: 'input', required: true, note: 'MD5 hash of noticeId:orgId:YYYY-MM for deduplication' },
    schema: { max_length: 64 },
  })

  await createField('ai_notice_history', {
    field: 'notice_id',
    type: 'string',
    meta: { interface: 'input', required: true, note: 'Deterministic notice ID (e.g. client-overdue-invoices-abc123)' },
    schema: { max_length: 255 },
  })

  await createField('ai_notice_history', {
    field: 'entity_type',
    type: 'string',
    meta: { interface: 'input', note: 'client, project, or invoice' },
    schema: { max_length: 50, is_nullable: true },
  })

  await createField('ai_notice_history', {
    field: 'entity_id',
    type: 'string',
    meta: { interface: 'input', note: 'UUID of the entity' },
    schema: { max_length: 36, is_nullable: true },
  })

  await createField('ai_notice_history', {
    field: 'sent_at',
    type: 'timestamp',
    meta: { interface: 'datetime', required: true },
    schema: {},
  })

  // Relation: organization -> organizations
  await createRelation({
    collection: 'ai_notice_history',
    field: 'organization',
    related_collection: 'organizations',
    meta: { sort_field: null },
  })

  console.log('\n=== Part 2: feedback field on ai_chat_messages ===\n')

  await createField('ai_chat_messages', {
    field: 'feedback',
    type: 'json',
    meta: {
      interface: 'input-code',
      note: 'User feedback on AI response: { rating: "positive"|"negative", correction?: string }',
    },
    schema: { is_nullable: true },
  })

  console.log('\n✅ Setup complete!')
  console.log('Run `pnpm generate:types` to update TypeScript types if needed.')
}

main().catch(console.error)
