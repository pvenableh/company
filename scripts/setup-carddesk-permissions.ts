#!/usr/bin/env npx tsx
/**
 * Directus CardDesk Collections — Permissions Setup Script
 *
 * Configures read/write permissions for the 3 CardDesk collections
 * so that users can CRUD their own records. Admin role has full access by default.
 *
 * Collections configured:
 *   - cd_contacts   (user-owned, full CRUD on own records)
 *   - cd_activities  (user-owned, full CRUD on own records)
 *   - cd_xp_state   (user-owned, full CRUD on own records)
 *
 * Usage:
 *   pnpm tsx scripts/setup-carddesk-permissions.ts
 *
 * Prerequisites:
 *   - Directus instance running with cd_* collections already created
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

// Known role IDs
const ADMIN_ROLE_ID = '3a63a4e1-c82e-46f8-9993-7f11ac6a4b01'

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
  } catch (err: any) {
    return { data: null, error: err.message }
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
  permissions: Record<string, any> | null
  validation: Record<string, any> | null
  presets: Record<string, any> | null
  fields: string[] | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function findPolicyForRole(roleId: string): Promise<string | null> {
  const { data: accessEntries } = await directusRequest<AccessEntry[]>(
    `/access?filter[role][_eq]=${roleId}&fields=id,role,policy.id,policy.name,policy.admin_access`
  )

  if (!accessEntries || accessEntries.length === 0) {
    const { data: policies } = await directusRequest<any[]>(
      `/policies?fields=id,name,admin_access,roles.role`
    )

    if (policies) {
      for (const policy of policies) {
        if (policy.admin_access) continue
        const roles = policy.roles || []
        for (const r of roles) {
          const rid = typeof r.role === 'string' ? r.role : r.role?.id
          if (rid === roleId) return policy.id
        }
      }
    }

    return null
  }

  for (const entry of accessEntries) {
    const policy = entry.policy
    if (!policy) continue
    return typeof policy === 'string' ? policy : policy.id
  }

  return null
}

async function getNonAdminRoles(): Promise<Array<{ id: string; name: string }>> {
  const { data: roles } = await directusRequest<any[]>(
    '/roles?fields=id,name&filter[id][_neq]=' + ADMIN_ROLE_ID
  )
  return roles || []
}

async function permissionExists(policyId: string, collection: string, action: string): Promise<boolean> {
  const { data: existing } = await directusRequest<any[]>(
    `/permissions?filter[policy][_eq]=${policyId}&filter[collection][_eq]=${collection}&filter[action][_eq]=${action}&limit=1`
  )
  return existing !== null && existing.length > 0
}

async function createPermission(policyId: string, rule: PermissionRule): Promise<boolean> {
  const exists = await permissionExists(policyId, rule.collection, rule.action)
  if (exists) {
    console.log(`    [skip] ${rule.collection}.${rule.action} already exists`)
    return true
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
    return false
  }

  console.log(`    [ok]   ${rule.collection}.${rule.action}`)
  return true
}

// ─── Permission Definitions ───────────────────────────────────────────────────

// All cd_* collections use user_created as the ownership field
const CREATOR_FILTER = { user_created: { _eq: '$CURRENT_USER' } }

/**
 * Full CRUD on own records for a given collection.
 * - create: anyone can create (Directus auto-fills user_created)
 * - read/update/delete: only own records (user_created = current user)
 */
function ownRecordsCRUD(collection: string): PermissionRule[] {
  return [
    {
      collection,
      action: 'create',
      permissions: null,
      validation: null,
      presets: null,
      fields: ['*'],
    },
    {
      collection,
      action: 'read',
      permissions: CREATOR_FILTER,
      validation: null,
      presets: null,
      fields: ['*'],
    },
    {
      collection,
      action: 'update',
      permissions: CREATOR_FILTER,
      validation: null,
      presets: null,
      fields: ['*'],
    },
    {
      collection,
      action: 'delete',
      permissions: CREATOR_FILTER,
      validation: null,
      presets: null,
      fields: ['*'],
    },
  ]
}

function getCardDeskPermissions(): PermissionRule[] {
  return [
    ...ownRecordsCRUD('cd_contacts'),
    ...ownRecordsCRUD('cd_activities'),
    ...ownRecordsCRUD('cd_xp_state'),
  ]
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=========================================')
  console.log('  CardDesk Collections — Permissions Setup')
  console.log('=========================================')
  console.log(`Target: ${DIRECTUS_URL}\n`)

  // Verify connection
  const { error } = await directusRequest('/server/info')
  if (error) {
    console.error(`Cannot connect to Directus: ${error}`)
    process.exit(1)
  }
  console.log('Connected to Directus\n')

  // Discover all non-admin roles
  const roles = await getNonAdminRoles()
  console.log(`Found ${roles.length} non-admin role(s):`)
  for (const role of roles) {
    console.log(`  - ${role.name} (${role.id})`)
  }
  console.log('')

  let totalCreated = 0
  let totalSkipped = 0
  let totalFailed = 0

  const rules = getCardDeskPermissions()

  for (const role of roles) {
    console.log(`\n--- ${role.name} ---`)

    // Find the policy for this role
    let policyId = await findPolicyForRole(role.id)

    if (!policyId) {
      // Create a new policy for this role
      console.log(`  No policy found. Creating one...`)
      const policyName = `${role.name} - CardDesk`

      const { data: newPolicy, error: policyError } = await directusRequest<{ id: string }>('/policies', 'POST', {
        name: policyName,
        icon: 'contacts',
        description: `Auto-generated permissions for CardDesk collections (${role.name})`,
        admin_access: false,
        app_access: true,
      })

      if (policyError || !newPolicy) {
        console.error(`  Failed to create policy: ${policyError}`)
        continue
      }

      // Link policy to role via access
      const { error: accessError } = await directusRequest('/access', 'POST', {
        role: role.id,
        policy: newPolicy.id,
      })

      if (accessError) {
        console.error(`  Failed to link policy to role: ${accessError}`)
        continue
      }

      console.log(`  Created policy: ${policyName} (${newPolicy.id})`)
      policyId = newPolicy.id
    } else {
      console.log(`  Using existing policy: ${policyId}`)
    }

    // Apply permissions
    for (const rule of rules) {
      const exists = await permissionExists(policyId, rule.collection, rule.action)
      if (exists) {
        console.log(`    [skip] ${rule.collection}.${rule.action} already exists`)
        totalSkipped++
      } else {
        const success = await createPermission(policyId, rule)
        if (success) totalCreated++
        else totalFailed++
      }
    }
  }

  // Summary
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
    console.log('  cd_contacts    - Users can CRUD their own contacts')
    console.log('  cd_activities  - Users can CRUD their own activities')
    console.log('  cd_xp_state    - Users can CRUD their own XP/progress data')
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
