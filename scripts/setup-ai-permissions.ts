#!/usr/bin/env npx tsx
/**
 * Directus AI Collections — Permissions Setup Script
 *
 * Automatically configures read/write permissions for the 4 AI collections
 * across all non-admin roles. Admin role has full access by default.
 *
 * Collections configured:
 *   - ai_preferences       (user-owned, CRUD own records)
 *   - ai_chat_sessions     (user-owned, CRUD own records)
 *   - ai_chat_messages     (user creates, reads own session's messages)
 *   - financial_goals      (admin/manager create+edit, all read)
 *
 * Usage:
 *   pnpm tsx scripts/setup-ai-permissions.ts
 *
 * Prerequisites:
 *   - Directus instance running with AI collections already created
 *     (run setup-ai-collections.ts first)
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
  } catch (err: any) {
    return { data: null, error: err.message }
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface PolicyInfo {
  id: string
  name: string
  admin_access: boolean
}

interface AccessEntry {
  id: string
  role: string | null
  policy: string | { id: string } | null
}

interface PermissionRule {
  collection: string
  action: 'create' | 'read' | 'update' | 'delete'
  permissions: Record<string, any> | null  // row-level filter (null = all)
  validation: Record<string, any> | null   // validation rules
  presets: Record<string, any> | null      // auto-fill on create
  fields: string[] | null                  // null = all fields, ['*'] = all
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Find the policy ID attached to a given role.
 * Directus 11+ uses access entries to link roles to policies.
 */
async function findPolicyForRole(roleId: string): Promise<string | null> {
  // Get all access entries for this role
  const { data: accessEntries } = await directusRequest<AccessEntry[]>(
    `/access?filter[role][_eq]=${roleId}&fields=id,role,policy.id,policy.name,policy.admin_access`
  )

  if (!accessEntries || accessEntries.length === 0) {
    // Fallback: try to find via policies directly
    const { data: policies } = await directusRequest<any[]>(
      `/policies?fields=id,name,admin_access,roles.role`
    )

    if (policies) {
      for (const policy of policies) {
        if (policy.admin_access) continue // skip admin policies
        const roles = policy.roles || []
        for (const r of roles) {
          const rid = typeof r.role === 'string' ? r.role : r.role?.id
          if (rid === roleId) return policy.id
        }
      }
    }

    return null
  }

  // Find a non-admin policy
  for (const entry of accessEntries) {
    const policy = entry.policy
    if (!policy) continue
    const policyId = typeof policy === 'string' ? policy : policy.id
    return policyId
  }

  return null
}

/**
 * Get all non-admin roles from Directus.
 */
async function getNonAdminRoles(): Promise<Array<{ id: string; name: string }>> {
  const { data: roles } = await directusRequest<any[]>(
    '/roles?fields=id,name&filter[id][_neq]=' + ADMIN_ROLE_ID
  )
  return roles || []
}

/**
 * Check if a permission already exists for a policy+collection+action.
 */
async function permissionExists(policyId: string, collection: string, action: string): Promise<boolean> {
  const { data: existing } = await directusRequest<any[]>(
    `/permissions?filter[policy][_eq]=${policyId}&filter[collection][_eq]=${collection}&filter[action][_eq]=${action}&limit=1`
  )
  return existing !== null && existing.length > 0
}

/**
 * Create a permission, skipping if it already exists.
 */
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

// Filter: only records where user = current user
const OWNER_FILTER = { user: { _eq: '$CURRENT_USER' } }
const CREATOR_FILTER = { user_created: { _eq: '$CURRENT_USER' } }
const SESSION_OWNER_FILTER = { session: { user: { _eq: '$CURRENT_USER' } } }

// Preset: auto-fill user field on create
const USER_PRESET = { user: '$CURRENT_USER' }

/**
 * Permissions for Client Manager role:
 * - Full CRUD on own AI preferences, chat sessions
 * - Create + read on chat messages (own sessions)
 * - Full CRUD on financial goals (shared resource for managers)
 */
function getClientManagerPermissions(): PermissionRule[] {
  return [
    // ── ai_preferences ──
    {
      collection: 'ai_preferences',
      action: 'create',
      permissions: null,
      validation: null,
      presets: USER_PRESET,
      fields: ['*'],
    },
    {
      collection: 'ai_preferences',
      action: 'read',
      permissions: OWNER_FILTER,
      validation: null,
      presets: null,
      fields: ['*'],
    },
    {
      collection: 'ai_preferences',
      action: 'update',
      permissions: OWNER_FILTER,
      validation: null,
      presets: null,
      fields: ['*'],
    },
    {
      collection: 'ai_preferences',
      action: 'delete',
      permissions: OWNER_FILTER,
      validation: null,
      presets: null,
      fields: ['*'],
    },

    // ── ai_chat_sessions ──
    {
      collection: 'ai_chat_sessions',
      action: 'create',
      permissions: null,
      validation: null,
      presets: USER_PRESET,
      fields: ['*'],
    },
    {
      collection: 'ai_chat_sessions',
      action: 'read',
      permissions: OWNER_FILTER,
      validation: null,
      presets: null,
      fields: ['*'],
    },
    {
      collection: 'ai_chat_sessions',
      action: 'update',
      permissions: OWNER_FILTER,
      validation: null,
      presets: null,
      fields: ['*'],
    },
    {
      collection: 'ai_chat_sessions',
      action: 'delete',
      permissions: OWNER_FILTER,
      validation: null,
      presets: null,
      fields: ['*'],
    },

    // ── ai_chat_messages ──
    {
      collection: 'ai_chat_messages',
      action: 'create',
      permissions: null,
      validation: null,
      presets: null,
      fields: ['*'],
    },
    {
      collection: 'ai_chat_messages',
      action: 'read',
      permissions: SESSION_OWNER_FILTER,
      validation: null,
      presets: null,
      fields: ['*'],
    },

    // ── financial_goals ──
    {
      collection: 'financial_goals',
      action: 'create',
      permissions: null,
      validation: null,
      presets: null,
      fields: ['*'],
    },
    {
      collection: 'financial_goals',
      action: 'read',
      permissions: null,   // all goals visible
      validation: null,
      presets: null,
      fields: ['*'],
    },
    {
      collection: 'financial_goals',
      action: 'update',
      permissions: CREATOR_FILTER,
      validation: null,
      presets: null,
      fields: ['*'],
    },
    {
      collection: 'financial_goals',
      action: 'delete',
      permissions: CREATOR_FILTER,
      validation: null,
      presets: null,
      fields: ['*'],
    },

    // ── team_goals ──
    {
      collection: 'team_goals',
      action: 'create',
      permissions: null,
      validation: null,
      presets: null,
      fields: ['*'],
    },
    {
      collection: 'team_goals',
      action: 'read',
      permissions: null,
      validation: null,
      presets: null,
      fields: ['*'],
    },
    {
      collection: 'team_goals',
      action: 'update',
      permissions: null,
      validation: null,
      presets: null,
      fields: ['*'],
    },
    {
      collection: 'team_goals',
      action: 'delete',
      permissions: null,
      validation: null,
      presets: null,
      fields: ['*'],
    },
  ]
}

/**
 * Permissions for regular User role:
 * - Full CRUD on own AI preferences, chat sessions
 * - Create + read on chat messages (own sessions)
 * - Read-only on financial goals
 */
function getUserPermissions(): PermissionRule[] {
  return [
    // ── ai_preferences ──
    {
      collection: 'ai_preferences',
      action: 'create',
      permissions: null,
      validation: null,
      presets: USER_PRESET,
      fields: ['*'],
    },
    {
      collection: 'ai_preferences',
      action: 'read',
      permissions: OWNER_FILTER,
      validation: null,
      presets: null,
      fields: ['*'],
    },
    {
      collection: 'ai_preferences',
      action: 'update',
      permissions: OWNER_FILTER,
      validation: null,
      presets: null,
      fields: ['*'],
    },
    {
      collection: 'ai_preferences',
      action: 'delete',
      permissions: OWNER_FILTER,
      validation: null,
      presets: null,
      fields: ['*'],
    },

    // ── ai_chat_sessions ──
    {
      collection: 'ai_chat_sessions',
      action: 'create',
      permissions: null,
      validation: null,
      presets: USER_PRESET,
      fields: ['*'],
    },
    {
      collection: 'ai_chat_sessions',
      action: 'read',
      permissions: OWNER_FILTER,
      validation: null,
      presets: null,
      fields: ['*'],
    },
    {
      collection: 'ai_chat_sessions',
      action: 'update',
      permissions: OWNER_FILTER,
      validation: null,
      presets: null,
      fields: ['*'],
    },
    {
      collection: 'ai_chat_sessions',
      action: 'delete',
      permissions: OWNER_FILTER,
      validation: null,
      presets: null,
      fields: ['*'],
    },

    // ── ai_chat_messages ──
    {
      collection: 'ai_chat_messages',
      action: 'create',
      permissions: null,
      validation: null,
      presets: null,
      fields: ['*'],
    },
    {
      collection: 'ai_chat_messages',
      action: 'read',
      permissions: SESSION_OWNER_FILTER,
      validation: null,
      presets: null,
      fields: ['*'],
    },

    // ── financial_goals (read-only) ──
    {
      collection: 'financial_goals',
      action: 'read',
      permissions: null,
      validation: null,
      presets: null,
      fields: ['*'],
    },

    // ── team_goals ──
    {
      collection: 'team_goals',
      action: 'create',
      permissions: null,
      validation: null,
      presets: null,
      fields: ['*'],
    },
    {
      collection: 'team_goals',
      action: 'read',
      permissions: null,
      validation: null,
      presets: null,
      fields: ['*'],
    },
    {
      collection: 'team_goals',
      action: 'update',
      permissions: null,
      validation: null,
      presets: null,
      fields: ['*'],
    },
    {
      collection: 'team_goals',
      action: 'delete',
      permissions: null,
      validation: null,
      presets: null,
      fields: ['*'],
    },
  ]
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=========================================')
  console.log('  AI Collections — Permissions Setup')
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

  for (const role of roles) {
    const isManager = role.id === CLIENT_MANAGER_ROLE_ID
    const label = isManager ? 'Client Manager' : 'User'

    console.log(`\n--- ${role.name} (${label}) ---`)

    // Find the policy for this role
    const policyId = await findPolicyForRole(role.id)

    if (!policyId) {
      // Create a new policy for this role
      console.log(`  No policy found. Creating one...`)
      const policyName = `${role.name} - AI Collections`

      const { data: newPolicy, error: policyError } = await directusRequest<{ id: string }>('/policies', 'POST', {
        name: policyName,
        icon: 'smart_toy',
        description: `Auto-generated permissions for AI command center collections (${role.name})`,
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

      // Apply permissions to the new policy
      const rules = isManager ? getClientManagerPermissions() : getUserPermissions()
      for (const rule of rules) {
        const success = await createPermission(newPolicy.id, rule)
        if (success) totalCreated++
        else totalFailed++
      }
    } else {
      console.log(`  Using policy: ${policyId}`)

      // Apply permissions to the existing policy
      const rules = isManager ? getClientManagerPermissions() : getUserPermissions()
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
    console.log('  ai_preferences      - Users can CRUD their own preferences')
    console.log('  ai_chat_sessions    - Users can CRUD their own chat sessions')
    console.log('  ai_chat_messages    - Users can create and read their own session messages')
    console.log('  financial_goals     - Managers can CRUD, regular users read-only')
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
