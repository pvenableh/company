#!/usr/bin/env npx tsx
/**
 * Fix Timeline & AI Chat — Directus Schema & Permissions
 *
 * This script:
 *   1. Removes the broken `messages` field from `ai_chat_sessions`
 *      (it's defined as a column but doesn't exist in the DB, causing SQL errors)
 *   2. Grants READ permission on `directus_activity` to all non-admin roles
 *      (required for the Command Center timeline to show past activity)
 *   3. Grants READ + CREATE permission on `directus_comments` to all non-admin roles
 *      (required for timeline card comments)
 *
 * Usage:
 *   pnpm tsx scripts/fix-timeline-permissions.ts
 *
 * Prerequisites:
 *   - DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN in .env
 */

import 'dotenv/config'

// ─── Configuration ────────────────────────────────────────────────────────────

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055'
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || ''

if (!DIRECTUS_TOKEN) {
  console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN environment variable is required')
  process.exit(1)
}

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

// ─── Step 1: Fix broken messages field on ai_chat_sessions ───────────────────

async function fixMessagesField() {
  console.log('\n── Step 1: Fix ai_chat_sessions.messages field ──')

  // Check if the field exists in Directus metadata
  const { data: field, error } = await directusRequest<any>(
    '/fields/ai_chat_sessions/messages'
  )

  if (error?.includes('403')) {
    console.log('  ⚠ Cannot read fields (insufficient permissions). Skipping.')
    return
  }

  if (!field) {
    console.log('  ✓ No "messages" field found on ai_chat_sessions — already clean.')
    return
  }

  console.log(`  Found "messages" field (type: ${field.type}, interface: ${field.meta?.interface || 'none'})`)

  // Check if it's an alias/O2M field (which is correct) vs a regular field (broken)
  if (field.type === 'alias' && field.meta?.special?.includes('o2m')) {
    console.log('  ✓ Field is a properly configured O2M alias — no fix needed.')
    return
  }

  // Delete the broken field from Directus metadata
  console.log('  ✗ Field is misconfigured. Deleting from Directus schema...')
  const { error: deleteError } = await directusRequest(
    '/fields/ai_chat_sessions/messages',
    'DELETE'
  )

  if (deleteError) {
    console.error(`  ✗ Failed to delete field: ${deleteError}`)
    console.log('  → Manual fix: In Directus Admin, go to Settings > Data Model > ai_chat_sessions')
    console.log('    and delete the "messages" field, then optionally recreate it as an O2M alias.')
    return
  }

  console.log('  ✓ Deleted broken "messages" field.')

  // Recreate as a proper O2M alias
  console.log('  Recreating as O2M alias (ai_chat_messages.session → ai_chat_sessions)...')
  const { error: createError } = await directusRequest(
    '/fields/ai_chat_sessions',
    'POST',
    {
      field: 'messages',
      type: 'alias',
      meta: {
        special: ['o2m'],
        interface: 'list-o2m',
        options: {
          template: '{{content}}',
        },
        display: 'related-values',
        display_options: {
          template: '{{role}}: {{content}}',
        },
        hidden: false,
        readonly: true,
      },
      schema: null, // alias fields have no physical column
    }
  )

  if (createError) {
    console.error(`  ⚠ Could not recreate O2M alias: ${createError}`)
    console.log('  → The field was deleted (chat will work). You can manually add the O2M relation in Directus Admin if desired.')
  } else {
    console.log('  ✓ Recreated "messages" as a proper O2M alias field.')
  }
}

// ─── Step 2 & 3: Grant permissions on directus_activity and directus_comments ─

async function grantTimelinePermissions() {
  console.log('\n── Step 2: Grant timeline permissions ──')

  // Get all policies
  const { data: policies, error: policiesError } = await directusRequest<PolicyInfo[]>(
    '/policies?fields=id,name,admin_access&limit=-1'
  )

  if (policiesError || !policies) {
    console.error(`  ✗ Failed to fetch policies: ${policiesError}`)
    return
  }

  // Filter to non-admin policies
  const nonAdminPolicies = policies.filter(p => !p.admin_access)
  console.log(`  Found ${policies.length} policies (${nonAdminPolicies.length} non-admin)`)

  if (nonAdminPolicies.length === 0) {
    console.log('  ⚠ No non-admin policies found. Only admin users exist — they already have full access.')
    return
  }

  // Get existing permissions to avoid duplicates
  const { data: existingPerms } = await directusRequest<any[]>(
    '/permissions?fields=id,policy,collection,action&limit=-1'
  )
  const existingSet = new Set(
    (existingPerms || []).map(p => {
      const policyId = typeof p.policy === 'object' ? p.policy?.id : p.policy
      return `${policyId}:${p.collection}:${p.action}`
    })
  )

  // Define permissions to create
  const permissionsToCreate = []

  for (const policy of nonAdminPolicies) {
    // directus_activity: READ
    const activityKey = `${policy.id}:directus_activity:read`
    if (!existingSet.has(activityKey)) {
      permissionsToCreate.push({
        policy: policy.id,
        collection: 'directus_activity',
        action: 'read',
        fields: ['id', 'action', 'timestamp', 'collection', 'item', 'user'],
        permissions: {}, // all records
        validation: {},
      })
    }

    // directus_comments: READ
    const commentsReadKey = `${policy.id}:directus_comments:read`
    if (!existingSet.has(commentsReadKey)) {
      permissionsToCreate.push({
        policy: policy.id,
        collection: 'directus_comments',
        action: 'read',
        fields: ['*'],
        permissions: {},
        validation: {},
      })
    }

    // directus_comments: CREATE
    const commentsCreateKey = `${policy.id}:directus_comments:create`
    if (!existingSet.has(commentsCreateKey)) {
      permissionsToCreate.push({
        policy: policy.id,
        collection: 'directus_comments',
        action: 'create',
        fields: ['*'],
        permissions: {},
        validation: {},
      })
    }
  }

  if (permissionsToCreate.length === 0) {
    console.log('  ✓ All permissions already exist — nothing to create.')
    return
  }

  console.log(`  Creating ${permissionsToCreate.length} permission entries...`)

  let created = 0
  let failed = 0
  for (const perm of permissionsToCreate) {
    const policy = nonAdminPolicies.find(p => p.id === perm.policy)
    const label = `${policy?.name || perm.policy}: ${perm.action} ${perm.collection}`

    const { error } = await directusRequest('/permissions', 'POST', perm)
    if (error) {
      console.error(`  ✗ ${label} — ${error}`)
      failed++
    } else {
      console.log(`  ✓ ${label}`)
      created++
    }
  }

  console.log(`\n  Done: ${created} created, ${failed} failed`)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('  Fix Timeline Permissions & AI Chat Schema')
  console.log(`  Target: ${DIRECTUS_URL}`)
  console.log('═══════════════════════════════════════════════════════════════')

  await fixMessagesField()
  await grantTimelinePermissions()

  console.log('\n✅ Done! Restart your app or hard-refresh to verify.')
  console.log('   - AI Chat should create sessions without SQL errors')
  console.log('   - Timeline should show historical activity across all collections')
}

main().catch((err) => {
  console.error('Script failed:', err)
  process.exit(1)
})
