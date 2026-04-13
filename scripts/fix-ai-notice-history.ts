#!/usr/bin/env npx tsx
/**
 * Fix ai_notice_history.organization FK type mismatch.
 * organizations.id is a UUID but the field was created as integer.
 * Deletes and recreates the field with the correct type, then creates the relation.
 *
 *   pnpm tsx scripts/fix-ai-notice-history.ts
 */

import 'dotenv/config'

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055'
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || ''

if (!DIRECTUS_TOKEN) {
  console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN environment variable is required')
  process.exit(1)
}

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
      if (response.status === 409) return { data: null, error: 'already_exists' }
      return { data: null, error: `${response.status}: ${text}` }
    }
    const json = text ? JSON.parse(text) : {}
    return { data: json.data ?? null, error: null }
  } catch (err: any) {
    return { data: null, error: err.message }
  }
}

async function main() {
  console.log('Fixing ai_notice_history.organization FK type...\n')

  // 1. Check organizations.id type
  const { data: orgIdField } = await directusRequest('/fields/organizations/id')
  const orgPkType = (orgIdField as any)?.schema?.data_type || (orgIdField as any)?.type
  console.log(`  organizations.id type: ${orgPkType}`)

  // 2. Check current ai_notice_history.organization type
  const { data: orgFkField } = await directusRequest('/fields/ai_notice_history/organization')
  const currentFkType = (orgFkField as any)?.schema?.data_type || (orgFkField as any)?.type
  console.log(`  ai_notice_history.organization type: ${currentFkType}`)

  if (currentFkType === orgPkType) {
    console.log('\n  Types already match! Trying to create relation...')
  } else {
    console.log(`\n  Mismatch: ${currentFkType} vs ${orgPkType}. Fixing...`)

    // Delete the field
    console.log('  Deleting field...')
    const { error: delError } = await directusRequest('/fields/ai_notice_history/organization', 'DELETE')
    if (delError) {
      console.error(`  Delete failed: ${delError}`)
      return
    }

    // Recreate with correct type
    const fieldType = orgPkType === 'uuid' ? 'uuid' : 'integer'
    console.log(`  Recreating with type: ${fieldType}`)
    const { error: createError } = await directusRequest('/fields/ai_notice_history', 'POST', {
      field: 'organization',
      type: fieldType,
      meta: { interface: 'select-dropdown-m2o', special: ['m2o'], required: true, hidden: true },
      schema: {},
    })
    if (createError) {
      console.error(`  Create failed: ${createError}`)
      return
    }
    console.log('  Field recreated ✓')
  }

  // 3. Create the relation
  console.log('  Creating relation...')
  const { error: relError } = await directusRequest('/relations', 'POST', {
    collection: 'ai_notice_history',
    field: 'organization',
    related_collection: 'organizations',
    meta: { sort_field: null },
  })
  if (relError === 'already_exists' || relError?.includes('already exists')) {
    console.log('  Relation already exists ✓')
  } else if (relError) {
    console.error(`  Relation failed: ${relError}`)
  } else {
    console.log('  Relation created ✓')
  }

  console.log('\n✅ Done!')
}

main().catch(console.error)
