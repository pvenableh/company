#!/usr/bin/env npx tsx
/**
 * Grant regular org members (the `Client` policy) scoped read + update on
 * `leads` — limited to leads they created OR are assigned to, within their
 * own orgs. Managers (`Client Manager`) keep their org-wide leads access,
 * which this script does not touch.
 *
 * Why: base members previously had NO read on `leads` at all, so any
 * member-side query (e.g. the command-center AI "smart prompts" pipeline
 * lookup) 403'd. Product decision: members should see/manage only their own
 * and assigned leads for follow-up — not the whole org pipeline.
 *
 * Model (row filter, applied to BOTH read and update):
 *   org-scoped  AND  (created-by-me OR assigned-to-me)
 *
 * Idempotent: upserts the two perm rows to the exact desired filter. Safe to
 * re-run. Dry-run by default.
 *
 * Usage:
 *   pnpm tsx scripts/setup-client-leads-access.ts            # dry-run (default)
 *   pnpm tsx scripts/setup-client-leads-access.ts --apply    # actually mutate
 *
 * Pair with scripts/audit-tenant-row-perms.ts to verify before & after.
 */
import 'dotenv/config'

const URL = process.env.DIRECTUS_URL || 'http://localhost:8055'
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || ''
if (!TOKEN) { console.error('DIRECTUS_SERVER_TOKEN required'); process.exit(1) }

const APPLY = process.argv.includes('--apply')

// Regular org-member policy (non-admin). See scripts/patch-tenant-row-perms.ts.
const CLIENT_POLICY = 'cdadd1fd-280e-4d4a-83e6-1b911889af46'
const COLLECTION = 'leads'

// org-scoped AND (created-by-me OR assigned-to-me).
const LEADS_FILTER = {
  _and: [
    { organization: { _in: '$CURRENT_USER.organizations.organizations_id' } },
    {
      _or: [
        { user_created: { _eq: '$CURRENT_USER' } },
        { assigned_to: { _eq: '$CURRENT_USER' } },
      ],
    },
  ],
} as const

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

async function main() {
  const perms = await api<any[]>(
    `/permissions?fields=id,policy,collection,action,permissions,fields&filter[policy][_eq]=${CLIENT_POLICY}&filter[collection][_eq]=${COLLECTION}&limit=-1`,
  )

  const desired = JSON.stringify(LEADS_FILTER)
  const ops: Array<{ kind: 'create' | 'update' | 'noop'; action: 'read' | 'update'; id?: number }> = []

  for (const action of ['read', 'update'] as const) {
    const existing = perms.find((p) => p.action === action)
    if (!existing) {
      ops.push({ kind: 'create', action })
    } else if (JSON.stringify(existing.permissions) !== desired) {
      ops.push({ kind: 'update', action, id: existing.id })
    } else {
      ops.push({ kind: 'noop', action, id: existing.id })
    }
  }

  console.log(`\nClient policy → leads access (apply=${APPLY})\n`)
  for (const o of ops) {
    if (o.kind === 'noop') console.log(`  NOOP    ${o.action.padEnd(6)} perms#${o.id} already matches desired filter`)
    else if (o.kind === 'update') console.log(`  UPDATE  ${o.action.padEnd(6)} perms#${o.id} → ${desired}`)
    else console.log(`  CREATE  ${o.action.padEnd(6)} → ${desired}`)
  }

  if (!APPLY) {
    console.log('\nDry-run only. Re-run with --apply to mutate.')
    return
  }

  let applied = 0
  for (const o of ops) {
    if (o.kind === 'noop') continue
    try {
      if (o.kind === 'update') {
        await api(`/permissions/${o.id}`, { method: 'PATCH', body: JSON.stringify({ permissions: LEADS_FILTER }) })
      } else {
        await api('/permissions', {
          method: 'POST',
          body: JSON.stringify({
            policy: CLIENT_POLICY,
            collection: COLLECTION,
            action: o.action,
            permissions: LEADS_FILTER,
            fields: ['*'],
          }),
        })
      }
      applied++
    } catch (err: any) {
      console.error(`FAIL on ${o.kind} ${o.action}:`, err.message)
    }
  }
  console.log(`\nApplied ${applied} operation(s).`)
}

main().catch((err) => { console.error('FATAL:', err); process.exit(1) })
