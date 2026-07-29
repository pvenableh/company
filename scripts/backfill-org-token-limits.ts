#!/usr/bin/env npx tsx
/**
 * Backfill org token/scan limits — closes the free-token cost leak.
 *
 * Historically, orgs were created with NO `ai_token_limit_monthly` /
 * `scan_credits_limit_monthly` set, and server/utils/ai-token-enforcement.ts
 * treats a null limit as UNLIMITED. So every legacy `free` org (and any org that
 * never subscribed) got unmetered AI at real Anthropic cost.
 *
 * This one-time pass finds every org with a null `ai_token_limit_monthly` and
 * sets a real, metered cap:
 *   - enterprise            → left null (internal / unlimited — hand-configured)
 *   - free                  → 0 (fully metered; grant tokens per-org via the admin
 *                             plan endpoint if a specific free org should keep AI)
 *   - solo / studio / agency → their plan's allotment (these are paying orgs whose
 *                             limits simply predate the field)
 *
 * Idempotent: an org whose limit is already set is skipped (the null filter).
 *
 * Run (once per environment, AFTER deploying the code + running
 * scripts/setup-trial-fields.ts):
 *   pnpm tsx scripts/backfill-org-token-limits.ts
 *
 * Dry run (report only, no writes):
 *   DRY_RUN=1 pnpm tsx scripts/backfill-org-token-limits.ts
 */

import 'dotenv/config'

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055'
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || ''
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'

if (!DIRECTUS_TOKEN) {
  console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN environment variable is required')
  process.exit(1)
}

// Mirrors EARNEST_PLANS (server/utils/stripe.ts). Kept as literals so this stays
// a standalone script (no Nuxt alias resolution).
const PLAN_LIMITS: Record<string, { tokens: number; scans: number }> = {
  free: { tokens: 0, scans: 0 },
  solo: { tokens: 100_000, scans: 25 },
  studio: { tokens: 400_000, scans: 150 },
  agency: { tokens: 1_000_000, scans: 500 },
}

async function directusRequest<T = unknown>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' = 'GET',
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
      const err = text ? JSON.parse(text) : {}
      return { data: null, error: err.errors?.[0]?.message || `HTTP ${response.status}` }
    }
    const json = text ? JSON.parse(text) : {}
    return { data: (json.data ?? null) as T, error: null }
  } catch (err: any) {
    return { data: null, error: err.message }
  }
}

async function main() {
  console.log(`\n── Backfill org token/scan limits ${DRY_RUN ? '(DRY RUN)' : ''} ──\n`)
  console.log(`Directus: ${DIRECTUS_URL}\n`)

  // Every org whose monthly AI limit was never set (null = unlimited today).
  const { data: orgs, error } = await directusRequest<Array<{ id: string; plan: string | null; name: string | null }>>(
    `/items/organizations?filter[ai_token_limit_monthly][_null]=true&fields=id,plan,name&limit=-1`,
  )
  if (error) {
    console.error(`Failed to list organizations: ${error}`)
    process.exit(1)
  }
  const rows = orgs || []
  console.log(`Found ${rows.length} org(s) with a null ai_token_limit_monthly.\n`)

  let capped = 0
  let skipped = 0
  for (const org of rows) {
    const plan = (org.plan || 'free') as string
    if (plan === 'enterprise') {
      console.log(`  ⊘ ${org.name ?? org.id} — enterprise, left unlimited`)
      skipped++
      continue
    }
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free!
    const patch = {
      ai_token_limit_monthly: limits.tokens,
      scan_credits_limit_monthly: limits.scans,
    }
    if (DRY_RUN) {
      console.log(`  · ${org.name ?? org.id} (${plan}) → tokens ${limits.tokens}, scans ${limits.scans}`)
      capped++
      continue
    }
    const { error: patchErr } = await directusRequest(`/items/organizations/${org.id}`, 'PATCH', patch)
    if (patchErr) {
      console.error(`  ✗ ${org.name ?? org.id} (${plan}): ${patchErr}`)
    } else {
      console.log(`  + ${org.name ?? org.id} (${plan}) → tokens ${limits.tokens}, scans ${limits.scans}`)
      capped++
    }
  }

  console.log(`\n── Done ── ${capped} capped, ${skipped} left unlimited (enterprise).\n`)
}

main().catch((err) => {
  console.error('Backfill failed:', err)
  process.exit(1)
})
