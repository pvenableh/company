#!/usr/bin/env npx tsx
/**
 * Diagnose and fix AI Notes field type mismatches.
 * Checks what types the PK and FK fields actually are, then fixes mismatches.
 *
 *   pnpm tsx scripts/fix-ai-notes-fields.ts
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
    if (!response.ok) return { data: null, error: `${response.status}: ${text}` }
    const json = text ? JSON.parse(text) : {}
    return { data: json.data ?? null, error: null }
  } catch (err: any) {
    return { data: null, error: err.message }
  }
}

async function getField(collection: string, field: string) {
  const { data, error } = await directusRequest(`/fields/${collection}/${field}`)
  if (error) {
    console.log(`  [${collection}.${field}] Error fetching: ${error}`)
    return null
  }
  return data as any
}

async function main() {
  console.log('Diagnosing field types...\n')

  // Check PK types
  const collections = ['ai_notes', 'ai_tags', 'ai_chat_sessions', 'ai_notes_ai_tags']
  for (const col of collections) {
    const field = await getField(col, 'id')
    if (field) {
      console.log(`  ${col}.id -> type: ${field.type}, schema.data_type: ${field.schema?.data_type}, is_primary_key: ${field.schema?.is_primary_key}`)
    }
  }

  // Check FK types
  const fkFields = [
    ['ai_notes', 'source_session'],
    ['ai_notes', 'organization'],
    ['ai_notes', 'user'],
    ['ai_notes_ai_tags', 'ai_notes_id'],
    ['ai_notes_ai_tags', 'ai_tags_id'],
    ['ai_tags', 'organization'],
  ]
  console.log('')
  for (const [col, fld] of fkFields) {
    const field = await getField(col, fld)
    if (field) {
      console.log(`  ${col}.${fld} -> type: ${field.type}, schema.data_type: ${field.schema?.data_type}`)
    }
  }

  // Check what type ai_chat_sessions.id actually is
  console.log('\n--- Analysis ---')
  const sessionsId = await getField('ai_chat_sessions', 'id')
  const notesId = await getField('ai_notes', 'id')
  const tagsId = await getField('ai_tags', 'id')

  const sessionsPkType = sessionsId?.schema?.data_type || sessionsId?.type
  const notesPkType = notesId?.schema?.data_type || notesId?.type
  const tagsPkType = tagsId?.schema?.data_type || tagsId?.type

  console.log(`  ai_chat_sessions PK type: ${sessionsPkType}`)
  console.log(`  ai_notes PK type: ${notesPkType}`)
  console.log(`  ai_tags PK type: ${tagsPkType}`)

  // Check FK field types that need to match
  const sourceSession = await getField('ai_notes', 'source_session')
  const junctionNotesId = await getField('ai_notes_ai_tags', 'ai_notes_id')
  const junctionTagsId = await getField('ai_notes_ai_tags', 'ai_tags_id')

  const sourceFkType = sourceSession?.schema?.data_type || sourceSession?.type
  const jnNotesType = junctionNotesId?.schema?.data_type || junctionNotesId?.type
  const jnTagsType = junctionTagsId?.schema?.data_type || junctionTagsId?.type

  console.log(`\n  source_session FK type: ${sourceFkType} (needs to match ai_chat_sessions PK: ${sessionsPkType})`)
  console.log(`  junction ai_notes_id FK type: ${jnNotesType} (needs to match ai_notes PK: ${notesPkType})`)
  console.log(`  junction ai_tags_id FK type: ${jnTagsType} (needs to match ai_tags PK: ${tagsPkType})`)

  // Determine fixes needed
  const fixes: Array<{ collection: string; field: string; currentType: string; neededType: string }> = []

  if (sourceFkType !== sessionsPkType) {
    fixes.push({ collection: 'ai_notes', field: 'source_session', currentType: sourceFkType, neededType: sessionsPkType })
  }
  if (jnNotesType !== notesPkType) {
    fixes.push({ collection: 'ai_notes_ai_tags', field: 'ai_notes_id', currentType: jnNotesType, neededType: notesPkType })
  }
  if (jnTagsType !== tagsPkType) {
    fixes.push({ collection: 'ai_notes_ai_tags', field: 'ai_tags_id', currentType: jnTagsType, neededType: tagsPkType })
  }

  if (fixes.length === 0) {
    console.log('\n✅ All FK types match their referenced PKs. The issue may be something else.')
    return
  }

  console.log(`\n⚠ Found ${fixes.length} type mismatch(es). Fixing...`)

  for (const fix of fixes) {
    console.log(`\n  Fixing ${fix.collection}.${fix.field}: ${fix.currentType} -> ${fix.neededType}`)

    // Delete the field and recreate with correct type
    console.log(`    Deleting field...`)
    const { error: delError } = await directusRequest(`/fields/${fix.collection}/${fix.field}`, 'DELETE')
    if (delError) {
      console.log(`    Delete error: ${delError}`)
      continue
    }

    console.log(`    Recreating with type: ${fix.neededType}`)
    const fieldDef: any = {
      field: fix.field,
      type: fix.neededType === 'uuid' ? 'uuid' : 'integer',
      meta: { interface: 'select-dropdown-m2o', special: ['m2o'], hidden: true },
      schema: {},
    }

    const { error: createError } = await directusRequest(`/fields/${fix.collection}`, 'POST', fieldDef)
    if (createError) {
      console.log(`    Create error: ${createError}`)
    } else {
      console.log(`    ✓ Fixed`)
    }
  }

  // Now retry creating relations
  console.log('\n--- Retrying relations ---')

  if (fixes.some(f => f.field === 'source_session')) {
    const { error } = await directusRequest('/relations', 'POST', {
      collection: 'ai_notes',
      field: 'source_session',
      related_collection: 'ai_chat_sessions',
      meta: { sort_field: null },
    })
    console.log(`  ai_notes.source_session -> ai_chat_sessions: ${error || '✓ Created'}`)
  }

  if (fixes.some(f => f.field === 'ai_notes_id')) {
    const { error } = await directusRequest('/relations', 'POST', {
      collection: 'ai_notes_ai_tags',
      field: 'ai_notes_id',
      related_collection: 'ai_notes',
      meta: { one_field: 'tags', sort_field: 'sort', one_deselect_action: 'delete' },
    })
    console.log(`  ai_notes_ai_tags.ai_notes_id -> ai_notes: ${error || '✓ Created'}`)
  }

  if (fixes.some(f => f.field === 'ai_tags_id')) {
    const { error } = await directusRequest('/relations', 'POST', {
      collection: 'ai_notes_ai_tags',
      field: 'ai_tags_id',
      related_collection: 'ai_tags',
      meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
    })
    console.log(`  ai_notes_ai_tags.ai_tags_id -> ai_tags: ${error || '✓ Created'}`)
  }

  console.log('\n✅ Done! Run `pnpm generate:types` to update TypeScript types.')
}

main().catch(console.error)
