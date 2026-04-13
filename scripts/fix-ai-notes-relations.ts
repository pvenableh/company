#!/usr/bin/env npx tsx
/**
 * Fix AI Notes relations — creates Directus-level relations without
 * database FK constraints (virtual relations).
 *
 * Run after setup-ai-notes-collections.ts if FK creation failed.
 *
 *   pnpm tsx scripts/fix-ai-notes-relations.ts
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

async function createRelation(relation: Record<string, any>) {
  const label = `${relation.collection}.${relation.field} -> ${relation.related_collection}`
  console.log(`  Creating relation: ${label}`)
  const { error } = await directusRequest('/relations', 'POST', relation)
  if (error === 'already_exists' || error?.includes('already exists')) {
    console.log(`    -> Already exists, skipping`)
    return true
  }
  if (error) {
    console.error(`    -> Error: ${error}`)
    return false
  }
  console.log(`    -> Created`)
  return true
}

async function main() {
  console.log('Fixing AI Notes & Tags relations (virtual, no DB FK constraints)...\n')

  // ai_notes.source_session -> ai_chat_sessions (virtual — no schema/FK)
  await createRelation({
    collection: 'ai_notes',
    field: 'source_session',
    related_collection: 'ai_chat_sessions',
    meta: { sort_field: null },
  })

  // Junction: ai_notes_ai_tags.ai_notes_id -> ai_notes (with O2M back-reference on ai_notes.tags)
  await createRelation({
    collection: 'ai_notes_ai_tags',
    field: 'ai_notes_id',
    related_collection: 'ai_notes',
    meta: {
      one_field: 'tags',
      sort_field: 'sort',
      one_deselect_action: 'delete',
    },
  })

  // Junction: ai_notes_ai_tags.ai_tags_id -> ai_tags
  await createRelation({
    collection: 'ai_notes_ai_tags',
    field: 'ai_tags_id',
    related_collection: 'ai_tags',
    meta: {
      one_field: null,
      sort_field: null,
      one_deselect_action: 'nullify',
    },
  })

  console.log('\n✅ Relations fixed!')
  console.log('Run `pnpm generate:types` to update TypeScript types.')
}

main().catch(console.error)
