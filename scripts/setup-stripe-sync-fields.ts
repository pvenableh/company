#!/usr/bin/env npx tsx
/**
 * Directus Stripe-sync fields setup
 *
 * Adds the fields the Stripe webhook handler at
 * `server/api/stripe/paymentchange.ts` reads from / writes to. Without these
 * fields the entire `customer.subscription.*` → org sync chain silently
 * no-ops because `findOrgForCustomer` filters on a non-existent column.
 *
 *   directus_users:
 *     - stripe_customer_id (string)              — primary lookup key in webhook
 *     - stripe_subscription_id (string)          — set on checkout/sub events
 *     - subscription_status (string)             — active|past_due|canceled|trialing
 *     - subscription_plan (string)               — Stripe price id of the active plan
 *     - subscription_current_period_end (datetime)
 *
 *   organizations:
 *     - stripe_subscription_id (string)          — denormalized for org-level queries
 *
 * Run:
 *   pnpm tsx scripts/setup-stripe-sync-fields.ts
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
  console.log('\n── Stripe-sync Fields Setup ──\n')
  console.log(`Directus: ${DIRECTUS_URL}\n`)

  // ── directus_users ───────────────────────────────────────────────────────
  console.log('directus_users collection:')

  await createField('directus_users', 'stripe_customer_id', {
    type: 'string',
    meta: {
      interface: 'input',
      display: 'raw',
      note: 'Stripe Customer id (cus_…). Set on registration; primary lookup key for webhook → org sync.',
      readonly: true,
      hidden: false,
      width: 'half',
    },
    schema: {
      max_length: 64,
      is_nullable: true,
      default_value: null,
    },
  })

  await createField('directus_users', 'stripe_subscription_id', {
    type: 'string',
    meta: {
      interface: 'input',
      display: 'raw',
      note: 'Stripe Subscription id (sub_…). Set by checkout/subscription webhooks.',
      readonly: true,
      hidden: false,
      width: 'half',
    },
    schema: {
      max_length: 64,
      is_nullable: true,
      default_value: null,
    },
  })

  await createField('directus_users', 'subscription_status', {
    type: 'string',
    meta: {
      interface: 'select-dropdown',
      display: 'labels',
      note: 'Stripe subscription status mirror.',
      readonly: true,
      hidden: false,
      width: 'half',
      options: {
        choices: [
          { text: 'Active', value: 'active' },
          { text: 'Trialing', value: 'trialing' },
          { text: 'Past Due', value: 'past_due' },
          { text: 'Canceled', value: 'canceled' },
          { text: 'Unpaid', value: 'unpaid' },
          { text: 'Incomplete', value: 'incomplete' },
          { text: 'Incomplete Expired', value: 'incomplete_expired' },
          { text: 'Paused', value: 'paused' },
        ],
      },
    },
    schema: {
      max_length: 32,
      is_nullable: true,
      default_value: null,
    },
  })

  await createField('directus_users', 'subscription_plan', {
    type: 'string',
    meta: {
      interface: 'input',
      display: 'raw',
      note: 'Stripe Price id of the active line item (price_…).',
      readonly: true,
      hidden: false,
      width: 'half',
    },
    schema: {
      max_length: 64,
      is_nullable: true,
      default_value: null,
    },
  })

  await createField('directus_users', 'subscription_current_period_end', {
    type: 'timestamp',
    meta: {
      interface: 'datetime',
      display: 'datetime',
      note: 'When the current billing period rolls over.',
      readonly: true,
      hidden: false,
      width: 'half',
    },
    schema: {
      is_nullable: true,
      default_value: null,
    },
  })

  // ── organizations ────────────────────────────────────────────────────────
  console.log('\norganizations collection:')

  await createField('organizations', 'stripe_subscription_id', {
    type: 'string',
    meta: {
      interface: 'input',
      display: 'raw',
      note: 'Org-level mirror of the active Stripe Subscription id.',
      readonly: true,
      hidden: false,
      width: 'half',
    },
    schema: {
      max_length: 64,
      is_nullable: true,
      default_value: null,
    },
  })

  console.log('\n── Done ──\n')
  console.log('Next steps:')
  console.log('  1. Regenerate types: pnpm generate:types')
  console.log('  2. Re-run a Stripe test subscription against an existing customer to verify the webhook now lands.')
}

main().catch((err) => {
  console.error('Setup failed:', err)
  process.exit(1)
})
