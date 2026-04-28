#!/usr/bin/env npx tsx
/**
 * Audit Directus row-level read permissions on tenant-scoped collections.
 *
 * Goal: surface every (policy, collection, action='read') triple where the
 * permission filter does NOT scope by `organization` for non-admin policies.
 * That's the smoke-test launch blocker — Member-role users can read other
 * tenants' rows by sending unfiltered queries.
 *
 * Usage:
 *   pnpm tsx scripts/audit-tenant-row-perms.ts
 *
 * Output: a report to stdout. Does NOT mutate anything.
 */
import 'dotenv/config'

const URL = process.env.DIRECTUS_URL || 'http://localhost:8055'
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || ''
if (!TOKEN) { console.error('DIRECTUS_SERVER_TOKEN required'); process.exit(1) }

// Collections we know hold tenant-scoped data (have an `organization` field
// that ties each row to a single org). Read permissions on these MUST filter
// by `organization`. Sourced from the codebase + smoke-report findings.
const TENANT_COLLECTIONS = [
  'organizations',          // self-scope: user's own orgs only
  'tickets', 'projects', 'tasks',
  'clients', 'leads', 'contacts', 'contact_connections', 'proposals',
  'invoices', 'invoice_items', 'payments_received', 'expenses',
  'mailing_lists', 'mailing_list_contacts', 'email_templates', 'email_campaigns',
  'comments', 'products', 'time_entries',
  'video_meetings', 'calendar_events',
  'channels', 'channel_messages',
  'teams', 'team_goals',
  'org_roles', 'org_memberships',
  'ai_notes', 'ai_notices', 'ai_chat_sessions', 'ai_chat_messages',
  'ai_context_snapshots', 'ai_preferences',
]

async function api<T = any>(path: string): Promise<T> {
  const r = await fetch(`${URL}${path}`, { headers: { Authorization: `Bearer ${TOKEN}` } })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} on ${path}`)
  const j = await r.json()
  return j.data
}

function isOrgScoped(perms: any): { scoped: boolean; reason: string } {
  if (!perms || (typeof perms === 'object' && Object.keys(perms).length === 0)) {
    return { scoped: false, reason: 'empty filter (allow-all)' }
  }
  const json = JSON.stringify(perms)
  // Recognized scope shapes (any presence is sufficient — assumes filters
  // are AND-style, so matching one tenant key bounds the row set):
  // 1. Direct `organization` key (FK or alias).
  // 2. `*_organization` / `organization_*` variants (related_organization,
  //    organization_id) — common when the FK column has an explicit suffix.
  // 3. Self-scoped `id._in.$CURRENT_USER.organizations.id` (the org row itself).
  // 4. User-scoped: `user._eq.$CURRENT_USER` (or session.user, host_user).
  // 5. JSON-substring fallback: contains $CURRENT_USER.organizations.id.
  const orgKey = /"(?:organization|organizations|organization_id|related_organization)"\s*:/.test(json)
  const refsCurrentUserOrgs = /\$CURRENT_USER\.organizations\.id/.test(json)
  const userScoped = /"(?:user|host_user|user_created)"\s*:\s*\{\s*"_eq"\s*:\s*"\$CURRENT_USER"/.test(json)
  const sessionUserScoped = /"session"\s*:\s*\{[^}]*"user"/.test(json)

  if (orgKey && refsCurrentUserOrgs) return { scoped: true, reason: 'has organization scope' }
  if (refsCurrentUserOrgs) return { scoped: true, reason: 'self-scoped via $CURRENT_USER.organizations.id' }
  if (userScoped || sessionUserScoped) return { scoped: true, reason: 'user-scoped via $CURRENT_USER' }
  if (orgKey) return { scoped: true, reason: 'mentions organization (verify manually)' }
  return { scoped: false, reason: 'no organization or user filter' }
}

async function main() {
  // 1. Policies — admin policies are exempt
  const policies = await api<any[]>('/policies?fields=id,name,admin_access&limit=-1')
  const adminPolicyIds = new Set(policies.filter((p) => p.admin_access).map((p) => p.id))
  const nonAdminPolicies = policies.filter((p) => !p.admin_access)

  console.log(`Found ${policies.length} policies (${adminPolicyIds.size} admin, ${nonAdminPolicies.length} non-admin)`)
  console.log('Non-admin policies:', nonAdminPolicies.map((p) => `${p.name} (${p.id})`).join(', '))
  console.log()

  // 2. All read permissions on tenant collections
  const filter = encodeURIComponent(JSON.stringify({
    _and: [
      { collection: { _in: TENANT_COLLECTIONS } },
      { action: { _eq: 'read' } },
    ],
  }))
  const perms = await api<any[]>(`/permissions?filter=${filter}&fields=id,policy,collection,action,permissions,fields&limit=-1`)

  console.log(`Found ${perms.length} read permission rows across ${TENANT_COLLECTIONS.length} tenant collections`)
  console.log()

  // 3. Group by collection, surface unscoped reads on non-admin policies
  type Row = { policy: string; policyName: string; collection: string; perms: any; status: string; reason: string }
  const findings: Row[] = []

  for (const perm of perms) {
    if (adminPolicyIds.has(perm.policy)) continue // admin policies are fine
    const policyName = policies.find((p) => p.id === perm.policy)?.name || perm.policy
    const { scoped, reason } = isOrgScoped(perm.permissions)
    findings.push({
      policy: perm.policy,
      policyName,
      collection: perm.collection,
      perms: perm.permissions,
      status: scoped ? 'OK' : 'UNSCOPED',
      reason,
    })
  }

  // 4. Report
  const unscoped = findings.filter((f) => f.status === 'UNSCOPED')
  const scoped = findings.filter((f) => f.status === 'OK')

  console.log('='.repeat(72))
  console.log(`UNSCOPED reads (LAUNCH BLOCKERS): ${unscoped.length}`)
  console.log('='.repeat(72))
  for (const f of unscoped) {
    console.log(`  ${f.policyName.padEnd(20)} ${f.collection.padEnd(28)} ${f.reason}`)
  }
  console.log()
  console.log(`Scoped reads (OK): ${scoped.length}`)
  for (const f of scoped) {
    console.log(`  ${f.policyName.padEnd(20)} ${f.collection.padEnd(28)} ${f.reason}`)
  }

  // 5. Collections with NO permission row at all on non-admin policies (i.e. no read access)
  console.log()
  console.log('='.repeat(72))
  console.log('Collections with NO non-admin read permission (i.e. inaccessible to Member):')
  console.log('='.repeat(72))
  const collectionsWithRead = new Set(perms.filter((p) => !adminPolicyIds.has(p.policy)).map((p) => p.collection))
  for (const c of TENANT_COLLECTIONS) {
    if (!collectionsWithRead.has(c)) console.log(`  ${c}`)
  }
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
