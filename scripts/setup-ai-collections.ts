#!/usr/bin/env npx tsx
/**
 * Directus AI Command Center Collections Setup Script
 *
 * Creates collections and fields required by the AI command center:
 *   1. ai_preferences      – Per-user AI module toggle preferences
 *   2. ai_chat_sessions     – AI assistant chat session history
 *   3. ai_chat_messages     – Individual messages within AI chat sessions
 *   4. financial_goals      – Quarterly revenue goals (replaces localStorage)
 *
 * Run once during initial setup:
 *
 *   pnpm tsx scripts/setup-ai-collections.ts
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
      // Check if it's a "already exists" error (409)
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

// ─── Collection Definitions ───────────────────────────────────────────────────

async function setupAIPreferences() {
  console.log('\n=== ai_preferences ===')

  await createCollection('ai_preferences', {
    icon: 'tune',
    note: 'Per-user AI module preferences for the command center',
    hidden: false,
    singleton: false,
    sort_field: null,
    archive_field: null,
    archive_value: 'archived',
    unarchive_value: 'draft',
  })

  await createField('ai_preferences', {
    field: 'id',
    type: 'uuid',
    meta: { special: ['uuid'], interface: 'input', readonly: true, hidden: true },
    schema: { is_primary_key: true, has_auto_increment: false },
  })

  await createField('ai_preferences', {
    field: 'user',
    type: 'uuid',
    meta: { interface: 'select-dropdown-m2o', special: ['m2o'], required: true },
    schema: {},
  })

  await createField('ai_preferences', {
    field: 'enabled_modules',
    type: 'json',
    meta: {
      interface: 'input-code',
      note: 'JSON array of enabled module keys, e.g. ["tickets","projects","invoices"]',
    },
    schema: { default_value: '["tickets","projects","tasks","invoices","channels","social","scheduling","phone","deals"]' },
  })

  await createField('ai_preferences', {
    field: 'date_created',
    type: 'timestamp',
    meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true },
    schema: {},
  })

  await createField('ai_preferences', {
    field: 'date_updated',
    type: 'timestamp',
    meta: { special: ['date-updated'], interface: 'datetime', readonly: true, hidden: true },
    schema: {},
  })

  await createField('ai_preferences', {
    field: 'user_created',
    type: 'uuid',
    meta: { special: ['user-created'], interface: 'select-dropdown-m2o', readonly: true, hidden: true },
    schema: {},
  })
}

async function setupAIChatSessions() {
  console.log('\n=== ai_chat_sessions ===')

  await createCollection('ai_chat_sessions', {
    icon: 'smart_toy',
    note: 'AI assistant chat sessions for the command center',
    hidden: false,
    singleton: false,
    sort_field: null,
    archive_field: 'status',
    archive_value: 'archived',
    unarchive_value: 'active',
  })

  await createField('ai_chat_sessions', {
    field: 'id',
    type: 'uuid',
    meta: { special: ['uuid'], interface: 'input', readonly: true, hidden: true },
    schema: { is_primary_key: true, has_auto_increment: false },
  })

  await createField('ai_chat_sessions', {
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

  await createField('ai_chat_sessions', {
    field: 'title',
    type: 'string',
    meta: { interface: 'input', note: 'Auto-generated or user-set session title' },
    schema: {},
  })

  await createField('ai_chat_sessions', {
    field: 'user',
    type: 'uuid',
    meta: { interface: 'select-dropdown-m2o', special: ['m2o'], required: true },
    schema: {},
  })

  await createField('ai_chat_sessions', {
    field: 'context',
    type: 'json',
    meta: {
      interface: 'input-code',
      note: 'Session context: page, selected items, active module, etc.',
    },
    schema: {},
  })

  await createField('ai_chat_sessions', {
    field: 'messages',
    type: 'alias',
    meta: {
      special: ['o2m'],
      interface: 'list-o2m',
      options: { template: '{{role}}: {{content}}' },
    },
  })

  await createField('ai_chat_sessions', {
    field: 'date_created',
    type: 'timestamp',
    meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true },
    schema: {},
  })

  await createField('ai_chat_sessions', {
    field: 'date_updated',
    type: 'timestamp',
    meta: { special: ['date-updated'], interface: 'datetime', readonly: true, hidden: true },
    schema: {},
  })

  await createField('ai_chat_sessions', {
    field: 'user_created',
    type: 'uuid',
    meta: { special: ['user-created'], interface: 'select-dropdown-m2o', readonly: true, hidden: true },
    schema: {},
  })
}

async function setupAIChatMessages() {
  console.log('\n=== ai_chat_messages ===')

  await createCollection('ai_chat_messages', {
    icon: 'chat',
    note: 'Individual messages within AI chat sessions',
    hidden: false,
    singleton: false,
    sort_field: 'sort',
    archive_field: null,
  })

  await createField('ai_chat_messages', {
    field: 'id',
    type: 'uuid',
    meta: { special: ['uuid'], interface: 'input', readonly: true, hidden: true },
    schema: { is_primary_key: true, has_auto_increment: false },
  })

  await createField('ai_chat_messages', {
    field: 'sort',
    type: 'integer',
    meta: { interface: 'input', hidden: true },
    schema: {},
  })

  await createField('ai_chat_messages', {
    field: 'session',
    type: 'uuid',
    meta: {
      interface: 'select-dropdown-m2o',
      special: ['m2o'],
      required: true,
      note: 'Parent chat session',
    },
    schema: {},
  })

  await createField('ai_chat_messages', {
    field: 'role',
    type: 'string',
    meta: {
      interface: 'select-dropdown',
      options: {
        choices: [
          { text: 'User', value: 'user' },
          { text: 'Assistant', value: 'assistant' },
          { text: 'System', value: 'system' },
        ],
      },
      required: true,
      width: 'half',
    },
    schema: { default_value: 'user' },
  })

  await createField('ai_chat_messages', {
    field: 'content',
    type: 'text',
    meta: { interface: 'input-multiline', required: true },
    schema: {},
  })

  await createField('ai_chat_messages', {
    field: 'metadata',
    type: 'json',
    meta: {
      interface: 'input-code',
      note: 'Optional metadata: referenced items, suggestion IDs, action taken, etc.',
    },
    schema: {},
  })

  await createField('ai_chat_messages', {
    field: 'date_created',
    type: 'timestamp',
    meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true },
    schema: {},
  })
}

async function setupFinancialGoals() {
  console.log('\n=== financial_goals ===')

  await createCollection('financial_goals', {
    icon: 'trending_up',
    note: 'Quarterly revenue goals for the financial analysis dashboard',
    hidden: false,
    singleton: false,
    sort_field: null,
    archive_field: null,
  })

  await createField('financial_goals', {
    field: 'id',
    type: 'uuid',
    meta: { special: ['uuid'], interface: 'input', readonly: true, hidden: true },
    schema: { is_primary_key: true, has_auto_increment: false },
  })

  await createField('financial_goals', {
    field: 'year',
    type: 'integer',
    meta: { interface: 'input', required: true, width: 'half' },
    schema: {},
  })

  await createField('financial_goals', {
    field: 'organization',
    type: 'uuid',
    meta: {
      interface: 'select-dropdown-m2o',
      special: ['m2o'],
      note: 'Optional org-specific goal. Null = personal/global goal.',
      width: 'half',
    },
    schema: {},
  })

  await createField('financial_goals', {
    field: 'q1_goal',
    type: 'float',
    meta: { interface: 'input', width: 'half', note: 'Q1 revenue target' },
    schema: { default_value: 0 },
  })

  await createField('financial_goals', {
    field: 'q2_goal',
    type: 'float',
    meta: { interface: 'input', width: 'half', note: 'Q2 revenue target' },
    schema: { default_value: 0 },
  })

  await createField('financial_goals', {
    field: 'q3_goal',
    type: 'float',
    meta: { interface: 'input', width: 'half', note: 'Q3 revenue target' },
    schema: { default_value: 0 },
  })

  await createField('financial_goals', {
    field: 'q4_goal',
    type: 'float',
    meta: { interface: 'input', width: 'half', note: 'Q4 revenue target' },
    schema: { default_value: 0 },
  })

  await createField('financial_goals', {
    field: 'user_created',
    type: 'uuid',
    meta: { special: ['user-created'], interface: 'select-dropdown-m2o', readonly: true, hidden: true },
    schema: {},
  })

  await createField('financial_goals', {
    field: 'date_created',
    type: 'timestamp',
    meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true },
    schema: {},
  })

  await createField('financial_goals', {
    field: 'date_updated',
    type: 'timestamp',
    meta: { special: ['date-updated'], interface: 'datetime', readonly: true, hidden: true },
    schema: {},
  })
}

// ─── Relationships ────────────────────────────────────────────────────────────

async function setupRelationships() {
  console.log('\n=== Setting up relationships ===')

  // ai_preferences.user -> directus_users
  console.log('  ai_preferences.user -> directus_users')
  await directusRequest('/relations', 'POST', {
    collection: 'ai_preferences',
    field: 'user',
    related_collection: 'directus_users',
    meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
    schema: { on_delete: 'CASCADE' },
  })

  // ai_chat_sessions.user -> directus_users
  console.log('  ai_chat_sessions.user -> directus_users')
  await directusRequest('/relations', 'POST', {
    collection: 'ai_chat_sessions',
    field: 'user',
    related_collection: 'directus_users',
    meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
    schema: { on_delete: 'CASCADE' },
  })

  // ai_chat_messages.session -> ai_chat_sessions (O2M)
  console.log('  ai_chat_messages.session -> ai_chat_sessions')
  await directusRequest('/relations', 'POST', {
    collection: 'ai_chat_messages',
    field: 'session',
    related_collection: 'ai_chat_sessions',
    meta: { one_field: 'messages', sort_field: 'sort', one_deselect_action: 'nullify' },
    schema: { on_delete: 'CASCADE' },
  })

  // financial_goals.organization -> organizations
  console.log('  financial_goals.organization -> organizations')
  await directusRequest('/relations', 'POST', {
    collection: 'financial_goals',
    field: 'organization',
    related_collection: 'organizations',
    meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
    schema: { on_delete: 'SET NULL' },
  })
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=========================================')
  console.log('  AI Command Center - Directus Setup')
  console.log('=========================================')
  console.log(`Target: ${DIRECTUS_URL}`)

  // Verify connection
  const { error } = await directusRequest('/server/info')
  if (error) {
    console.error(`\nCannot connect to Directus: ${error}`)
    process.exit(1)
  }
  console.log('Connected to Directus\n')

  await setupAIPreferences()
  await setupAIChatSessions()
  await setupAIChatMessages()
  await setupFinancialGoals()
  await setupRelationships()

  console.log('\n=========================================')
  console.log('  Setup complete!')
  console.log('=========================================')
  console.log('\nNext steps:')
  console.log('  1. Set up access permissions in Directus for each role')
  console.log('  2. Regenerate TypeScript types: pnpm generate:types')
  console.log('  3. Restart the dev server')
}

main().catch((err) => {
  console.error('Setup failed:', err)
  process.exit(1)
})
