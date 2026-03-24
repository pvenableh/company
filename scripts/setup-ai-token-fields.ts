#!/usr/bin/env npx tsx
/**
 * Directus AI Token Management Fields Setup Script
 *
 * Adds fields required by the AI token management system:
 *
 *   ai_preferences:
 *     - ai_enabled (boolean, default true) — admin toggle for member AI access
 *     - organization (M2O → organizations) — links preference to org
 *
 *   organizations (verify these exist):
 *     - ai_token_balance (integer, nullable) — remaining prepaid tokens
 *     - ai_token_limit_monthly (integer, nullable) — monthly cap
 *     - ai_tokens_used_this_period (integer, default 0) — usage counter
 *     - ai_billing_period_start (timestamp, nullable) — period start date
 *
 * Run:
 *   pnpm tsx scripts/setup-ai-token-fields.ts
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
  console.log('\n── AI Token Management Fields Setup ──\n')
  console.log(`Directus: ${DIRECTUS_URL}\n`)

  // ─── ai_preferences fields ───
  console.log('ai_preferences:')

  await createField('ai_preferences', 'ai_enabled', {
    type: 'boolean',
    schema: { default_value: true },
    meta: {
      interface: 'boolean',
      display: 'boolean',
      note: 'Whether AI access is enabled for this user (admin-controlled)',
      width: 'half',
    },
  })

  await createField('ai_preferences', 'organization', {
    type: 'uuid',
    schema: { is_nullable: true },
    meta: {
      interface: 'select-dropdown-m2o',
      display: 'related-values',
      note: 'Organization this preference belongs to',
      width: 'half',
    },
    relation: {
      related_collection: 'organizations',
      meta: {
        one_field: null,
        sort_field: null,
        one_deselect_action: 'nullify',
      },
    },
  })

  // ─── organizations fields (verify/create) ───
  console.log('\norganizations:')

  await createField('organizations', 'ai_token_balance', {
    type: 'integer',
    schema: { is_nullable: true, default_value: null },
    meta: {
      interface: 'input',
      display: 'formatted-value',
      note: 'Remaining AI token balance (null = unlimited)',
      width: 'half',
      group: null,
    },
  })

  await createField('organizations', 'ai_token_limit_monthly', {
    type: 'integer',
    schema: { is_nullable: true, default_value: null },
    meta: {
      interface: 'input',
      display: 'formatted-value',
      note: 'Monthly AI token allotment (null = unlimited)',
      width: 'half',
    },
  })

  await createField('organizations', 'ai_tokens_used_this_period', {
    type: 'integer',
    schema: { is_nullable: true, default_value: 0 },
    meta: {
      interface: 'input',
      display: 'formatted-value',
      note: 'Tokens consumed in current billing period',
      width: 'half',
      readonly: true,
    },
  })

  await createField('organizations', 'ai_billing_period_start', {
    type: 'timestamp',
    schema: { is_nullable: true, default_value: null },
    meta: {
      interface: 'datetime',
      display: 'datetime',
      note: 'Start of current AI billing period',
      width: 'half',
    },
  })

  console.log('\n── Done ──\n')
  console.log('Next steps:')
  console.log('  1. Run "pnpm generate:types" to regenerate TypeScript types')
  console.log('  2. Set AI permissions: pnpm tsx scripts/setup-ai-permissions.ts')
  console.log('  3. Verify fields in Directus admin panel')
}

main().catch(console.error)
