#!/usr/bin/env npx tsx
/**
 * Directus Time-Entries × Social Posts Bridge (Phase 4 of retainer/social plan)
 *
 * Adds `time_entries.source_social_post` (M2O → social_posts) so a running or
 * manual entry can be tagged with the specific post the user is working on.
 * This is what feeds the per-post "hours spent" rollup on the Studio surface
 * and lets the retainer pool see post work in context.
 *
 * Run:
 *   pnpm tsx scripts/setup-time-entries-source-post.ts
 *
 * After running, regenerate types:
 *   pnpm generate:types
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
  method: 'GET' | 'POST' | 'PATCH' = 'GET',
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
      const err = text ? JSON.parse(text) : {}
      return { data: null, error: err.errors?.[0]?.message || `HTTP ${response.status}` }
    }

    const json = text ? JSON.parse(text) : {}
    return { data: json.data ?? null, error: null }
  } catch (err: any) {
    return { data: null, error: err.message }
  }
}

async function fieldExists(collection: string, field: string): Promise<boolean> {
  const { error } = await directusRequest(`/fields/${collection}/${field}`)
  return !error
}

async function createField(collection: string, field: string, config: any): Promise<void> {
  const exists = await fieldExists(collection, field)
  if (exists) {
    console.log(`  ✓ ${collection}.${field} already exists`)
    return
  }

  const { error } = await directusRequest(`/fields/${collection}`, 'POST', {
    field,
    ...config,
  })

  if (error) {
    console.error(`  ✗ ${collection}.${field} failed: ${error}`)
  } else {
    console.log(`  + ${collection}.${field} created`)
  }
}

async function relationExists(collection: string, field: string): Promise<boolean> {
  const { data, error } = await directusRequest<any>(`/relations/${collection}/${field}`)
  return !error && !!data
}

async function createRelation(config: {
  collection: string
  field: string
  related_collection: string
  meta?: Record<string, unknown>
  schema?: Record<string, unknown>
}): Promise<void> {
  const has = await relationExists(config.collection, config.field)
  if (has) {
    console.log(`  ✓ relation ${config.collection}.${config.field} → ${config.related_collection} already exists`)
    return
  }

  const { error } = await directusRequest('/relations', 'POST', {
    collection: config.collection,
    field: config.field,
    related_collection: config.related_collection,
    meta: config.meta ?? {},
    schema: config.schema ?? {},
  })

  if (error) {
    console.error(`  ✗ relation ${config.collection}.${config.field} failed: ${error}`)
  } else {
    console.log(`  + relation ${config.collection}.${config.field} → ${config.related_collection} created`)
  }
}

async function main() {
  console.log('\n── Time-Entries × Social Posts Setup (Phase 4) ──\n')
  console.log(`Directus: ${DIRECTUS_URL}\n`)

  console.log('time_entries collection:')

  await createField('time_entries', 'source_social_post', {
    type: 'uuid',
    meta: {
      interface: 'select-dropdown-m2o',
      special: ['m2o'],
      display: 'related-values',
      display_options: { template: '{{caption}}' },
      note: 'Social post this time was spent on. Joins the post into the retainer hour pool.',
      group: null,
      width: 'half',
      options: { template: '{{caption}}' },
    },
    schema: { is_nullable: true, foreign_key_table: 'social_posts' },
  })
  await createRelation({
    collection: 'time_entries',
    field: 'source_social_post',
    related_collection: 'social_posts',
    meta: { sort_field: null },
    schema: { on_delete: 'SET NULL' },
  })

  console.log('\n── Done ──\n')
  console.log('Next: regenerate types — pnpm generate:types')
}

main().catch((err) => {
  console.error('Setup failed:', err)
  process.exit(1)
})
