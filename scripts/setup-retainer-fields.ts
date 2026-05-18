#!/usr/bin/env npx tsx
/**
 * Directus Retainer Fields Setup Script
 *
 * Adds fields to `projects` for the hourly-retainer model:
 *
 *   projects:
 *     - billing_type (enum)                 — fixed_fee | hourly_retainer | time_and_materials | non_billable
 *     - retainer_hours_per_period (decimal) — monthly/quarterly hour allocation
 *     - retainer_period (enum)              — monthly | quarterly
 *     - retainer_hourly_rate (decimal)      — snapshot rate for invoicing
 *     - retainer_started_at (date)          — informational anchor (math uses calendar month)
 *     - show_hours_to_client (boolean)      — portal visibility toggle for monthly burn total
 *
 * Run:
 *   pnpm tsx scripts/setup-retainer-fields.ts
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
  console.log('\n── Retainer Fields Setup ──\n')
  console.log(`Directus: ${DIRECTUS_URL}\n`)

  console.log('projects collection:')

  await createField('projects', 'billing_type', {
    type: 'string',
    meta: {
      interface: 'select-dropdown',
      display: 'labels',
      note: 'How the project bills. Drives retainer hour tracking.',
      group: null,
      width: 'half',
      options: {
        choices: [
          { text: 'Fixed Fee', value: 'fixed_fee' },
          { text: 'Hourly Retainer', value: 'hourly_retainer' },
          { text: 'Time & Materials', value: 'time_and_materials' },
          { text: 'Non-billable', value: 'non_billable' },
        ],
      },
    },
    schema: {
      max_length: 50,
      is_nullable: true,
      default_value: null,
    },
  })

  await createField('projects', 'retainer_hours_per_period', {
    type: 'decimal',
    meta: {
      interface: 'input',
      display: 'raw',
      note: 'Hours allocated per period (e.g. 20 hrs/month)',
      group: null,
      width: 'half',
      conditions: [
        {
          name: 'Show only for hourly retainer',
          rule: { _and: [{ billing_type: { _eq: 'hourly_retainer' } }] },
          hidden: false,
        },
      ],
    },
    schema: {
      numeric_precision: 10,
      numeric_scale: 2,
      is_nullable: true,
      default_value: null,
    },
  })

  await createField('projects', 'retainer_period', {
    type: 'string',
    meta: {
      interface: 'select-dropdown',
      display: 'labels',
      note: 'Reset cadence for the hour pool',
      group: null,
      width: 'half',
      options: {
        choices: [
          { text: 'Monthly', value: 'monthly' },
          { text: 'Quarterly', value: 'quarterly' },
        ],
      },
    },
    schema: {
      max_length: 20,
      is_nullable: true,
      default_value: 'monthly',
    },
  })

  await createField('projects', 'retainer_hourly_rate', {
    type: 'decimal',
    meta: {
      interface: 'input',
      display: 'raw',
      note: 'Hourly rate snapshot used for invoicing retainer overages',
      group: null,
      width: 'half',
    },
    schema: {
      numeric_precision: 10,
      numeric_scale: 2,
      is_nullable: true,
      default_value: null,
    },
  })

  await createField('projects', 'retainer_started_at', {
    type: 'date',
    meta: {
      interface: 'datetime',
      display: 'datetime',
      note: 'When this retainer began (informational — period math uses calendar)',
      group: null,
      width: 'half',
    },
    schema: {
      is_nullable: true,
      default_value: null,
    },
  })

  await createField('projects', 'show_hours_to_client', {
    type: 'boolean',
    meta: {
      interface: 'boolean',
      display: 'boolean',
      note: 'Display monthly hours used to the client in the portal. Per-entry detail is never shown.',
      group: null,
      width: 'half',
    },
    schema: {
      is_nullable: false,
      default_value: false,
    },
  })

  console.log('\n── Done ──\n')
  console.log('Next: regenerate types — pnpm generate:types')
}

main().catch((err) => {
  console.error('Setup failed:', err)
  process.exit(1)
})
