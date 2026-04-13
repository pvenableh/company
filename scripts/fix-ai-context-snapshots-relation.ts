#!/usr/bin/env npx tsx
/**
 * Fix ai_context_snapshots.organization FK type mismatch.
 * Diagnoses the actual PK type of organizations, fixes the FK field, and creates the relation.
 *
 *   pnpm tsx scripts/fix-ai-context-snapshots-relation.ts
 */

import 'dotenv/config'

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055'
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || ''

if (!DIRECTUS_TOKEN) {
  console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN required')
  process.exit(1)
}

async function directusRequest<T = unknown>(path: string, method = 'GET' as string, body?: unknown): Promise<{ data: T | null; error: string | null }> {
  try {
    const response = await fetch(`${DIRECTUS_URL}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DIRECTUS_TOKEN}` },
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
  // Check organizations PK type
  const { data: orgIdField } = await directusRequest('/fields/organizations/id')
  const orgPkType = (orgIdField as any)?.schema?.data_type || (orgIdField as any)?.type
  console.log(`organizations.id type: ${orgPkType}`)

  // Check current FK type
  const { data: fkField } = await directusRequest('/fields/ai_context_snapshots/organization')
  const fkType = (fkField as any)?.schema?.data_type || (fkField as any)?.type
  console.log(`ai_context_snapshots.organization type: ${fkType}`)

  if (fkType === orgPkType) {
    console.log('\nTypes match — retrying relation creation...')
  } else {
    console.log(`\nType mismatch: ${fkType} vs ${orgPkType}. Fixing...`)

    // Delete and recreate with correct type
    console.log('  Deleting field...')
    const { error: delErr } = await directusRequest('/fields/ai_context_snapshots/organization', 'DELETE')
    if (delErr) { console.error(`  Delete error: ${delErr}`); return }

    console.log(`  Recreating with type: ${orgPkType}`)
    const { error: createErr } = await directusRequest('/fields/ai_context_snapshots', 'POST', {
      field: 'organization',
      type: orgPkType === 'uuid' ? 'uuid' : 'integer',
      meta: { interface: 'select-dropdown-m2o', special: ['m2o'], required: true, hidden: true },
      schema: {},
    })
    if (createErr) { console.error(`  Create error: ${createErr}`); return }
    console.log('  Fixed')
  }

  // Create relation
  console.log('\nCreating relation...')
  const { error } = await directusRequest('/relations', 'POST', {
    collection: 'ai_context_snapshots',
    field: 'organization',
    related_collection: 'organizations',
    meta: { sort_field: null },
  })
  console.log(error ? `  Error: ${error}` : '  ✓ Created')

  console.log('\nDone!')
}

main().catch(console.error)
