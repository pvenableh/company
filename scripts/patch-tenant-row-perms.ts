#!/usr/bin/env npx tsx
/**
 * Patch Directus row-level read permissions on tenant-scoped collections.
 *
 * Closes the cross-tenant read leak surfaced by Session-6 smoke test.
 * Pair script with `audit-tenant-row-perms.ts` — run audit before & after.
 *
 * What it does:
 *   1. Public policy: DELETE blanket reads on tenant collections that don't
 *      back any unauth flow. The unauth public invoice payment page at
 *      /invoices/[id] still needs Public reads on invoices/clients/products/
 *      payments_received/organizations (deep-fetched via invoice.bill_to,
 *      invoice.client, invoice.line_items.product, invoice.payments). Those
 *      stay; everything else is dropped.
 *
 *   2. Client Manager policy (default Earnest user role): UPSERT scoped
 *      read rows for every tenant collection so post-Public-strip the user
 *      retains access only to their own orgs' rows.
 *
 *   3. Client + Carddesk User policies: scope every existing unscoped read
 *      row in place. Don't add new read rows (preserves whatever surface
 *      these client-portal-style policies currently target).
 *
 * Usage:
 *   pnpm tsx scripts/patch-tenant-row-perms.ts            # dry-run (default)
 *   pnpm tsx scripts/patch-tenant-row-perms.ts --apply    # actually mutate
 *
 * Backup: backup is the operator's responsibility — see
 * docs/perms-backup-2026-04-28.json for one captured before the patch landed.
 */
import 'dotenv/config'

const URL = process.env.DIRECTUS_URL || 'http://localhost:8055'
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || ''
if (!TOKEN) { console.error('DIRECTUS_SERVER_TOKEN required'); process.exit(1) }

const APPLY = process.argv.includes('--apply')

const POLICY = {
  CLIENT_MANAGER: '012beff9-150c-49e9-a284-1a7e2757e0dd',
  CARDDESK_USER:  '14b84634-157a-4ddb-bb2a-74e70f01798e',
  PUBLIC:         'abf8a154-5b1c-4a46-ac9c-7300570f4f17',
  CLIENT:         'cdadd1fd-280e-4d4a-83e6-1b911889af46',
} as const

// Public policy: KEEP read on these (deep-fetched by /invoices/[id] public
// payment page via invoice.bill_to/client/line_items/payments). Residual
// risk: an authenticated user can still list all invoices+clients+products+
// payments_received+organizations cross-tenant via this Public fallback.
// Closing that residual leak requires moving the public payment page off the
// /api/directus/items proxy and onto a dedicated server route — out of scope
// for this session.
const PUBLIC_KEEP = new Set(['invoices', 'clients', 'products', 'payments_received', 'organizations'])

// Public policy: DROP read on these (no unauth flow needs them; cross-tenant
// leak surfaces via this fallback for authenticated users too).
const PUBLIC_DROP = [
  'mailing_lists', 'mailing_list_contacts',
  'tickets', 'projects', 'tasks', 'leads',
  'contacts', 'comments', 'channels', 'teams',
  'email_templates', 'video_meetings',
  'ai_chat_messages', 'ai_chat_sessions', 'ai_preferences',
]

// All tenant collections that Client Manager (default user role) should be
// able to read, scoped to their own orgs. After Public is stripped, these
// become the *only* read paths for Member-style users.
const TENANT_COLLECTIONS = [
  'organizations',
  'tickets', 'projects', 'tasks',
  'clients', 'leads', 'contacts', 'contact_connections', 'proposals',
  'invoices', 'invoice_items', 'payments_received', 'expenses',
  'mailing_lists', 'mailing_list_contacts', 'email_templates',
  'comments', 'products', 'time_entries',
  'video_meetings',
  'channels',
  'teams', 'team_goals',
  'org_roles', 'org_memberships',
  'ai_notes', 'ai_chat_sessions', 'ai_chat_messages', 'ai_preferences',
  'ai_context_snapshots',
]
const TENANT_SET = new Set(TENANT_COLLECTIONS)

// Per-collection scope filter shape. Default is `organization._in.$CURRENT_USER.organizations.organizations_id`.
function scopeFor(collection: string): any {
  switch (collection) {
    case 'organizations':
      // Use reverse M2M (no recursion). Self-referencing
      // `id._in.$CURRENT_USER.organizations.organizations_id` would force
      // Directus to read `organizations` rows to resolve the filter, then
      // re-apply the same filter — 500.
      return { users: { directus_users_id: { _eq: '$CURRENT_USER' } } }
    case 'tasks':
      return { organization_id: { _in: '$CURRENT_USER.organizations.organizations_id' } }
    case 'team_goals':
      return { team: { organization: { _in: '$CURRENT_USER.organizations.organizations_id' } } }
    case 'mailing_list_contacts':
      return { list_id: { organization: { _in: '$CURRENT_USER.organizations.organizations_id' } } }
    case 'invoices':
      return { client: { organization: { _in: '$CURRENT_USER.organizations.organizations_id' } } }
    case 'invoice_items':
      return { invoice: { client: { organization: { _in: '$CURRENT_USER.organizations.organizations_id' } } } }
    case 'contacts':
      // Orphan contacts (no client) need a fallback — leads.contact reverse
      // alias and user_created cover the lead-pipeline + creator paths.
      return { _or: [
        { client: { organization: { _in: '$CURRENT_USER.organizations.organizations_id' } } },
        { leads: { organization: { _in: '$CURRENT_USER.organizations.organizations_id' } } },
        { user_created: { _eq: '$CURRENT_USER' } },
      ] }
    case 'contact_connections':
      return { client: { organization: { _in: '$CURRENT_USER.organizations.organizations_id' } } }
    case 'comments':
      // Polymorphic (parent_id + collection + item). Scope by author being
      // in one of the user's orgs — not perfect, but lets team threads work
      // (any commenter who shares an org with the current user is visible).
      return { user: { organizations: { organizations_id: { _in: '$CURRENT_USER.organizations.organizations_id' } } } }
    case 'video_meetings':
      // No `organization` column; combine host_user with related_organization
      // so both hosts and tenant members can see the meeting record.
      return { _or: [
        { host_user: { _eq: '$CURRENT_USER' } },
        { related_organization: { _in: '$CURRENT_USER.organizations.organizations_id' } },
      ] }
    case 'ai_chat_sessions':
      return { user: { _eq: '$CURRENT_USER' } }
    case 'ai_chat_messages':
      return { session: { user: { _eq: '$CURRENT_USER' } } }
    case 'ai_preferences':
      return { user: { _eq: '$CURRENT_USER' } }
    default:
      return { organization: { _in: '$CURRENT_USER.organizations.organizations_id' } }
  }
}

async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
  if (!r.ok) {
    const body = await r.text().catch(() => '')
    throw new Error(`${r.status} ${r.statusText} on ${init?.method || 'GET'} ${path}\n${body}`)
  }
  if (r.status === 204) return undefined as any
  const j = await r.json()
  return j.data
}

type Op =
  | { kind: 'delete'; id: number; policyName: string; collection: string; reason: string }
  | { kind: 'update'; id: number; policyName: string; collection: string; permissions: any; reason: string }
  | { kind: 'create'; policyName: string; collection: string; permissions: any; reason: string; policyId: string }

async function main() {
  // Pull all current permissions
  const allPerms = await api<any[]>('/permissions?fields=id,policy,collection,action,permissions,fields&limit=-1')

  const policies = await api<any[]>('/policies?fields=id,name,admin_access&limit=-1')
  const policyName = (id: string) => policies.find((p) => p.id === id)?.name || id

  const ops: Op[] = []

  // ── (1) Public policy: drop unsafe reads ──────────────────────────────────
  for (const p of allPerms) {
    if (p.policy !== POLICY.PUBLIC) continue
    if (p.action !== 'read') continue
    if (PUBLIC_DROP.includes(p.collection)) {
      ops.push({ kind: 'delete', id: p.id, policyName: 'Public', collection: p.collection, reason: 'no unauth flow needs this' })
    }
  }

  // ── (2) Client Manager: scope or add reads ────────────────────────────────
  const clientMgrReadByCol: Record<string, any> = {}
  for (const p of allPerms) {
    if (p.policy === POLICY.CLIENT_MANAGER && p.action === 'read') clientMgrReadByCol[p.collection] = p
  }
  for (const col of TENANT_COLLECTIONS) {
    const desired = scopeFor(col)
    const existing = clientMgrReadByCol[col]
    if (!existing) {
      ops.push({ kind: 'create', policyName: 'Client Manager', collection: col, permissions: desired, reason: 'add scoped read', policyId: POLICY.CLIENT_MANAGER })
    } else if (JSON.stringify(existing.permissions) !== JSON.stringify(desired)) {
      ops.push({ kind: 'update', id: existing.id, policyName: 'Client Manager', collection: col, permissions: desired, reason: 'scope existing read' })
    }
  }

  // ── (3) Client + Carddesk User: scope existing unscoped reads in place ────
  for (const polId of [POLICY.CLIENT, POLICY.CARDDESK_USER] as const) {
    const polLabel = policyName(polId)
    for (const p of allPerms) {
      if (p.policy !== polId) continue
      if (p.action !== 'read') continue
      // Only touch tenant collections — leave system/lookup tables alone.
      if (!TENANT_SET.has(p.collection)) continue
      const desired = scopeFor(p.collection)
      const cur = p.permissions
      // Treat empty filter ({} or null) as unscoped, even if it parses non-empty
      const isUnscoped = !cur || (typeof cur === 'object' && Object.keys(cur).length === 0)
      // Already-scoped user-filter (e.g. ai_chat_*) — leave alone if it
      // matches the desired user-scoped shape. Otherwise replace.
      if (isUnscoped) {
        ops.push({ kind: 'update', id: p.id, policyName: polLabel, collection: p.collection, permissions: desired, reason: 'scope unscoped read' })
      } else if (JSON.stringify(cur) !== JSON.stringify(desired)) {
        // Existing perm is filtered but doesn't match what we want. Only
        // touch if it's not org-scoped already. Leave already-org-scoped
        // perms alone (don't fight the existing intent).
        const json = JSON.stringify(cur)
        const refsOrg = /"organization"|"organizations"/.test(json)
        const refsCurUser = /\$CURRENT_USER/.test(json)
        if (refsOrg && refsCurUser) {
          // already correctly scoped — leave alone
        } else if (refsCurUser) {
          // user-scoped (e.g. ai_chat_sessions) — leave alone
        } else {
          // some other filter we don't recognize — log and skip (don't
          // overwrite arbitrary existing intent on prod)
          console.log(`SKIP unrecognized filter on ${polLabel}.${p.collection}:`, json)
        }
      }
    }
  }

  // ── Print plan ────────────────────────────────────────────────────────────
  console.log(`\nPlanned operations: ${ops.length} (apply=${APPLY})\n`)
  for (const o of ops) {
    if (o.kind === 'delete') console.log(`  DELETE perms#${o.id}  ${o.policyName.padEnd(18)} ${o.collection.padEnd(28)} (${o.reason})`)
    else if (o.kind === 'update') console.log(`  UPDATE perms#${o.id}  ${o.policyName.padEnd(18)} ${o.collection.padEnd(28)} → ${JSON.stringify(o.permissions)} (${o.reason})`)
    else                          console.log(`  CREATE              ${o.policyName.padEnd(18)} ${o.collection.padEnd(28)} → ${JSON.stringify(o.permissions)} (${o.reason})`)
  }

  if (!APPLY) {
    console.log('\nDry-run only. Re-run with --apply to mutate.')
    return
  }

  // ── Apply ─────────────────────────────────────────────────────────────────
  let applied = 0
  for (const o of ops) {
    try {
      if (o.kind === 'delete') {
        await api(`/permissions/${o.id}`, { method: 'DELETE' })
      } else if (o.kind === 'update') {
        await api(`/permissions/${o.id}`, { method: 'PATCH', body: JSON.stringify({ permissions: o.permissions }) })
      } else {
        await api('/permissions', { method: 'POST', body: JSON.stringify({
          policy: o.policyId,
          collection: o.collection,
          action: 'read',
          permissions: o.permissions,
          fields: ['*'],
        }) })
      }
      applied++
    } catch (err: any) {
      console.error(`FAIL on ${o.kind} ${o.policyName}.${o.collection}:`, err.message)
    }
  }
  console.log(`\nApplied ${applied}/${ops.length} operations.`)
}

main().catch((err) => { console.error('FATAL:', err); process.exit(1) })
