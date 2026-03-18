#!/usr/bin/env npx tsx
/**
 * Directus Client Access Control — Permissions Setup Script
 *
 * Configures read/write permissions for the `clients_teams` and
 * `clients_directus_users` junction collections across all non-admin roles.
 * Admin role has full access by default.
 *
 * Permission model:
 *   - Admin:            Full access by default (no explicit permissions needed)
 *   - Client Manager:   Full CRUD on both junction collections
 *   - Regular User:     Read-only on both junction collections
 *
 * Usage:
 *   pnpm tsx scripts/setup-client-access-permissions.ts
 *
 * Prerequisites:
 *   - Directus instance running with junction collections already created
 *     (run setup-client-access.ts first)
 *   - Admin static token with permissions write access
 */

import 'dotenv/config'

// ─── Configuration ────────────────────────────────────────────────────────────

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055'
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || ''

if (!DIRECTUS_TOKEN) {
  console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN environment variable is required')
  process.exit(1)
}

// Known role IDs from useRole.ts
const ADMIN_ROLE_ID = '3a63a4e1-c82e-46f8-9993-7f11ac6a4b01'
const CLIENT_MANAGER_ROLE_ID = '7b62b285-e3a8-46ff-9e8c-d1445a3c13bb'

// ─── API Helper ───────────────────────────────────────────────────────────────

async function directusRequest<T = unknown>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
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
      return { data: null, error: `${response.status}: ${text}` }
    }

    const json = text ? JSON.parse(text) : {}
    return { data: (json.data ?? null) as T, error: null }
  } catch (err: unknown) {
    return { data: null, error: String(err) }
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface AccessEntry {
  id: string
  role: string | null
  policy: string | { id: string } | null
}

interface PermissionRule {
  collection: string
  action: 'create' | 'read' | 'update' | 'delete'
  permissions: Record<string, unknown> | null
  validation: Record<string, unknown> | null
  presets: Record<string, unknown> | null
  fields: string[] | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Find a dedicated policy for a role, avoiding shared policies.
 * For Client Manager, we look for a policy named "Client Manager" specifically,
 * since Client Manager and Client roles must NOT share a policy.
 */
async function findDedicatedPolicyForRole(roleId: string, roleName: string): Promise<string | null> {
  const { data: accessEntries } = await directusRequest<Array<AccessEntry & { policy: { id: string; name: string } }>>(
    `/access?filter[role][_eq]=${roleId}&fields=id,role,policy.id,policy.name,policy.admin_access`
  )

  if (!accessEntries || accessEntries.length === 0) return null

  // For Client Manager, only use a policy that is specifically named for it
  // to avoid sharing with the Client role
  if (roleId === CLIENT_MANAGER_ROLE_ID) {
    for (const entry of accessEntries) {
      const policy = entry.policy
      if (!policy) continue
      const policyId = typeof policy === 'string' ? policy : policy.id
      const policyName = typeof policy === 'string' ? '' : policy.name
      if (policyName.toLowerCase().includes('client manager')) return policyId
    }
    return null // Don't reuse a shared policy
  }

  // For other roles, return the first non-admin policy
  for (const entry of accessEntries) {
    const policy = entry.policy
    if (!policy) continue
    return typeof policy === 'string' ? policy : policy.id
  }

  return null
}

async function getNonAdminRoles(): Promise<Array<{ id: string; name: string }>> {
  const { data: roles } = await directusRequest<Array<{ id: string; name: string }>>(
    '/roles?fields=id,name&filter[id][_neq]=' + ADMIN_ROLE_ID
  )
  return roles || []
}

async function permissionExists(policyId: string, collection: string, action: string): Promise<boolean> {
  const { data: existing } = await directusRequest<unknown[]>(
    `/permissions?filter[policy][_eq]=${policyId}&filter[collection][_eq]=${collection}&filter[action][_eq]=${action}&limit=1`
  )
  return existing !== null && existing.length > 0
}

async function createPermission(policyId: string, rule: PermissionRule): Promise<'created' | 'skipped' | 'failed'> {
  const exists = await permissionExists(policyId, rule.collection, rule.action)
  if (exists) {
    console.log(`    [skip] ${rule.collection}.${rule.action} already exists`)
    return 'skipped'
  }

  const { error } = await directusRequest('/permissions', 'POST', {
    policy: policyId,
    collection: rule.collection,
    action: rule.action,
    permissions: rule.permissions,
    validation: rule.validation,
    presets: rule.presets,
    fields: rule.fields,
  })

  if (error) {
    console.error(`    [fail] ${rule.collection}.${rule.action}: ${error}`)
    return 'failed'
  }

  console.log(`    [ok]   ${rule.collection}.${rule.action}`)
  return 'created'
}

// ─── Permission Definitions ───────────────────────────────────────────────────

const COLLECTIONS = ['clients_teams', 'clients_directus_users'] as const

/**
 * Client Manager: Full CRUD on both junction collections
 * Managers need to assign/unassign clients to teams and users
 */
function getManagerPermissions(): PermissionRule[] {
  return COLLECTIONS.flatMap((collection) => [
    { collection, action: 'create' as const, permissions: null, validation: null, presets: null, fields: ['*'] },
    { collection, action: 'read' as const, permissions: null, validation: null, presets: null, fields: ['*'] },
    { collection, action: 'update' as const, permissions: null, validation: null, presets: null, fields: ['*'] },
    { collection, action: 'delete' as const, permissions: null, validation: null, presets: null, fields: ['*'] },
  ])
}

/**
 * Regular User: Read-only on both junction collections
 * Users can see which clients they have access to, but cannot modify assignments
 */
function getUserPermissions(): PermissionRule[] {
  return COLLECTIONS.flatMap((collection) => [
    { collection, action: 'read' as const, permissions: null, validation: null, presets: null, fields: ['*'] },
  ])
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=========================================')
  console.log('  Client Access — Permissions Setup')
  console.log('=========================================')
  console.log(`Target: ${DIRECTUS_URL}\n`)

  // Verify connection (ping returns plain text "pong")
  try {
    const pingRes = await fetch(`${DIRECTUS_URL}/server/ping`, {
      headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
    })
    const pingText = await pingRes.text()
    if (!pingRes.ok || !pingText.includes('pong')) {
      console.error(`Cannot reach Directus at ${DIRECTUS_URL}: ${pingText}`)
      process.exit(1)
    }
  } catch (err: unknown) {
    console.error(`Cannot reach Directus at ${DIRECTUS_URL}: ${String(err)}`)
    process.exit(1)
  }
  console.log('Connected to Directus\n')

  const roles = await getNonAdminRoles()
  console.log(`Found ${roles.length} non-admin role(s):`)
  for (const role of roles) {
    console.log(`  - ${role.name} (${role.id})`)
  }
  console.log('')

  let totalCreated = 0
  let totalSkipped = 0
  let totalFailed = 0

  for (const role of roles) {
    const isManager = role.id === CLIENT_MANAGER_ROLE_ID
    const label = isManager ? 'Client Manager' : 'User'

    console.log(`\n--- ${role.name} (${label}) ---`)

    const policyId = await findDedicatedPolicyForRole(role.id, role.name)

    if (!policyId) {
      console.log(`  No policy found. Creating one...`)
      const policyName = isManager ? 'Client Manager - Client Access' : `${role.name} - Client Access`

      const { data: newPolicy, error: policyError } = await directusRequest<{ id: string }>('/policies', 'POST', {
        name: policyName,
        icon: 'lock_open',
        description: `Auto-generated permissions for client access junction collections (${role.name})`,
        admin_access: false,
        app_access: true,
      })

      if (policyError || !newPolicy) {
        console.error(`  Failed to create policy: ${policyError}`)
        continue
      }

      const { error: accessError } = await directusRequest('/access', 'POST', {
        role: role.id,
        policy: newPolicy.id,
      })

      if (accessError) {
        console.error(`  Failed to link policy to role: ${accessError}`)
        continue
      }

      console.log(`  Created policy: ${policyName} (${newPolicy.id})`)

      const rules = isManager ? getManagerPermissions() : getUserPermissions()
      for (const rule of rules) {
        const result = await createPermission(newPolicy.id, rule)
        if (result === 'created') totalCreated++
        else if (result === 'skipped') totalSkipped++
        else totalFailed++
      }
    } else {
      console.log(`  Using policy: ${policyId}`)

      const rules = isManager ? getManagerPermissions() : getUserPermissions()
      for (const rule of rules) {
        const result = await createPermission(policyId, rule)
        if (result === 'created') totalCreated++
        else if (result === 'skipped') totalSkipped++
        else totalFailed++
      }
    }
  }

  console.log('\n=========================================')
  console.log('  Summary')
  console.log('=========================================')
  console.log(`  Created:  ${totalCreated} permissions`)
  console.log(`  Skipped:  ${totalSkipped} (already exist)`)
  if (totalFailed > 0) {
    console.log(`  Failed:   ${totalFailed}`)
  }
  console.log('')

  if (totalFailed === 0) {
    console.log('Permissions setup complete!')
    console.log('')
    console.log('What was configured:')
    console.log('  clients_teams          - Manager: full CRUD, User: read-only')
    console.log('  clients_directus_users - Manager: full CRUD, User: read-only')
    console.log('')
    console.log('Admin role has full access by default (no explicit permissions needed).')
  } else {
    console.log('Some permissions failed. Check errors above.')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Setup failed:', err)
  process.exit(1)
})
