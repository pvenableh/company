#!/usr/bin/env npx tsx
/**
 * Directus Billing Fields Setup Script
 *
 * Adds fields required by the client-first billing system:
 *
 *   clients:
 *     - billing_email (string)       — primary invoice delivery email
 *     - billing_name (string)        — AP contact name
 *     - billing_address (text)       — billing/mailing address
 *     - payment_terms (string/enum)  — net_30, net_15, due_on_receipt, etc.
 *
 *   invoices:
 *     - billing_email (string)       — snapshot: email at time of invoicing
 *     - billing_name (string)        — snapshot: contact name at time of invoicing
 *     - billing_address (text)       — snapshot: address at time of invoicing
 *
 * Run:
 *   pnpm tsx scripts/setup-billing-fields.ts
 *
 * After running, regenerate types:
 *   pnpm generate:types
 *
 * Then run the data migration:
 *   POST /api/org/migrate-billing-to-clients  { organizationId, dryRun: true }
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
  console.log('\n── Billing Fields Setup ──\n')
  console.log(`Directus: ${DIRECTUS_URL}\n`)

  // ── Client billing fields ────────────────────────────────────────────────
  console.log('clients collection:')

  await createField('clients', 'billing_email', {
    type: 'string',
    meta: {
      interface: 'input',
      display: 'raw',
      note: 'Primary billing email for invoice delivery',
      group: null,
      width: 'half',
    },
    schema: {
      max_length: 255,
      is_nullable: true,
      default_value: null,
    },
  })

  await createField('clients', 'billing_name', {
    type: 'string',
    meta: {
      interface: 'input',
      display: 'raw',
      note: 'AP contact name or department',
      group: null,
      width: 'half',
    },
    schema: {
      max_length: 255,
      is_nullable: true,
      default_value: null,
    },
  })

  await createField('clients', 'billing_address', {
    type: 'text',
    meta: {
      interface: 'input-multiline',
      display: 'raw',
      note: 'Billing / mailing address',
      group: null,
      width: 'full',
    },
    schema: {
      is_nullable: true,
      default_value: null,
    },
  })

  await createField('clients', 'payment_terms', {
    type: 'string',
    meta: {
      interface: 'select-dropdown',
      display: 'labels',
      note: 'Default payment terms for new invoices',
      group: null,
      width: 'half',
      options: {
        choices: [
          { text: 'Due on Receipt', value: 'due_on_receipt' },
          { text: 'Net 15', value: 'net_15' },
          { text: 'Net 30', value: 'net_30' },
          { text: 'Net 45', value: 'net_45' },
          { text: 'Net 60', value: 'net_60' },
        ],
      },
    },
    schema: {
      max_length: 50,
      is_nullable: true,
      default_value: 'net_30',
    },
  })

  // ── Invoice billing snapshot fields ──────────────────────────────────────
  console.log('\ninvoices collection:')

  await createField('invoices', 'billing_email', {
    type: 'string',
    meta: {
      interface: 'input',
      display: 'raw',
      note: 'Snapshot: billing email at time of invoicing',
      group: null,
      width: 'half',
      readonly: true,
    },
    schema: {
      max_length: 255,
      is_nullable: true,
      default_value: null,
    },
  })

  await createField('invoices', 'billing_name', {
    type: 'string',
    meta: {
      interface: 'input',
      display: 'raw',
      note: 'Snapshot: billing contact name at time of invoicing',
      group: null,
      width: 'half',
      readonly: true,
    },
    schema: {
      max_length: 255,
      is_nullable: true,
      default_value: null,
    },
  })

  await createField('invoices', 'billing_address', {
    type: 'text',
    meta: {
      interface: 'input-multiline',
      display: 'raw',
      note: 'Snapshot: billing address at time of invoicing',
      group: null,
      width: 'full',
      readonly: true,
    },
    schema: {
      is_nullable: true,
      default_value: null,
    },
  })

  console.log('\n── Done ──\n')
  console.log('Next steps:')
  console.log('  1. Regenerate types: pnpm generate:types')
  console.log('  2. Run data migration (dry run first):')
  console.log('     POST /api/org/migrate-billing-to-clients')
  console.log('     Body: { "organizationId": "<your-org-id>", "dryRun": true }')
  console.log('  3. Review the dry run output, then set dryRun: false to execute')
}

main().catch((err) => {
  console.error('Setup failed:', err)
  process.exit(1)
})
