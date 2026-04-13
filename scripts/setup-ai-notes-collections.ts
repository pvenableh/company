#!/usr/bin/env npx tsx
/**
 * Directus AI Notes & Tags Collections Setup Script
 *
 * Creates collections required by the AI Notes system:
 *   1. ai_tags             – Organization-scoped tags (category + entity-linked)
 *   2. ai_notes            – Saved AI insights with markdown content
 *   3. ai_notes_ai_tags    – M2M junction between notes and tags
 *
 * Run once during initial setup:
 *
 *   pnpm tsx scripts/setup-ai-notes-collections.ts
 *
 * Prerequisites:
 *   - Directus instance running
 *   - Admin static token with schema write permissions
 *
 * After running, regenerate your TypeScript types:
 *   pnpm generate:types
 */

import 'dotenv/config'

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055'
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || ''

if (!DIRECTUS_TOKEN) {
  console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN environment variable is required')
  process.exit(1)
}

// ─── API Helper ───────────────────────────────────────────────────────────────

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
      if (response.status === 409) {
        return { data: null, error: 'already_exists' }
      }
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
  const { error } = await directusRequest('/collections', 'POST', {
    collection,
    meta,
    schema: {},
  })
  if (error === 'already_exists') {
    console.log(`    -> Already exists, skipping`)
    return true
  }
  if (error) {
    console.error(`    -> Error: ${error}`)
    return false
  }
  console.log(`    -> Created`)
  return true
}

async function createField(collection: string, field: Record<string, any>) {
  const fieldName = field.field
  console.log(`  Creating field: ${collection}.${fieldName}`)
  const { error } = await directusRequest(`/fields/${collection}`, 'POST', field)
  if (error === 'already_exists' || error?.includes('already exists')) {
    console.log(`    -> Already exists, skipping`)
    return true
  }
  if (error) {
    console.error(`    -> Error: ${error}`)
    return false
  }
  console.log(`    -> Created`)
  return true
}

async function createRelation(relation: Record<string, any>) {
  console.log(`  Creating relation: ${relation.collection}.${relation.field} -> ${relation.related_collection}`)
  const { error } = await directusRequest('/relations', 'POST', relation)
  if (error === 'already_exists' || error?.includes('already exists')) {
    console.log(`    -> Already exists, skipping`)
    return true
  }
  if (error) {
    console.error(`    -> Error: ${error}`)
    return false
  }
  console.log(`    -> Created`)
  return true
}

// ─── Collection: ai_tags ─────────────────────────────────────────────────────

async function setupAITags() {
  console.log('\n=== ai_tags ===')

  await createCollection('ai_tags', {
    icon: 'label',
    note: 'Organization-scoped tags for AI notes — supports category and entity-linked types',
    hidden: false,
    singleton: false,
    sort_field: null,
    archive_field: null,
  })

  await createField('ai_tags', {
    field: 'id',
    type: 'uuid',
    meta: { special: ['uuid'], interface: 'input', readonly: true, hidden: true },
    schema: { is_primary_key: true, has_auto_increment: false },
  })

  await createField('ai_tags', {
    field: 'name',
    type: 'string',
    meta: { interface: 'input', required: true, note: 'Tag display name' },
    schema: {},
  })

  await createField('ai_tags', {
    field: 'slug',
    type: 'string',
    meta: { interface: 'input', note: 'URL-safe identifier, unique per org' },
    schema: {},
  })

  await createField('ai_tags', {
    field: 'color',
    type: 'string',
    meta: { interface: 'select-color', note: 'Badge display color (hex)', width: 'half' },
    schema: { default_value: '#6366f1' },
  })

  await createField('ai_tags', {
    field: 'type',
    type: 'string',
    meta: {
      interface: 'select-dropdown',
      options: {
        choices: [
          { text: 'Category', value: 'category' },
          { text: 'Entity', value: 'entity' },
        ],
      },
      required: true,
      width: 'half',
      note: 'category = user-created topic, entity = linked to a client/contact/project',
    },
    schema: { default_value: 'category' },
  })

  await createField('ai_tags', {
    field: 'entity_type',
    type: 'string',
    meta: {
      interface: 'select-dropdown',
      options: {
        choices: [
          { text: 'Client', value: 'client' },
          { text: 'Contact', value: 'contact' },
          { text: 'Project', value: 'project' },
        ],
      },
      width: 'half',
      note: 'Only for entity tags — which collection is linked',
    },
    schema: {},
  })

  await createField('ai_tags', {
    field: 'entity_id',
    type: 'string',
    meta: { interface: 'input', width: 'half', note: 'UUID of the linked entity' },
    schema: {},
  })

  await createField('ai_tags', {
    field: 'organization',
    type: 'uuid',
    meta: { interface: 'select-dropdown-m2o', special: ['m2o'], required: true, hidden: true },
    schema: {},
  })

  await createField('ai_tags', {
    field: 'user_created',
    type: 'uuid',
    meta: { special: ['user-created'], interface: 'select-dropdown-m2o', readonly: true, hidden: true },
    schema: {},
  })

  await createField('ai_tags', {
    field: 'date_created',
    type: 'timestamp',
    meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true },
    schema: {},
  })

  await createField('ai_tags', {
    field: 'date_updated',
    type: 'timestamp',
    meta: { special: ['date-updated'], interface: 'datetime', readonly: true, hidden: true },
    schema: {},
  })
}

// ─── Collection: ai_notes ────────────────────────────────────────────────────

async function setupAINotes() {
  console.log('\n=== ai_notes ===')

  await createCollection('ai_notes', {
    icon: 'sticky_note_2',
    note: 'Saved AI insights and responses with tagging support',
    hidden: false,
    singleton: false,
    sort_field: null,
    archive_field: 'status',
    archive_value: 'archived',
    unarchive_value: 'active',
  })

  await createField('ai_notes', {
    field: 'id',
    type: 'uuid',
    meta: { special: ['uuid'], interface: 'input', readonly: true, hidden: true },
    schema: { is_primary_key: true, has_auto_increment: false },
  })

  await createField('ai_notes', {
    field: 'status',
    type: 'string',
    meta: {
      interface: 'select-dropdown',
      options: {
        choices: [
          { text: 'Active', value: 'active' },
          { text: 'Archived', value: 'archived' },
        ],
      },
      width: 'half',
    },
    schema: { default_value: 'active' },
  })

  await createField('ai_notes', {
    field: 'title',
    type: 'string',
    meta: { interface: 'input', note: 'User-editable title, defaults to first ~80 chars of content' },
    schema: {},
  })

  await createField('ai_notes', {
    field: 'content',
    type: 'text',
    meta: { interface: 'input-multiline', required: true, note: 'Saved AI response content (markdown)' },
    schema: {},
  })

  await createField('ai_notes', {
    field: 'excerpt',
    type: 'string',
    meta: { interface: 'input', note: 'Auto-generated plain-text excerpt for list views (~200 chars)' },
    schema: {},
  })

  await createField('ai_notes', {
    field: 'source_session',
    type: 'uuid',
    meta: {
      interface: 'select-dropdown-m2o',
      special: ['m2o'],
      note: 'The chat session this note was saved from',
    },
    schema: {},
  })

  await createField('ai_notes', {
    field: 'source_message_id',
    type: 'string',
    meta: { interface: 'input', note: 'ID of the specific message saved (string, not FK)' },
    schema: {},
  })

  await createField('ai_notes', {
    field: 'organization',
    type: 'uuid',
    meta: { interface: 'select-dropdown-m2o', special: ['m2o'], required: true, hidden: true },
    schema: {},
  })

  await createField('ai_notes', {
    field: 'user',
    type: 'uuid',
    meta: { interface: 'select-dropdown-m2o', special: ['m2o'], required: true },
    schema: {},
  })

  await createField('ai_notes', {
    field: 'is_pinned',
    type: 'boolean',
    meta: { interface: 'boolean', width: 'half', note: 'Pin important notes to top of list' },
    schema: { default_value: false },
  })

  await createField('ai_notes', {
    field: 'tags',
    type: 'alias',
    meta: {
      special: ['m2m'],
      interface: 'list-m2m',
      options: { template: '{{ai_tags_id.name}}' },
    },
  })

  await createField('ai_notes', {
    field: 'user_created',
    type: 'uuid',
    meta: { special: ['user-created'], interface: 'select-dropdown-m2o', readonly: true, hidden: true },
    schema: {},
  })

  await createField('ai_notes', {
    field: 'date_created',
    type: 'timestamp',
    meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true },
    schema: {},
  })

  await createField('ai_notes', {
    field: 'date_updated',
    type: 'timestamp',
    meta: { special: ['date-updated'], interface: 'datetime', readonly: true, hidden: true },
    schema: {},
  })
}

// ─── Collection: ai_notes_ai_tags (Junction) ────────────────────────────────

async function setupJunction() {
  console.log('\n=== ai_notes_ai_tags ===')

  await createCollection('ai_notes_ai_tags', {
    icon: 'import_export',
    note: 'M2M junction between AI notes and tags',
    hidden: true,
    singleton: false,
    sort_field: 'sort',
  })

  await createField('ai_notes_ai_tags', {
    field: 'id',
    type: 'integer',
    meta: { interface: 'input', readonly: true, hidden: true },
    schema: { is_primary_key: true, has_auto_increment: true },
  })

  await createField('ai_notes_ai_tags', {
    field: 'ai_notes_id',
    type: 'uuid',
    meta: { interface: 'select-dropdown-m2o', special: ['m2o'], hidden: true },
    schema: {},
  })

  await createField('ai_notes_ai_tags', {
    field: 'ai_tags_id',
    type: 'uuid',
    meta: { interface: 'select-dropdown-m2o', special: ['m2o'], hidden: true },
    schema: {},
  })

  await createField('ai_notes_ai_tags', {
    field: 'sort',
    type: 'integer',
    meta: { interface: 'input', hidden: true },
    schema: {},
  })
}

// ─── Relationships ───────────────────────────────────────────────────────────

async function setupRelationships() {
  console.log('\n=== Relationships ===')

  // ai_notes.organization -> organizations
  await createRelation({
    collection: 'ai_notes',
    field: 'organization',
    related_collection: 'organizations',
    schema: { on_delete: 'CASCADE' },
    meta: { sort_field: null },
  })

  // ai_notes.user -> directus_users
  await createRelation({
    collection: 'ai_notes',
    field: 'user',
    related_collection: 'directus_users',
    schema: { on_delete: 'CASCADE' },
    meta: { sort_field: null },
  })

  // ai_notes.source_session -> ai_chat_sessions
  await createRelation({
    collection: 'ai_notes',
    field: 'source_session',
    related_collection: 'ai_chat_sessions',
    schema: { on_delete: 'SET NULL' },
    meta: { sort_field: null },
  })

  // ai_tags.organization -> organizations
  await createRelation({
    collection: 'ai_tags',
    field: 'organization',
    related_collection: 'organizations',
    schema: { on_delete: 'CASCADE' },
    meta: { sort_field: null },
  })

  // Junction: ai_notes_ai_tags.ai_notes_id -> ai_notes (with O2M back-reference)
  await createRelation({
    collection: 'ai_notes_ai_tags',
    field: 'ai_notes_id',
    related_collection: 'ai_notes',
    schema: { on_delete: 'CASCADE' },
    meta: {
      one_field: 'tags',
      sort_field: 'sort',
      one_deselect_action: 'delete',
    },
  })

  // Junction: ai_notes_ai_tags.ai_tags_id -> ai_tags
  await createRelation({
    collection: 'ai_notes_ai_tags',
    field: 'ai_tags_id',
    related_collection: 'ai_tags',
    schema: { on_delete: 'CASCADE' },
    meta: {
      one_field: null,
      sort_field: null,
      one_deselect_action: 'nullify',
    },
  })
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Setting up AI Notes & Tags collections...')
  console.log(`Directus URL: ${DIRECTUS_URL}\n`)

  // Create in order: tags first (referenced by junction), then notes, then junction
  await setupAITags()
  await setupAINotes()
  await setupJunction()
  await setupRelationships()

  console.log('\n✅ AI Notes & Tags setup complete!')
  console.log('Run `pnpm generate:types` to update TypeScript types.')
}

main().catch(console.error)
