#!/usr/bin/env npx tsx
/**
 * Directus Social Content Fields Setup Script (Phase 3 of retainer/social plan)
 *
 * Decouples `social_posts` from `social_accounts` and binds them to retainer
 * projects so they become first-class work-items in the hour pool. Also adds
 * the approval workflow used by the Studio surface (this session) and the
 * portal review surface (Phase 5).
 *
 * Adds fields to `social_posts`:
 *   - project          (M2O projects, nullable)
 *   - target_client    (M2O clients, nullable — distinct from existing `client`
 *                       which historically defaulted from the connected account)
 *   - approval_state   (enum: draft | in_review | requested_changes | approved
 *                            | rejected | scheduled | published)
 *   - approval_token   (string — opaque token used by Phase 5 portal review
 *                       to authorize approve/request-changes without login)
 *   - approved_by      (M2O directus_users)
 *   - approved_at      (timestamp)
 *   - design_image_url (string — cover art / mockup CDN URL)
 *   - figma_frame_url  (string — link back to the source design frame)
 *   - target_month     (date — first-of-month anchor for retainer grouping)
 *
 * `social_posts.platforms[].account_id` was already optional in zod (the
 * server route only requires it when status='scheduled'); the column itself
 * is a JSON blob so no schema change is needed there. CMS-side validation
 * stays in the route.
 *
 * Run:
 *   pnpm tsx scripts/setup-social-content-fields.ts
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
  })

  if (error) {
    console.error(`  ✗ relation ${config.collection}.${config.field} failed: ${error}`)
  } else {
    console.log(`  + relation ${config.collection}.${config.field} → ${config.related_collection} created`)
  }
}

async function main() {
  console.log('\n── Social Content Fields Setup (Phase 3) ──\n')
  console.log(`Directus: ${DIRECTUS_URL}\n`)

  console.log('social_posts collection:')

  await createField('social_posts', 'project', {
    type: 'uuid',
    meta: {
      interface: 'select-dropdown-m2o',
      special: ['m2o'],
      display: 'related-values',
      display_options: { template: '{{name}}' },
      note: 'Retainer (or fixed-fee) project this post is work for. Joins the hour pool.',
      group: null,
      width: 'half',
      options: { template: '{{name}}' },
    },
    schema: { is_nullable: true, foreign_key_table: 'projects' },
  })
  await createRelation({
    collection: 'social_posts',
    field: 'project',
    related_collection: 'projects',
    meta: { sort_field: null },
  })

  await createField('social_posts', 'target_client', {
    type: 'uuid',
    meta: {
      interface: 'select-dropdown-m2o',
      special: ['m2o'],
      display: 'related-values',
      display_options: { template: '{{name}}' },
      note: 'Client this post is for. Set independently of any connected account.',
      group: null,
      width: 'half',
      options: { template: '{{name}}' },
    },
    schema: { is_nullable: true, foreign_key_table: 'clients' },
  })
  await createRelation({
    collection: 'social_posts',
    field: 'target_client',
    related_collection: 'clients',
    meta: { sort_field: null },
  })

  await createField('social_posts', 'approval_state', {
    type: 'string',
    meta: {
      interface: 'select-dropdown',
      display: 'labels',
      note: 'Studio review workflow. Independent of publish status until approved.',
      group: null,
      width: 'half',
      options: {
        choices: [
          { text: 'Draft', value: 'draft' },
          { text: 'In Review', value: 'in_review' },
          { text: 'Changes Requested', value: 'requested_changes' },
          { text: 'Approved', value: 'approved' },
          { text: 'Rejected', value: 'rejected' },
          { text: 'Scheduled', value: 'scheduled' },
          { text: 'Published', value: 'published' },
        ],
      },
    },
    schema: { max_length: 30, is_nullable: false, default_value: 'draft' },
  })

  await createField('social_posts', 'approval_token', {
    type: 'string',
    meta: {
      interface: 'input',
      special: ['no-data'],
      readonly: true,
      hidden: true,
      note: 'Opaque token used by the Phase 5 portal review surface. Server-managed.',
      group: null,
      width: 'half',
    },
    schema: { max_length: 64, is_nullable: true, default_value: null },
  })

  await createField('social_posts', 'approved_by', {
    type: 'uuid',
    meta: {
      interface: 'select-dropdown-m2o',
      special: ['m2o'],
      display: 'related-values',
      display_options: { template: '{{first_name}} {{last_name}}' },
      note: 'User who approved (or on whose behalf approval was recorded).',
      group: null,
      width: 'half',
      readonly: true,
      options: { template: '{{first_name}} {{last_name}}' },
    },
    schema: { is_nullable: true, foreign_key_table: 'directus_users' },
  })
  await createRelation({
    collection: 'social_posts',
    field: 'approved_by',
    related_collection: 'directus_users',
    meta: { sort_field: null },
  })

  await createField('social_posts', 'approved_at', {
    type: 'timestamp',
    meta: {
      interface: 'datetime',
      display: 'datetime',
      readonly: true,
      note: 'When approval landed.',
      group: null,
      width: 'half',
    },
    schema: { is_nullable: true, default_value: null },
  })

  await createField('social_posts', 'design_image_url', {
    type: 'string',
    meta: {
      interface: 'input',
      note: 'CDN URL for the cover art / mockup shown in Studio before media is finalized.',
      group: null,
      width: 'full',
    },
    schema: { max_length: 500, is_nullable: true, default_value: null },
  })

  await createField('social_posts', 'figma_frame_url', {
    type: 'string',
    meta: {
      interface: 'input',
      note: 'Link to the source Figma frame for design review.',
      group: null,
      width: 'full',
    },
    schema: { max_length: 500, is_nullable: true, default_value: null },
  })

  await createField('social_posts', 'target_month', {
    type: 'date',
    meta: {
      interface: 'datetime',
      display: 'datetime',
      note: 'First-of-month anchor used to group posts under a retainer period.',
      group: null,
      width: 'half',
    },
    schema: { is_nullable: true, default_value: null },
  })

  console.log('\n── Done ──\n')
  console.log('Next: regenerate types — pnpm generate:types')
}

main().catch((err) => {
  console.error('Setup failed:', err)
  process.exit(1)
})
