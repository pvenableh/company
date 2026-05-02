#!/usr/bin/env npx tsx
/**
 * One-shot migration: merge `social_clients` into `clients`.
 *
 * What it does (in --apply mode):
 *  1. Adds `social_accounts.organization` (UUID FK to organizations, required)
 *     and `social_accounts.client` (UUID FK to clients, nullable).
 *  2. Adds `social_posts.client` (UUID FK to clients, nullable).
 *  3. For every existing `social_accounts` row:
 *       - Derives `organization` from the row's user_created's active org membership.
 *       - If `client_id` (legacy social_clients FK) is set: matches the
 *         social_clients.name to an existing clients row in the same org.
 *         If no match, creates a new clients row and links it.
 *       - Writes `organization` + new `client` FK back to the row.
 *  4. For every `social_posts` row: derives `client` from the post's first
 *     target social_account's `client` (best-effort).
 *  5. (Manual step prompted at the end) drop `social_accounts.client_id`
 *     and `social_clients` collection.
 *
 * Without --apply: runs in dry-run mode. Prints the full migration plan
 * (mappings + creates) without mutating anything. Always run dry-run first.
 *
 * Usage:
 *    pnpm tsx scripts/merge-social-clients-into-clients.ts             # dry-run
 *    pnpm tsx scripts/merge-social-clients-into-clients.ts --apply     # run for real
 *    pnpm tsx scripts/merge-social-clients-into-clients.ts --apply --drop  # also drop legacy
 */

import 'dotenv/config'

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055'
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || ''

if (!DIRECTUS_TOKEN) {
  console.error('❌ DIRECTUS_SERVER_TOKEN is required (see .env)')
  process.exit(1)
}

const APPLY = process.argv.includes('--apply')
const DROP = process.argv.includes('--drop')

// ── HTTP helper ──────────────────────────────────────────────────────────────
async function req<T = any>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DIRECTUS_TOKEN}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) {
    let parsed: any
    try { parsed = JSON.parse(text) } catch { parsed = text }
    const msg = parsed?.errors?.[0]?.message || (typeof parsed === 'string' ? parsed : JSON.stringify(parsed))
    throw new Error(`${method} ${path} → ${res.status}: ${msg}`)
  }
  if (!text) return undefined as any
  const json = JSON.parse(text)
  return json.data as T
}

// ── Field-existence helpers ──────────────────────────────────────────────────
async function fieldExists(collection: string, field: string): Promise<boolean> {
  try {
    await req(`/fields/${collection}/${field}`)
    return true
  } catch { return false }
}

async function collectionExists(collection: string): Promise<boolean> {
  try {
    await req(`/collections/${collection}`)
    return true
  } catch { return false }
}

// ── Phase 1: schema additions ────────────────────────────────────────────────
async function addOrganizationFieldToSocialAccounts() {
  if (await fieldExists('social_accounts', 'organization')) {
    console.log('  ⏭  social_accounts.organization already exists')
    return
  }
  console.log('  ➕ Adding social_accounts.organization (uuid, FK organizations)')
  if (!APPLY) return
  await req('/fields/social_accounts', 'POST', {
    field: 'organization',
    type: 'uuid',
    meta: {
      interface: 'select-dropdown-m2o',
      special: ['m2o'],
      required: true,
      width: 'half',
      note: 'Owning organization',
      options: { template: '{{name}}' },
    },
    schema: { is_nullable: false, foreign_key_table: 'organizations' },
  })
  await req('/relations', 'POST', {
    collection: 'social_accounts',
    field: 'organization',
    related_collection: 'organizations',
    schema: { on_delete: 'CASCADE' },
  })
}

async function addClientFieldToSocialAccounts() {
  if (await fieldExists('social_accounts', 'client')) {
    console.log('  ⏭  social_accounts.client already exists')
    return
  }
  console.log('  ➕ Adding social_accounts.client (uuid, FK clients, nullable)')
  if (!APPLY) return
  await req('/fields/social_accounts', 'POST', {
    field: 'client',
    type: 'uuid',
    meta: {
      interface: 'select-dropdown-m2o',
      special: ['m2o'],
      width: 'half',
      note: 'Which agency client owns this account (null = house/agency-owned)',
      options: { template: '{{name}}' },
    },
    schema: { is_nullable: true, foreign_key_table: 'clients' },
  })
  await req('/relations', 'POST', {
    collection: 'social_accounts',
    field: 'client',
    related_collection: 'clients',
    schema: { on_delete: 'SET NULL' },
  })
}

async function addClientFieldToSocialPosts() {
  if (await fieldExists('social_posts', 'client')) {
    console.log('  ⏭  social_posts.client already exists')
    return
  }
  console.log('  ➕ Adding social_posts.client (uuid, FK clients, nullable)')
  if (!APPLY) return
  await req('/fields/social_posts', 'POST', {
    field: 'client',
    type: 'uuid',
    meta: {
      interface: 'select-dropdown-m2o',
      special: ['m2o'],
      width: 'half',
      note: 'Which agency client this post is for (defaults from selected accounts at compose time)',
      options: { template: '{{name}}' },
    },
    schema: { is_nullable: true, foreign_key_table: 'clients' },
  })
  await req('/relations', 'POST', {
    collection: 'social_posts',
    field: 'client',
    related_collection: 'clients',
    schema: { on_delete: 'SET NULL' },
  })
}

async function addOrganizationFieldToSocialPosts() {
  if (await fieldExists('social_posts', 'organization')) {
    console.log('  ⏭  social_posts.organization already exists')
    return
  }
  console.log('  ➕ Adding social_posts.organization (uuid, FK organizations, required)')
  if (!APPLY) return
  await req('/fields/social_posts', 'POST', {
    field: 'organization',
    type: 'uuid',
    meta: {
      interface: 'select-dropdown-m2o',
      special: ['m2o'],
      required: true,
      width: 'half',
      note: 'Owning organization',
      options: { template: '{{name}}' },
    },
    schema: { is_nullable: false, foreign_key_table: 'organizations' },
  })
  await req('/relations', 'POST', {
    collection: 'social_posts',
    field: 'organization',
    related_collection: 'organizations',
    schema: { on_delete: 'CASCADE' },
  })
}

// ── Phase 2: data migration ──────────────────────────────────────────────────
interface SocialClientRow { id: string; name: string; logo_url?: string | null; contact_email?: string | null; brand_color?: string | null; notes?: string | null; user_created?: string | null }
interface SocialAccountRow { id: string; account_name: string; account_handle: string; platform: string; client_id?: string | null; organization?: string | null; client?: string | null; user_created?: string | null }
interface SocialPostRow { id: string; platforms?: any; user_created?: string | null }
interface ClientRow { id: string; name: string; organization: string }

async function listAll<T>(collection: string, fields: string[], extra?: Record<string, string>): Promise<T[]> {
  const out: T[] = []
  const pageSize = 200
  let page = 1
  while (true) {
    const params = new URLSearchParams({
      limit: String(pageSize),
      page: String(page),
      fields: fields.join(','),
      ...(extra || {}),
    })
    const data = (await req<T[]>(`/items/${collection}?${params}`)) || []
    out.push(...data)
    if (data.length < pageSize) break
    page++
  }
  return out
}

async function getOrgForUser(userId: string, cache: Map<string, string | null>): Promise<string | null> {
  if (cache.has(userId)) return cache.get(userId)!
  try {
    const params = new URLSearchParams({
      'filter[user][_eq]': userId,
      'filter[status][_eq]': 'active',
      fields: 'organization',
      limit: '1',
    })
    const memberships = (await req<any[]>(`/items/org_memberships?${params}`)) || []
    const orgId = memberships[0]?.organization || null
    cache.set(userId, orgId)
    return orgId
  } catch {
    cache.set(userId, null)
    return null
  }
}

interface AccountPlan {
  account: SocialAccountRow
  organization: string | null
  unmatchedReason?: string
  socialClient?: SocialClientRow
  matchedClientId?: string
  willCreateClient?: { name: string; organization: string }
}

async function planMigration() {
  console.log('\n=== Phase 2: Data migration plan ===')

  const accountFields = ['id', 'account_name', 'account_handle', 'platform', 'user_created']
  if (await fieldExists('social_accounts', 'client_id')) accountFields.push('client_id')
  if (await fieldExists('social_accounts', 'organization')) accountFields.push('organization')
  if (await fieldExists('social_accounts', 'client')) accountFields.push('client')

  const socialClients = (await collectionExists('social_clients'))
    ? await listAll<SocialClientRow>('social_clients', ['id', 'name', 'logo_url', 'contact_email', 'brand_color', 'notes', 'user_created'])
    : []
  const socialAccounts = await listAll<SocialAccountRow>('social_accounts', accountFields)
  const allClients = await listAll<ClientRow>('clients', ['id', 'name', 'organization'])

  console.log(`  Loaded ${socialClients.length} social_clients, ${socialAccounts.length} social_accounts, ${allClients.length} clients`)

  // Group existing clients by (org, lowercased name)
  const clientsByOrgName = new Map<string, ClientRow>()
  for (const c of allClients) {
    clientsByOrgName.set(`${c.organization}|${c.name.toLowerCase().trim()}`, c)
  }

  const socialClientsById = new Map<string, SocialClientRow>()
  for (const sc of socialClients) socialClientsById.set(sc.id, sc)

  const orgCache = new Map<string, string | null>()
  const plan: AccountPlan[] = []

  for (const acc of socialAccounts) {
    let org: string | null = acc.organization || null
    if (!org && acc.user_created) {
      org = await getOrgForUser(acc.user_created, orgCache)
    }

    const item: AccountPlan = { account: acc, organization: org }

    if (acc.client_id && socialClientsById.has(acc.client_id)) {
      const sc = socialClientsById.get(acc.client_id)!
      item.socialClient = sc

      if (!org) {
        item.unmatchedReason = 'no organization derivable (no user_created or no membership)'
      } else {
        const key = `${org}|${sc.name.toLowerCase().trim()}`
        const existing = clientsByOrgName.get(key)
        if (existing) {
          item.matchedClientId = existing.id
        } else {
          item.willCreateClient = { name: sc.name, organization: org }
        }
      }
    }

    plan.push(item)
  }

  // Print plan summary
  const haveOrg = plan.filter((p) => p.organization).length
  const noOrg = plan.length - haveOrg
  const matched = plan.filter((p) => p.matchedClientId).length
  const willCreate = plan.filter((p) => p.willCreateClient).length
  const noLegacyClient = plan.filter((p) => !p.socialClient).length

  console.log('\n  Per-account migration:')
  console.log(`    accounts with derivable organization : ${haveOrg}`)
  console.log(`    accounts with NO organization        : ${noOrg}  ${noOrg > 0 ? '⚠️ will skip' : ''}`)
  console.log(`    accounts referencing a social_client : ${plan.length - noLegacyClient}`)
  console.log(`        → matched to existing clients    : ${matched}`)
  console.log(`        → new clients to create          : ${willCreate}`)
  console.log(`    accounts with no legacy client       : ${noLegacyClient}  → client = null (house-owned)`)

  // List the social_clients that need creating
  if (willCreate > 0) {
    console.log('\n  New clients to create:')
    const seen = new Set<string>()
    for (const p of plan) {
      if (!p.willCreateClient) continue
      const key = `${p.willCreateClient.organization}|${p.willCreateClient.name.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      console.log(`    + clients{ name: ${JSON.stringify(p.willCreateClient.name)}, organization: ${p.willCreateClient.organization} }`)
    }
  }

  // Per-account detail (only first 25 to avoid noise)
  if (plan.length > 0) {
    console.log('\n  Per-account detail (first 25):')
    for (const p of plan.slice(0, 25)) {
      const a = p.account
      const target = p.matchedClientId
        ? `→ existing client ${p.matchedClientId}`
        : p.willCreateClient
          ? `→ NEW client ${JSON.stringify(p.willCreateClient.name)}`
          : p.socialClient
            ? `→ skip (${p.unmatchedReason})`
            : '→ client=null (house-owned)'
      console.log(`    ${a.platform.padEnd(10)} ${a.account_name.padEnd(28)} org=${p.organization || 'NONE'} ${target}`)
    }
    if (plan.length > 25) console.log(`    … ${plan.length - 25} more`)
  }

  return plan
}

async function applyMigration(plan: AccountPlan[]) {
  console.log('\n=== Phase 3: Apply migration ===')

  // 3a. Create needed clients (one per (org, name))
  const seen = new Set<string>()
  const newClientIdByKey = new Map<string, string>()
  for (const p of plan) {
    if (!p.willCreateClient) continue
    const key = `${p.willCreateClient.organization}|${p.willCreateClient.name.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)

    if (APPLY) {
      const created = await req<ClientRow>('/items/clients', 'POST', {
        name: p.willCreateClient.name,
        organization: p.willCreateClient.organization,
      })
      newClientIdByKey.set(key, created.id)
      console.log(`  ✓ Created clients row: ${created.id} (${p.willCreateClient.name})`)
    } else {
      console.log(`  [dry-run] would create clients row: ${p.willCreateClient.name}`)
    }
  }

  // 3b. Update each social_account
  let updated = 0
  let skipped = 0
  for (const p of plan) {
    if (!p.organization) {
      skipped++
      continue
    }

    let clientId: string | null = p.matchedClientId || null
    if (!clientId && p.willCreateClient) {
      const key = `${p.willCreateClient.organization}|${p.willCreateClient.name.toLowerCase()}`
      clientId = newClientIdByKey.get(key) || null
    }

    const payload: Record<string, any> = {
      organization: p.organization,
      client: clientId,
    }

    if (APPLY) {
      await req(`/items/social_accounts/${p.account.id}`, 'PATCH', payload)
    }
    updated++
  }
  console.log(`  ${APPLY ? '✓ Updated' : '[dry-run] would update'} ${updated} social_accounts row(s); skipped ${skipped}`)
}

async function migrateSocialPosts() {
  console.log('\n=== Phase 4: Backfill social_posts.organization + social_posts.client ===')

  const postFields = ['id', 'platforms', 'user_created']
  if (await fieldExists('social_posts', 'organization')) postFields.push('organization')
  if (await fieldExists('social_posts', 'client')) postFields.push('client')
  const accountFields2 = ['id']
  if (await fieldExists('social_accounts', 'organization')) accountFields2.push('organization')
  if (await fieldExists('social_accounts', 'client')) accountFields2.push('client')

  const posts = await listAll<SocialPostRow>('social_posts', postFields)
  const accounts = await listAll<SocialAccountRow>('social_accounts', accountFields2)
  const accountById = new Map<string, SocialAccountRow>()
  for (const a of accounts) accountById.set(a.id, a)

  const orgCache = new Map<string, string | null>()
  let backfilled = 0
  let skipped = 0

  for (const post of posts) {
    const targets: any[] = Array.isArray(post.platforms) ? post.platforms : []
    let org: string | null = (post as any).organization || null
    let client: string | null = (post as any).client || null

    // Try to derive from first target account
    for (const t of targets) {
      const accId = t?.account_id
      if (!accId) continue
      const acc = accountById.get(accId)
      if (acc) {
        if (!org) org = acc.organization || null
        if (client === null && acc.client) client = acc.client
        if (org) break
      }
    }

    // Fallback: derive org from user_created
    if (!org && post.user_created) {
      org = await getOrgForUser(post.user_created, orgCache)
    }

    if (!org) {
      skipped++
      continue
    }

    if (APPLY) {
      await req(`/items/social_posts/${post.id}`, 'PATCH', { organization: org, client })
    }
    backfilled++
  }
  console.log(`  ${APPLY ? '✓ Backfilled' : '[dry-run] would backfill'} ${backfilled} social_posts row(s); skipped ${skipped} (no derivable org)`)
}

// ── Phase 5: drop legacy ─────────────────────────────────────────────────────
async function dropLegacy() {
  console.log('\n=== Phase 5: Drop legacy schema (--drop) ===')

  if (await fieldExists('social_accounts', 'client_id')) {
    console.log('  🗑  Dropping social_accounts.client_id')
    if (APPLY) await req('/fields/social_accounts/client_id', 'DELETE')
  } else {
    console.log('  ⏭  social_accounts.client_id already gone')
  }

  if (await collectionExists('social_clients')) {
    console.log('  🗑  Dropping collection social_clients')
    if (APPLY) await req('/collections/social_clients', 'DELETE')
  } else {
    console.log('  ⏭  social_clients collection already gone')
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== Merge social_clients → clients ===`)
  console.log(`  Directus URL : ${DIRECTUS_URL}`)
  console.log(`  Mode         : ${APPLY ? '🔥 APPLY' : 'DRY-RUN (no writes)'}`)
  console.log(`  Drop legacy  : ${DROP ? 'yes' : 'no (use --drop)'}`)

  console.log('\n=== Phase 1: Schema additions ===')
  await addOrganizationFieldToSocialAccounts()
  await addClientFieldToSocialAccounts()
  await addOrganizationFieldToSocialPosts()
  await addClientFieldToSocialPosts()

  const plan = await planMigration()
  await applyMigration(plan)
  await migrateSocialPosts()

  if (DROP) await dropLegacy()
  else console.log('\n  (skipping legacy drop — pass --drop alongside --apply when ready)')

  console.log('\n✓ Done.')
}

main().catch((err) => {
  console.error('\n❌ Migration failed:', err.message)
  process.exit(1)
})
