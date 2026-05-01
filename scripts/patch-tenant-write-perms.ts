#!/usr/bin/env npx tsx
/**
 * Close cross-tenant WRITE leaks on tenant-scoped collections.
 *
 * Same root-cause family as the 2026-04-30 messages/appointments fix: the
 * `Client` policy (attached to the Client Manager role via policy union)
 * holds unfiltered create/update/delete/share grants on most tenant
 * collections. The Carddesk User policy and the Client Manager policy
 * itself also have a few unfiltered-write rows.
 *
 * Strategy:
 *   1. DELETE all `share` rows on tenant collections — Directus sharing
 *      isn't used in this app, and unscoped share grants leak items.
 *   2. UPDATE every other unscoped write row in place: copy the SAME
 *      policy's existing read-scope filter onto the write row. If the
 *      same policy has no read row for that collection, fall back to
 *      `scopeFor()` (mirrors the patch-tenant-row-perms.ts default).
 *   3. AI-chat collections need an additional `validation: {user._eq:
 *      $CURRENT_USER}` (or session.user walk) so create-time enforcement
 *      catches direct field tampering — Directus 11 enforces direct-field
 *      validation on create even though it skips FK walks.
 *
 * Caveat (Directus 11 quirk): create-action `permissions` filters with FK
 * walks are NOT enforced at insert time — only direct-field comparisons
 * via `validation` are. The shapes we write here are still useful as
 * documentation + enforcement on update/delete; for full create-side
 * coverage, route writes through server endpoints (see
 * server/api/messages/index.post.ts as the canonical pattern).
 *
 * Usage:
 *   pnpm tsx scripts/patch-tenant-write-perms.ts            # dry-run
 *   pnpm tsx scripts/patch-tenant-write-perms.ts --apply    # mutate
 */
import 'dotenv/config'

const URL = process.env.DIRECTUS_URL || 'http://localhost:8055'
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || ''
if (!TOKEN) { console.error('DIRECTUS_SERVER_TOKEN required'); process.exit(1) }

const APPLY = process.argv.includes('--apply')

const POLICIES_IN_SCOPE = new Set([
  '012beff9-150c-49e9-a284-1a7e2757e0dd', // Client Manager
  '14b84634-157a-4ddb-bb2a-74e70f01798e', // Carddesk User
  'cdadd1fd-280e-4d4a-83e6-1b911889af46', // Client
])

const TENANT_COLLECTIONS = new Set([
  'organizations',
  'tickets', 'projects', 'tasks',
  'clients', 'leads', 'contacts', 'contact_connections', 'proposals',
  'invoices', 'invoice_items', 'payments_received', 'expenses',
  'mailing_lists', 'mailing_list_contacts', 'email_templates', 'email_campaigns',
  'comments', 'products', 'time_entries',
  'video_meetings', 'calendar_events',
  'channels', 'channel_messages', 'messages',
  'appointments', 'call_logs',
  'teams', 'team_goals',
  'org_roles', 'org_memberships',
  'ai_notes', 'ai_notices', 'ai_chat_sessions', 'ai_chat_messages',
  'ai_context_snapshots', 'ai_preferences',
])

// Same fallback shape as scripts/patch-tenant-row-perms.ts. Used when the
// same policy has no read row for the collection and we still need to
// scope the write row.
function scopeFor(collection: string): any {
  switch (collection) {
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
    case 'contact_connections':
      return { client: { organization: { _in: '$CURRENT_USER.organizations.organizations_id' } } }
    case 'comments':
      return { user: { organizations: { organizations_id: { _in: '$CURRENT_USER.organizations.organizations_id' } } } }
    case 'video_meetings':
      return { _or: [
        { host_user: { _eq: '$CURRENT_USER' } },
        { related_organization: { _in: '$CURRENT_USER.organizations.organizations_id' } },
      ] }
    case 'ai_chat_sessions':
    case 'ai_preferences':
      return { user: { _eq: '$CURRENT_USER' } }
    case 'ai_chat_messages':
      return { session: { user: { _eq: '$CURRENT_USER' } } }
    default:
      return { organization: { _in: '$CURRENT_USER.organizations.organizations_id' } }
  }
}

// Directus 11 doesn't enforce `permissions` filters on the create action,
// but it DOES enforce `validation` filters when they reference direct row
// fields (variables like `$CURRENT_USER.organizations.organizations_id`
// resolve correctly). For collections scoped via a direct field, we set
// validation in addition to permissions so insert-time tampering is
// rejected. FK-walk scopes (e.g. `client.organization` on contact_connections)
// can NOT be expressed in validation — Directus reads them as a "field is
// required" check and fails any input. Those still need server routes for
// full create-side coverage; the permissions filter remains as docs.
const VALIDATION_BY_COLLECTION: Record<string, any> = {
  // Direct `organization` FK
  tickets: { organization: { _in: '$CURRENT_USER.organizations.organizations_id' } },
  projects: { organization: { _in: '$CURRENT_USER.organizations.organizations_id' } },
  teams: { organization: { _in: '$CURRENT_USER.organizations.organizations_id' } },
  channels: { organization: { _in: '$CURRENT_USER.organizations.organizations_id' } },
  expenses: { organization: { _in: '$CURRENT_USER.organizations.organizations_id' } },
  // tasks uses `organization_id` (direct column, different name)
  tasks: { organization_id: { _in: '$CURRENT_USER.organizations.organizations_id' } },
  // User-scoped (direct `user` field)
  ai_chat_sessions: { user: { _eq: '$CURRENT_USER' } },
  ai_preferences: { user: { _eq: '$CURRENT_USER' } },
  // ai_chat_messages: scope is FK walk (session.user) — validation can't enforce.
  // contact_connections, team_goals, comments: same — FK walks. Permissions
  // filter is documentation only on create; update/delete ARE enforced.
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
  | { kind: 'delete'; id: number; label: string; reason: string }
  | { kind: 'update'; id: number; label: string; permissions: any; validation?: any; reason: string }

async function main() {
  const allPerms = await api<any[]>('/permissions?fields=id,policy,collection,action,permissions,validation&limit=-1')

  // Index existing read scopes by (policy, collection) so we can mirror
  // them to write rows.
  const readScopeByPC: Record<string, any> = {}
  for (const p of allPerms) {
    if (p.action !== 'read') continue
    if (!POLICIES_IN_SCOPE.has(p.policy)) continue
    readScopeByPC[`${p.policy}|${p.collection}`] = p.permissions
  }

  const ops: Op[] = []

  for (const p of allPerms) {
    if (!POLICIES_IN_SCOPE.has(p.policy)) continue
    if (!TENANT_COLLECTIONS.has(p.collection)) continue
    if (p.action === 'read') continue

    const isPermsUnscoped = !p.permissions || (typeof p.permissions === 'object' && Object.keys(p.permissions).length === 0)
    const desiredValidation = p.action === 'create' ? VALIDATION_BY_COLLECTION[p.collection] : undefined
    const currentValidation = p.validation ?? null
    const validationDiffers = desiredValidation !== undefined &&
      JSON.stringify(currentValidation) !== JSON.stringify(desiredValidation)

    // Share rows: Directus sharing isn't used. Drop unscoped ones entirely.
    if (p.action === 'share' && isPermsUnscoped) {
      ops.push({
        kind: 'delete', id: p.id,
        label: `${p.policy.slice(0, 8)}.${p.collection}.${p.action}`,
        reason: 'sharing unused in this app — drop entirely',
      })
      continue
    }

    if (!isPermsUnscoped && !validationDiffers) continue

    // Mirror the same policy's read scope. Fall back to scopeFor() if no
    // read row exists (which would itself be a separate audit finding).
    const desiredPerms = isPermsUnscoped
      ? (readScopeByPC[`${p.policy}|${p.collection}`] ?? scopeFor(p.collection))
      : p.permissions
    const reasons: string[] = []
    if (isPermsUnscoped) {
      reasons.push(readScopeByPC[`${p.policy}|${p.collection}`] !== undefined
        ? 'mirror read scope'
        : 'apply default tenant scope')
    }
    if (validationDiffers) reasons.push('set validation for create-time enforcement')
    ops.push({
      kind: 'update', id: p.id,
      label: `${p.policy.slice(0, 8)}.${p.collection}.${p.action}`,
      permissions: desiredPerms,
      validation: desiredValidation,
      reason: reasons.join(' + '),
    })
  }

  console.log(`\nPlanned operations: ${ops.length} (apply=${APPLY})\n`)
  for (const o of ops) {
    if (o.kind === 'delete') console.log(`  DELETE perms#${o.id}  ${o.label.padEnd(38)} (${o.reason})`)
    else                     console.log(`  UPDATE perms#${o.id}  ${o.label.padEnd(38)} → ${JSON.stringify(o.permissions)}${o.validation ? ` + validation=${JSON.stringify(o.validation)}` : ''} (${o.reason})`)
  }

  if (!APPLY) {
    console.log('\nDry-run only. Re-run with --apply to mutate.')
    return
  }

  let applied = 0
  for (const o of ops) {
    try {
      if (o.kind === 'delete') {
        await api(`/permissions/${o.id}`, { method: 'DELETE' })
      } else {
        const body: any = { permissions: o.permissions }
        if (o.validation !== undefined) body.validation = o.validation
        await api(`/permissions/${o.id}`, { method: 'PATCH', body: JSON.stringify(body) })
      }
      applied++
    } catch (err: any) {
      console.error(`FAIL on ${o.kind} ${o.label}:`, err.message)
    }
  }
  console.log(`\nApplied ${applied}/${ops.length} operations.`)
}

main().catch((err) => { console.error('FATAL:', err); process.exit(1) })
