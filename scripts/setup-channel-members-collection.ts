#!/usr/bin/env npx tsx
/**
 * Directus `channel_members` Collection Setup
 *
 * Backs the channels comms-hub read-state + roster (see
 * project_channels_apps_home). One row per (channel, user) doubles as
 * membership AND read cursor:
 *   - roster            -> presence of a row + joined_at
 *   - unread counting   -> messages.date_created > last_read_at (author != me)
 *   - "new messages"    -> last_read_message divider
 *   - mute              -> muted flag
 *
 * `organization` is denormalized onto the row (mirrors channels/messages) so
 * queries can scope by org without an FK walk.
 *
 * All writes happen via admin-token server routes (Directus 11 does not
 * FK-walk on `create` perms), so this collection intentionally gets NO
 * row-level client permissions — reads are proxied too. Same trust boundary
 * as the messages / marketing_campaigns routes.
 *
 * Idempotent: re-running skips anything that already exists.
 *
 *   pnpm tsx scripts/setup-channel-members-collection.ts
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
  body?: unknown,
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
  if (error === 'already_exists') { console.log('    -> Already exists, skipping'); return true }
  if (error) { console.error(`    -> Error: ${error}`); return false }
  console.log('    -> Created'); return true
}

async function createField(collection: string, field: Record<string, any>) {
  console.log(`  Creating field: ${collection}.${field.field}`)
  const { error } = await directusRequest(`/fields/${collection}`, 'POST', field)
  if (error === 'already_exists' || error?.includes('already exists')) { console.log('    -> Already exists, skipping'); return true }
  if (error) { console.error(`    -> Error: ${error}`); return false }
  console.log('    -> Created'); return true
}

async function createRelation(relation: Record<string, any>) {
  console.log(`  Creating relation: ${relation.collection}.${relation.field} -> ${relation.related_collection}`)
  const { error } = await directusRequest('/relations', 'POST', relation)
  if (error === 'already_exists' || error?.includes('already exists')) { console.log('    -> Already exists, skipping'); return true }
  if (error) { console.error(`    -> Error: ${error}`); return false }
  console.log('    -> Created'); return true
}

async function main() {
  console.log('Setting up channel_members collection...')
  console.log(`Directus URL: ${DIRECTUS_URL}\n`)

  await createCollection('channel_members', {
    icon: 'group',
    note: 'Per-user channel membership + read cursor (roster, unread, mute) for the channels comms hub',
    hidden: false,
    singleton: false,
    sort_field: null,
    archive_field: null,
  })

  // Directus auto-creates the integer PK `id` with the collection.

  // channel -> channels (uuid PK)
  await createField('channel_members', {
    field: 'channel',
    type: 'uuid',
    meta: { interface: 'select-dropdown-m2o', special: ['m2o'], required: true },
    schema: {},
  })

  // user -> directus_users (uuid PK)
  await createField('channel_members', {
    field: 'user',
    type: 'uuid',
    meta: { interface: 'select-dropdown-m2o', special: ['m2o'], required: true },
    schema: {},
  })

  // organization -> organizations (uuid PK) — denormalized for scoping
  await createField('channel_members', {
    field: 'organization',
    type: 'uuid',
    meta: { interface: 'select-dropdown-m2o', special: ['m2o'], required: true },
    schema: {},
  })

  await createField('channel_members', {
    field: 'last_read_at',
    type: 'timestamp',
    meta: { interface: 'datetime', note: 'Read cursor — messages after this are unread' },
    schema: {},
  })

  // last_read_message -> messages (uuid PK), nullable
  await createField('channel_members', {
    field: 'last_read_message',
    type: 'uuid',
    meta: { interface: 'select-dropdown-m2o', special: ['m2o'], note: 'Anchor for the "new messages" divider' },
    schema: {},
  })

  await createField('channel_members', {
    field: 'joined_at',
    type: 'timestamp',
    meta: { interface: 'datetime', readonly: true },
    schema: {},
  })

  await createField('channel_members', {
    field: 'muted',
    type: 'boolean',
    meta: { interface: 'boolean', note: 'Suppress unread badge for this channel' },
    schema: { default_value: false },
  })

  await createRelation({
    collection: 'channel_members',
    field: 'channel',
    related_collection: 'channels',
    meta: { sort_field: null },
    schema: { on_delete: 'CASCADE' },
  })

  await createRelation({
    collection: 'channel_members',
    field: 'user',
    related_collection: 'directus_users',
    meta: { sort_field: null },
    schema: { on_delete: 'CASCADE' },
  })

  await createRelation({
    collection: 'channel_members',
    field: 'organization',
    related_collection: 'organizations',
    meta: { sort_field: null },
    schema: { on_delete: 'CASCADE' },
  })

  await createRelation({
    collection: 'channel_members',
    field: 'last_read_message',
    related_collection: 'messages',
    meta: { sort_field: null },
    schema: { on_delete: 'SET NULL' },
  })

  console.log('\n✅ channel_members setup complete!')
  console.log('Uniqueness of (channel, user) is enforced in application code (server routes upsert).')
  console.log('Run `pnpm generate:types` to update TypeScript types.')
}

main().catch(console.error)
