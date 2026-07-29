#!/usr/bin/env npx tsx
/**
 * Directus trial-gating fields setup
 *
 * Adds the two org-level fields the 14-day no-card trial relies on:
 *
 *   organizations:
 *     - subscription_status (string)   — org-level mirror of the Stripe
 *                                        subscription status, written by the
 *                                        webhook (server/api/stripe/paymentchange.ts)
 *                                        and read cheaply by the trial-expiry gate
 *                                        (app/middleware/subscription.global.ts) +
 *                                        AI enforcement (server/utils/ai-token-enforcement.ts).
 *                                        Same enum as directus_users.subscription_status.
 *     - trial_ends_at (timestamp)      — Stripe `trial_end`, for the countdown UI
 *                                        and to know when a trial lapses.
 *
 * Idempotent: existing fields are skipped (mirrors setup-stripe-sync-fields.ts).
 *
 * Run:
 *   pnpm tsx scripts/setup-trial-fields.ts
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
  console.log('\n── Trial-gating Fields Setup ──\n')
  console.log(`Directus: ${DIRECTUS_URL}\n`)

  console.log('organizations collection:')

  await createField('organizations', 'subscription_status', {
    type: 'string',
    meta: {
      interface: 'select-dropdown',
      display: 'labels',
      note: 'Org-level mirror of the Stripe subscription status (written by the Stripe webhook). Drives the trial-expiry gate.',
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

  await createField('organizations', 'trial_ends_at', {
    type: 'timestamp',
    meta: {
      interface: 'datetime',
      display: 'datetime',
      note: "When the org's free trial ends (Stripe trial_end). Null when not on a trial.",
      readonly: true,
      hidden: false,
      width: 'half',
    },
    schema: {
      is_nullable: true,
      default_value: null,
    },
  })

  console.log('\n── Done ──\n')
  console.log('Next steps:')
  console.log('  1. Regenerate types: pnpm generate:types')
  console.log('  2. Re-run a Stripe test trial subscription to verify the webhook mirrors status + trial_ends_at onto the org.')
}

main().catch((err) => {
  console.error('Setup failed:', err)
  process.exit(1)
})
