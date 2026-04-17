#!/usr/bin/env npx tsx
/**
 * Directus lead_stage_list_rules — Permissions Setup Script
 *
 * Grants app roles access to the marketing-automation rules collection that
 * powers the /leads/automations UI.
 *
 * Permission model:
 *   - Admin:          Full access (admin_access bypass — no explicit rules)
 *   - Client Manager: Full CRUD on rules
 *   - Regular User:   Read-only (so stage changes can fire applyStageRules)
 *   - Public:         No access
 *
 * Usage:
 *   pnpm tsx scripts/setup-lead-automation-permissions.ts
 *
 * Prerequisites:
 *   - Directus instance running with lead_stage_list_rules collection created
 *   - DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN env var set
 */

import 'dotenv/config'

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055'
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || ''

if (!DIRECTUS_TOKEN) {
  console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN environment variable is required')
  process.exit(1)
}

const ADMIN_ROLE_ID = '3a63a4e1-c82e-46f8-9993-7f11ac6a4b01'
const CLIENT_MANAGER_ROLE_ID = '7b62b285-e3a8-46ff-9e8c-d1445a3c13bb'

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

async function findPolicyForRole(roleId: string): Promise<string | null> {
  const { data: accessEntries } = await directusRequest<AccessEntry[]>(
    `/access?filter[role][_eq]=${roleId}&fields=id,role,policy.id,policy.name,policy.admin_access`
  )

  if (!accessEntries || accessEntries.length === 0) {
    const { data: policies } = await directusRequest<Record<string, unknown>[]>(
      `/policies?fields=id,name,admin_access,roles.role`
    )

    if (policies) {
      for (const policy of policies) {
        if (policy.admin_access) continue
        const roles = (policy.roles as Array<{ role: string | { id: string } }>) || []
        for (const r of roles) {
          const rid = typeof r.role === 'string' ? r.role : r.role?.id
          if (rid === roleId) return policy.id as string
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

const COLLECTION = 'lead_stage_list_rules'

function getManagerPermissions(): PermissionRule[] {
  return (['create', 'read', 'update', 'delete'] as const).map((action) => ({
    collection: COLLECTION,
    action,
    permissions: null,
    validation: null,
    presets: null,
    fields: ['*'],
  }))
}

function getUserPermissions(): PermissionRule[] {
  return [
    { collection: COLLECTION, action: 'read', permissions: null, validation: null, presets: null, fields: ['*'] },
  ]
}

async function main() {
  console.log('=========================================')
  console.log('  Lead Automation — Permissions Setup')
  console.log('=========================================')
  console.log(`Target: ${DIRECTUS_URL}\n`)

  const { error } = await directusRequest('/server/info')
  if (error) {
    console.error(`Cannot connect to Directus: ${error}`)
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

    const policyId = await findPolicyForRole(role.id)

    if (!policyId) {
      console.log(`  No policy found. Creating one...`)
      const policyName = `${role.name} - Lead Automations`

      const { data: newPolicy, error: policyError } = await directusRequest<{ id: string }>('/policies', 'POST', {
        name: policyName,
        icon: 'bolt',
        description: `Auto-generated permissions for lead automation rules (${role.name})`,
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
    console.log('  lead_stage_list_rules  - Manager: full CRUD, User: read-only')
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
