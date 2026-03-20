#!/usr/bin/env npx tsx
/**
 * Directus Setup: marketing_campaigns + ai_usage_logs
 *
 * Creates collections and fields for the marketing campaigns system
 * and AI usage monitoring.
 *
 * Run:
 *   pnpm tsx scripts/setup-marketing-ai-usage.ts
 *
 * Prerequisites:
 *   - Directus instance running
 *   - Admin static token with schema write permissions
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

// ─── marketing_campaigns ─────────────────────────────────────────────────────

async function setupMarketingCampaigns() {
  console.log('\n=== marketing_campaigns ===')

  await createCollection('marketing_campaigns', {
    icon: 'campaign',
    note: 'AI-generated marketing campaigns and analyses',
    hidden: false,
    singleton: false,
    sort_field: null,
    archive_field: 'status',
    archive_value: 'archived',
    unarchive_value: 'draft',
  })

  await createField('marketing_campaigns', {
    field: 'id',
    type: 'uuid',
    meta: { special: ['uuid'], interface: 'input', readonly: true, hidden: true },
    schema: { is_primary_key: true, has_auto_increment: false },
  })

  await createField('marketing_campaigns', {
    field: 'title',
    type: 'string',
    meta: { interface: 'input', required: true, note: 'Campaign or analysis title' },
    schema: {},
  })

  await createField('marketing_campaigns', {
    field: 'goal',
    type: 'text',
    meta: { interface: 'input-multiline', note: 'User-stated campaign goal' },
    schema: {},
  })

  await createField('marketing_campaigns', {
    field: 'status',
    type: 'string',
    meta: {
      interface: 'select-dropdown',
      options: {
        choices: [
          { text: 'Draft', value: 'draft' },
          { text: 'Active', value: 'active' },
          { text: 'Paused', value: 'paused' },
          { text: 'Completed', value: 'completed' },
          { text: 'Archived', value: 'archived' },
        ],
      },
      width: 'half',
    },
    schema: { default_value: 'draft' },
  })

  await createField('marketing_campaigns', {
    field: 'type',
    type: 'string',
    meta: {
      interface: 'select-dropdown',
      options: {
        choices: [
          { text: 'Campaign', value: 'campaign' },
          { text: 'Dashboard Analysis', value: 'dashboard' },
        ],
      },
      width: 'half',
    },
    schema: { default_value: 'campaign' },
  })

  await createField('marketing_campaigns', {
    field: 'plan_data',
    type: 'json',
    meta: { interface: 'input-code', note: 'Full AI-generated plan (CampaignAnalysis or DashboardAnalysis)' },
    schema: {},
  })

  await createField('marketing_campaigns', {
    field: 'organization',
    type: 'uuid',
    meta: { interface: 'select-dropdown-m2o', special: ['m2o'], width: 'half' },
    schema: {},
  })

  await createField('marketing_campaigns', {
    field: 'start_date',
    type: 'date',
    meta: { interface: 'datetime', width: 'half' },
    schema: {},
  })

  await createField('marketing_campaigns', {
    field: 'end_date',
    type: 'date',
    meta: { interface: 'datetime', width: 'half' },
    schema: {},
  })

  await createField('marketing_campaigns', {
    field: 'user_created',
    type: 'uuid',
    meta: { special: ['user-created'], interface: 'select-dropdown-m2o', readonly: true, hidden: true },
    schema: {},
  })

  await createField('marketing_campaigns', {
    field: 'date_created',
    type: 'timestamp',
    meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true },
    schema: {},
  })

  await createField('marketing_campaigns', {
    field: 'date_updated',
    type: 'timestamp',
    meta: { special: ['date-updated'], interface: 'datetime', readonly: true, hidden: true },
    schema: {},
  })
}

// ─── ai_usage_logs ───────────────────────────────────────────────────────────

async function setupAIUsageLogs() {
  console.log('\n=== ai_usage_logs ===')

  await createCollection('ai_usage_logs', {
    icon: 'analytics',
    note: 'AI API usage tracking — tokens, costs, and request metadata',
    hidden: false,
    singleton: false,
    sort_field: null,
    archive_field: null,
  })

  await createField('ai_usage_logs', {
    field: 'id',
    type: 'uuid',
    meta: { special: ['uuid'], interface: 'input', readonly: true, hidden: true },
    schema: { is_primary_key: true, has_auto_increment: false },
  })

  await createField('ai_usage_logs', {
    field: 'user',
    type: 'uuid',
    meta: { interface: 'select-dropdown-m2o', special: ['m2o'], required: true },
    schema: {},
  })

  await createField('ai_usage_logs', {
    field: 'organization',
    type: 'uuid',
    meta: { interface: 'select-dropdown-m2o', special: ['m2o'], width: 'half' },
    schema: {},
  })

  await createField('ai_usage_logs', {
    field: 'endpoint',
    type: 'string',
    meta: { interface: 'input', required: true, note: 'e.g. ai/chat, marketing/ai-analyze' },
    schema: {},
  })

  await createField('ai_usage_logs', {
    field: 'model',
    type: 'string',
    meta: { interface: 'input', note: 'LLM model used' },
    schema: {},
  })

  await createField('ai_usage_logs', {
    field: 'input_tokens',
    type: 'integer',
    meta: { interface: 'input', width: 'half' },
    schema: { default_value: 0 },
  })

  await createField('ai_usage_logs', {
    field: 'output_tokens',
    type: 'integer',
    meta: { interface: 'input', width: 'half' },
    schema: { default_value: 0 },
  })

  await createField('ai_usage_logs', {
    field: 'total_tokens',
    type: 'integer',
    meta: { interface: 'input', width: 'half' },
    schema: { default_value: 0 },
  })

  await createField('ai_usage_logs', {
    field: 'estimated_cost',
    type: 'float',
    meta: { interface: 'input', width: 'half', note: 'Estimated cost in USD' },
    schema: { default_value: 0 },
  })

  await createField('ai_usage_logs', {
    field: 'session_id',
    type: 'string',
    meta: { interface: 'input', note: 'Related ai_chat_sessions ID (nullable)' },
    schema: {},
  })

  await createField('ai_usage_logs', {
    field: 'metadata',
    type: 'json',
    meta: { interface: 'input-code', note: 'Extra context: client_id, analysis_type, etc.' },
    schema: {},
  })

  await createField('ai_usage_logs', {
    field: 'date_created',
    type: 'timestamp',
    meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true },
    schema: {},
  })
}

// ─── Relationships ────────────────────────────────────────────────────────────

async function setupRelationships() {
  console.log('\n=== Setting up relationships ===')

  // marketing_campaigns.organization -> organizations
  console.log('  marketing_campaigns.organization -> organizations')
  await directusRequest('/relations', 'POST', {
    collection: 'marketing_campaigns',
    field: 'organization',
    related_collection: 'organizations',
    meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
    schema: { on_delete: 'SET NULL' },
  })

  // ai_usage_logs.user -> directus_users
  console.log('  ai_usage_logs.user -> directus_users')
  await directusRequest('/relations', 'POST', {
    collection: 'ai_usage_logs',
    field: 'user',
    related_collection: 'directus_users',
    meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
    schema: { on_delete: 'CASCADE' },
  })

  // ai_usage_logs.organization -> organizations
  console.log('  ai_usage_logs.organization -> organizations')
  await directusRequest('/relations', 'POST', {
    collection: 'ai_usage_logs',
    field: 'organization',
    related_collection: 'organizations',
    meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
    schema: { on_delete: 'SET NULL' },
  })
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=========================================')
  console.log('  Marketing Campaigns & AI Usage Setup')
  console.log('=========================================')
  console.log(`Target: ${DIRECTUS_URL}`)

  const { error } = await directusRequest('/server/info')
  if (error) {
    console.error(`\nCannot connect to Directus: ${error}`)
    process.exit(1)
  }
  console.log('Connected to Directus\n')

  await setupMarketingCampaigns()
  await setupAIUsageLogs()
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
