#!/usr/bin/env npx tsx
/**
 * Close cross-tenant leaks on `messages`, `appointments`, `call_logs`.
 *
 * Background: the Client Manager *role* attaches both the `Client Manager`
 * policy AND the `Client` policy. The Client policy historically had blanket
 * read+create+update+delete+share grants (`permissions: null`) on `messages`
 * and `appointments`, which nullify the tighter Client Manager perms via
 * policy union. The Public policy also had blanket reads on `messages`,
 * `appointments`, `call_logs`, exposing those collections to fully
 * unauthenticated requests.
 *
 * What it does (in order):
 *   1. Public: DELETE blanket reads on messages/appointments/call_logs.
 *      None of these back any unauth flow (the /invoices/[id] payment page
 *      only touches invoices/clients/products/payments_received/organizations).
 *   2. Client: DELETE every unscoped read+create+update+delete+share row on
 *      messages and appointments. These will be re-added on Client Manager
 *      with proper scope.
 *   3. Client Manager: UPSERT scoped read/create/update/delete perms for
 *      messages and appointments. Keeps the chat + scheduler features
 *      working for legitimate same-org users.
 *
 * Idempotent: re-runs are safe. DELETE skips already-missing rows; UPSERT
 * compares existing perm shape and only PATCHes when different.
 *
 * Usage:
 *   pnpm tsx scripts/patch-messages-appointments-perms.ts            # dry-run
 *   pnpm tsx scripts/patch-messages-appointments-perms.ts --apply    # mutate
 */
import 'dotenv/config'

const URL = process.env.DIRECTUS_URL || 'http://localhost:8055'
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || ''
if (!TOKEN) { console.error('DIRECTUS_SERVER_TOKEN required'); process.exit(1) }

const APPLY = process.argv.includes('--apply')

const POLICY = {
  CLIENT_MANAGER: '012beff9-150c-49e9-a284-1a7e2757e0dd',
  PUBLIC:         'abf8a154-5b1c-4a46-ac9c-7300570f4f17',
  CLIENT:         'cdadd1fd-280e-4d4a-83e6-1b911889af46',
} as const

const ORGS_IN = '$CURRENT_USER.organizations.organizations_id'

// Same-org filter walks for messages (via channel FK) and appointments
// (via _or over user_created / related_lead.org / video_meeting.org —
// matches the call_logs perm shape).
const MESSAGES_SCOPE = { channel: { organization: { _in: ORGS_IN } } }
const APPOINTMENTS_SCOPE = {
  _or: [
    { user_created: { _eq: '$CURRENT_USER' } },
    { related_lead: { organization: { _in: ORGS_IN } } },
    { video_meeting: { related_organization: { _in: ORGS_IN } } },
  ],
}

// On create the `user_created._eq: $CURRENT_USER` branch would always match
// (auto-set at insert), letting a user submit a row whose related_lead /
// video_meeting points at another tenant's row. Drop the user branch and
// require either an org-scoped FK or both FKs null (ad-hoc appointment).
const APPOINTMENTS_CREATE_SCOPE = {
  _or: [
    { related_lead: { organization: { _in: ORGS_IN } } },
    { video_meeting: { related_organization: { _in: ORGS_IN } } },
    { _and: [
      { related_lead: { _null: true } },
      { video_meeting: { _null: true } },
    ] },
  ],
}

// Reverse-M2M self-scope used on `organizations` itself.
const ORGS_SELF_SCOPE = { users: { directus_users_id: { _eq: '$CURRENT_USER' } } }

// Per-action desired perms on Client Manager.
//
// Note on `create`: Directus 11 does NOT enforce FK-walked filters on the
// `create` action — only direct field comparisons via `validation`. Both
// `messages` and `appointments` need FK walks (channel.organization,
// related_lead.organization, video_meeting.related_organization) which
// can't be expressed there. So the user-token create paths route through
// `server/api/messages/index.post.ts` and `server/api/appointments/index.post.ts`
// (admin-token, validates org membership in code), and we revoke the
// direct-create perm here. Direct POST /items/messages or POST
// /items/appointments via the user session will 403.
const DESIRED: Record<string, Record<string, any>> = {
  messages: {
    read: MESSAGES_SCOPE,
    update: MESSAGES_SCOPE,
    // Delete: only your own messages, AND in your org's channels (defense
    // in depth — channel scope still applies even if user_created is somehow
    // wrong on legacy rows).
    delete: { _and: [{ user_created: { _eq: '$CURRENT_USER' } }, MESSAGES_SCOPE] },
  },
  appointments: {
    read: APPOINTMENTS_SCOPE,
    update: APPOINTMENTS_SCOPE,
    delete: APPOINTMENTS_SCOPE,
  },
  // Client policy currently has unfiltered update+create on organizations.
  // Org create runs through `server/api/org/create.post.ts` (admin token),
  // so no Client Manager create perm needed. Update is exercised directly
  // by the org settings page — scope it to memberships.
  organizations: {
    update: ORGS_SELF_SCOPE,
  },
}

// Public reads to delete unconditionally.
const PUBLIC_DROP_READ = ['messages', 'appointments', 'call_logs']

// Client Manager policy: drop perms now superseded by server routes.
// `messages.create` and `appointments.create` are owned by
// `server/api/messages/index.post.ts` and `server/api/appointments/index.post.ts`
// (admin-token, validates org membership in code). Direct user-session
// creates must be denied at the perm layer.
const CLIENT_MANAGER_DROP_TARGETS: Array<{ collection: string; actions: string[] }> = [
  { collection: 'messages',     actions: ['create'] },
  { collection: 'appointments', actions: ['create'] },
]

// Client policy: drop all unscoped grants on these collections + actions.
const CLIENT_DROP_TARGETS: Array<{ collection: string; actions: string[] }> = [
  { collection: 'messages',     actions: ['read', 'create', 'update', 'delete', 'share'] },
  { collection: 'appointments', actions: ['read', 'create', 'update', 'delete', 'share'] },
  // Unfiltered org create (server route handles real creation with admin
  // token) and unfiltered org update — both let any authenticated user
  // mutate ANY organization row.
  { collection: 'organizations', actions: ['create', 'update'] },
]

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
  | { kind: 'create'; policyId: string; label: string; collection: string; action: string; permissions: any; reason: string }
  | { kind: 'update'; id: number; label: string; permissions: any; reason: string }

async function main() {
  const allPerms = await api<any[]>('/permissions?fields=id,policy,collection,action,permissions&limit=-1')

  const ops: Op[] = []

  // ── (1) Public reads to drop ──────────────────────────────────────────────
  for (const p of allPerms) {
    if (p.policy !== POLICY.PUBLIC) continue
    if (p.action !== 'read') continue
    if (!PUBLIC_DROP_READ.includes(p.collection)) continue
    ops.push({
      kind: 'delete', id: p.id,
      label: `Public.${p.collection}.read`,
      reason: 'no unauth flow needs this',
    })
  }

  // ── (2) Client unscoped grants to drop ────────────────────────────────────
  for (const tgt of CLIENT_DROP_TARGETS) {
    for (const action of tgt.actions) {
      const existing = allPerms.find(
        (p) => p.policy === POLICY.CLIENT && p.collection === tgt.collection && p.action === action,
      )
      if (!existing) continue
      ops.push({
        kind: 'delete', id: existing.id,
        label: `Client.${tgt.collection}.${action}`,
        reason: 'unscoped grant — replaced by Client Manager scoped perm',
      })
    }
  }

  // ── (2b) Client Manager perms superseded by server routes ─────────────────
  for (const tgt of CLIENT_MANAGER_DROP_TARGETS) {
    for (const action of tgt.actions) {
      const existing = allPerms.find(
        (p) => p.policy === POLICY.CLIENT_MANAGER && p.collection === tgt.collection && p.action === action,
      )
      if (!existing) continue
      ops.push({
        kind: 'delete', id: existing.id,
        label: `Client Manager.${tgt.collection}.${action}`,
        reason: 'superseded by server route',
      })
    }
  }

  // ── (3) Client Manager scoped perms (upsert) ──────────────────────────────
  for (const collection of Object.keys(DESIRED)) {
    for (const action of Object.keys(DESIRED[collection])) {
      const desired = DESIRED[collection][action]
      const existing = allPerms.find(
        (p) => p.policy === POLICY.CLIENT_MANAGER && p.collection === collection && p.action === action,
      )
      if (!existing) {
        ops.push({
          kind: 'create', policyId: POLICY.CLIENT_MANAGER,
          label: `Client Manager.${collection}.${action}`,
          collection, action, permissions: desired,
          reason: 'add scoped perm',
        })
      } else if (JSON.stringify(existing.permissions) !== JSON.stringify(desired)) {
        ops.push({
          kind: 'update', id: existing.id,
          label: `Client Manager.${collection}.${action}`,
          permissions: desired,
          reason: 'rewrite to scoped shape',
        })
      }
    }
  }

  // ── Print plan ────────────────────────────────────────────────────────────
  console.log(`\nPlanned operations: ${ops.length} (apply=${APPLY})\n`)
  for (const o of ops) {
    if (o.kind === 'delete')      console.log(`  DELETE perms#${o.id}  ${o.label.padEnd(38)} (${o.reason})`)
    else if (o.kind === 'update') console.log(`  UPDATE perms#${o.id}  ${o.label.padEnd(38)} → ${JSON.stringify(o.permissions)} (${o.reason})`)
    else                          console.log(`  CREATE              ${o.label.padEnd(38)} → ${JSON.stringify(o.permissions)} (${o.reason})`)
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
      } else if (o.kind === 'update') {
        await api(`/permissions/${o.id}`, { method: 'PATCH', body: JSON.stringify({ permissions: o.permissions }) })
      } else {
        await api('/permissions', { method: 'POST', body: JSON.stringify({
          policy: o.policyId,
          collection: o.collection,
          action: o.action,
          permissions: o.permissions,
          fields: ['*'],
        }) })
      }
      applied++
    } catch (err: any) {
      console.error(`FAIL on ${o.kind} ${o.label}:`, err.message)
    }
  }
  console.log(`\nApplied ${applied}/${ops.length} operations.`)
}

main().catch((err) => { console.error('FATAL:', err); process.exit(1) })
