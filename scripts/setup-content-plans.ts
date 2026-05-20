#!/usr/bin/env npx tsx
/**
 * Directus Content Plans Setup Script
 *
 * Creates `content_plans` — the first-class "content deliverable" used by the
 * Studio surface to bundle a strategy + a batch of social_posts for client
 * review. Designed to cover the monthly retainer cadence today AND future
 * grouping/relationship concepts (campaign/launch tied to a project_event,
 * templates, multi-month plans) without a schema rewrite.
 *
 * Adds collection:
 *   content_plans
 *     - title (string)
 *     - organization (M2O organizations, required) ← tenant scope
 *     - project (M2O projects, nullable)        ← anchors billing/retainer context when present
 *     - target_client (M2O clients)             ← portal scoping (denormalized)
 *     - plan_type (enum: monthly_cadence | campaign | launch | custom)
 *     - target_month (date)                     ← first-of-month for monthly cadence
 *     - project_event (M2O project_events)      ← for campaign/launch plans (Phase B)
 *     - strategy (text — rich)
 *     - objective (string)
 *     - themes (json array)
 *     - cover_image_url (string)
 *     - state (enum: draft | in_review | approved | archived)
 *     - approval_token (string, hidden, server-managed)
 *     - approved_by (M2O directus_users, readonly)
 *     - approved_at (timestamp, readonly)
 *
 * Adds FKs (additive — no data migration required):
 *   social_posts.content_plan (M2O content_plans, nullable)
 *   time_entries.source_content_plan (M2O content_plans, nullable)
 *
 * Run:
 *   pnpm tsx scripts/setup-content-plans.ts
 *
 * After running:
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
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  body?: unknown,
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
      let message = `HTTP ${response.status}`
      try {
        const err = text ? JSON.parse(text) : {}
        message = err.errors?.[0]?.message || err.message || message
      } catch {
        if (text) message = text
      }
      return { data: null, error: message }
    }

    const json = text ? JSON.parse(text) : {}
    return { data: (json.data ?? null) as T, error: null }
  } catch (err: any) {
    return { data: null, error: err?.message ?? String(err) }
  }
}

async function collectionExists(collection: string): Promise<boolean> {
  const { data } = await directusRequest(`/collections/${collection}`)
  return data !== null
}

async function fieldExists(collection: string, field: string): Promise<boolean> {
  const { error } = await directusRequest(`/fields/${collection}/${field}`)
  return !error
}

async function relationExists(collection: string, field: string): Promise<boolean> {
  const { data, error } = await directusRequest<any>(`/relations/${collection}/${field}`)
  return !error && !!data
}

async function createField(collection: string, field: string, config: any): Promise<void> {
  if (await fieldExists(collection, field)) {
    console.log(`  ✓ ${collection}.${field} already exists`)
    return
  }
  const { error } = await directusRequest(`/fields/${collection}`, 'POST', { field, ...config })
  if (error) console.error(`  ✗ ${collection}.${field} failed: ${error}`)
  else console.log(`  + ${collection}.${field} created`)
}

async function createRelation(config: {
  collection: string
  field: string
  related_collection: string
  meta?: Record<string, unknown>
}): Promise<void> {
  if (await relationExists(config.collection, config.field)) {
    console.log(`  ✓ relation ${config.collection}.${config.field} → ${config.related_collection} already exists`)
    return
  }
  const { error } = await directusRequest('/relations', 'POST', {
    collection: config.collection,
    field: config.field,
    related_collection: config.related_collection,
    meta: config.meta ?? {},
  })
  if (error) console.error(`  ✗ relation ${config.collection}.${config.field} failed: ${error}`)
  else console.log(`  + relation ${config.collection}.${config.field} → ${config.related_collection} created`)
}

async function createContentPlansCollection(): Promise<boolean> {
  if (await collectionExists('content_plans')) {
    console.log(`  ✓ collection content_plans already exists`)
    return true
  }

  console.log(`  + creating collection content_plans (bare — fields added below)`)
  const { error } = await directusRequest('/collections', 'POST', {
    collection: 'content_plans',
    meta: {
      icon: 'calendar_month',
      note: 'A strategy + batch of social posts grouped for client review (monthly retainer, campaign, or launch).',
      display_template: '{{title}}',
      accountability: 'all',
      hidden: false,
      singleton: false,
    },
    schema: {},
  })

  if (error) {
    console.error(`  ✗ create content_plans failed: ${error}`)
    return false
  }
  console.log(`  + content_plans collection created`)
  return true
}

async function addContentPlansFields(): Promise<void> {
  await createField('content_plans', 'id', {
    type: 'uuid',
    meta: { hidden: true, readonly: true, interface: 'input', special: ['uuid'] },
    schema: { is_primary_key: true, has_auto_increment: false },
  })

  await createField('content_plans', 'date_created', {
    type: 'timestamp',
    meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true, width: 'half' },
    schema: {},
  })

  await createField('content_plans', 'date_updated', {
    type: 'timestamp',
    meta: { special: ['date-updated'], interface: 'datetime', readonly: true, hidden: true, width: 'half' },
    schema: {},
  })

  await createField('content_plans', 'user_created', {
    type: 'uuid',
    meta: {
      special: ['user-created'],
      interface: 'select-dropdown-m2o',
      display: 'related-values',
      display_options: { template: '{{first_name}} {{last_name}}' },
      readonly: true,
      hidden: true,
      width: 'half',
      options: { template: '{{first_name}} {{last_name}}' },
    },
    schema: { is_nullable: true, foreign_key_table: 'directus_users' },
  })

  await createField('content_plans', 'title', {
    type: 'string',
    meta: {
      interface: 'input',
      width: 'full',
      note: 'Optional human-friendly title. Auto-derived from project + month/event when blank.',
    },
    schema: { is_nullable: true, max_length: 200 },
  })

  await createField('content_plans', 'organization', {
    type: 'uuid',
    meta: {
      interface: 'select-dropdown-m2o',
      special: ['m2o'],
      display: 'related-values',
      display_options: { template: '{{name}}' },
      note: 'Owning organization (tenant scope). Every plan must belong to exactly one org.',
      required: true,
      width: 'half',
      options: { template: '{{name}}' },
    },
    schema: { is_nullable: false, foreign_key_table: 'organizations' },
  })

  await createField('content_plans', 'project', {
    type: 'uuid',
    meta: {
      interface: 'select-dropdown-m2o',
      special: ['m2o'],
      display: 'related-values',
      display_options: { template: '{{title}}' },
      note: 'Retainer (or fixed-fee) project this plan delivers against. Optional; when set, joins the hour pool.',
      width: 'half',
      options: { template: '{{title}}' },
    },
    schema: { is_nullable: true, foreign_key_table: 'projects' },
  })

  await createField('content_plans', 'target_client', {
    type: 'uuid',
    meta: {
      interface: 'select-dropdown-m2o',
      special: ['m2o'],
      display: 'related-values',
      display_options: { template: '{{name}}' },
      note: 'Client this plan is for (denormalized for portal scoping). Should match project.client.',
      width: 'half',
      options: { template: '{{name}}' },
    },
    schema: { is_nullable: true, foreign_key_table: 'clients' },
  })

  await createField('content_plans', 'plan_type', {
    type: 'string',
    meta: {
      interface: 'select-dropdown',
      display: 'labels',
      width: 'half',
      note: 'Shape of this plan. monthly_cadence is the default for retainers; campaign/launch tie to a project_event.',
      options: {
        choices: [
          { text: 'Monthly Cadence', value: 'monthly_cadence' },
          { text: 'Campaign', value: 'campaign' },
          { text: 'Launch', value: 'launch' },
          { text: 'Custom', value: 'custom' },
        ],
      },
    },
    schema: { is_nullable: false, default_value: 'monthly_cadence', max_length: 30 },
  })

  await createField('content_plans', 'target_month', {
    type: 'date',
    meta: {
      interface: 'datetime',
      display: 'datetime',
      width: 'half',
      note: 'First-of-month anchor for monthly_cadence plans. Null for campaign/launch.',
    },
    schema: { is_nullable: true },
  })

  await createField('content_plans', 'project_event', {
    type: 'uuid',
    meta: {
      interface: 'select-dropdown-m2o',
      special: ['m2o'],
      display: 'related-values',
      display_options: { template: '{{title}}' },
      note: 'Project milestone/event this plan is built around (campaign/launch). Null for monthly cadence.',
      width: 'half',
      options: { template: '{{title}}' },
    },
    schema: { is_nullable: true, foreign_key_table: 'project_events' },
  })

  await createField('content_plans', 'state', {
    type: 'string',
    meta: {
      interface: 'select-dropdown',
      display: 'labels',
      width: 'half',
      note: 'Plan-level approval state. Used to gate plan-level review independently of per-post approval_state.',
      options: {
        choices: [
          { text: 'Draft', value: 'draft' },
          { text: 'In Review', value: 'in_review' },
          { text: 'Approved', value: 'approved' },
          { text: 'Archived', value: 'archived' },
        ],
      },
    },
    schema: { is_nullable: false, default_value: 'draft', max_length: 30 },
  })

  await createField('content_plans', 'objective', {
    type: 'string',
    meta: {
      interface: 'input',
      width: 'full',
      note: 'One-line goal for this plan ("Drive RSVPs to launch event").',
    },
    schema: { is_nullable: true, max_length: 500 },
  })

  await createField('content_plans', 'themes', {
    type: 'json',
    meta: {
      interface: 'tags',
      special: ['cast-json'],
      width: 'full',
      note: 'Themes/pillars for the plan ("Behind the scenes", "Product hero shots", …).',
      options: { placeholder: 'Add a theme…' },
    },
    schema: { is_nullable: true },
  })

  await createField('content_plans', 'strategy', {
    type: 'text',
    meta: {
      interface: 'input-rich-text-md',
      width: 'full',
      note: 'Full strategy/intro shown to the client at the top of the review page.',
    },
    schema: { is_nullable: true },
  })

  await createField('content_plans', 'cover_image_url', {
    type: 'string',
    meta: {
      interface: 'input',
      width: 'full',
      note: 'Optional hero image for the plan card in Studio and the top of the portal review page.',
    },
    schema: { is_nullable: true, max_length: 500 },
  })

  await createField('content_plans', 'approval_token', {
    type: 'string',
    meta: {
      interface: 'input',
      special: ['no-data'],
      readonly: true,
      hidden: true,
      note: 'Opaque token used by the portal review surface. Server-managed.',
      width: 'half',
    },
    schema: { max_length: 64, is_nullable: true, default_value: null },
  })

  await createField('content_plans', 'approved_by', {
    type: 'uuid',
    meta: {
      interface: 'select-dropdown-m2o',
      special: ['m2o'],
      display: 'related-values',
      display_options: { template: '{{first_name}} {{last_name}}' },
      readonly: true,
      width: 'half',
      options: { template: '{{first_name}} {{last_name}}' },
    },
    schema: { is_nullable: true, foreign_key_table: 'directus_users' },
  })

  await createField('content_plans', 'approved_at', {
    type: 'timestamp',
    meta: {
      interface: 'datetime',
      display: 'datetime',
      readonly: true,
      width: 'half',
    },
    schema: { is_nullable: true },
  })

  await createField('content_plans', 'sent_for_review_at', {
    type: 'timestamp',
    meta: {
      interface: 'datetime',
      display: 'datetime',
      readonly: true,
      width: 'half',
      note: 'When the plan was first sent to the client for review.',
    },
    schema: { is_nullable: true },
  })
}

async function main() {
  console.log('\n── Content Plans Setup ──\n')
  console.log(`Directus: ${DIRECTUS_URL}\n`)

  console.log('content_plans collection:')
  const ok = await createContentPlansCollection()
  if (!ok) {
    console.error('Aborting — collection create failed.')
    process.exit(1)
  }

  console.log('\ncontent_plans fields:')
  await addContentPlansFields()

  console.log('\ncontent_plans relations:')
  await createRelation({
    collection: 'content_plans',
    field: 'organization',
    related_collection: 'organizations',
    meta: { sort_field: null },
  })
  await createRelation({
    collection: 'content_plans',
    field: 'project',
    related_collection: 'projects',
    meta: { sort_field: null },
  })
  await createRelation({
    collection: 'content_plans',
    field: 'target_client',
    related_collection: 'clients',
    meta: { sort_field: null },
  })
  await createRelation({
    collection: 'content_plans',
    field: 'project_event',
    related_collection: 'project_events',
    meta: { sort_field: null },
  })
  await createRelation({
    collection: 'content_plans',
    field: 'approved_by',
    related_collection: 'directus_users',
    meta: { sort_field: null },
  })
  await createRelation({
    collection: 'content_plans',
    field: 'user_created',
    related_collection: 'directus_users',
    meta: { sort_field: null },
  })

  // content_plans.id is integer-auto-increment (Directus default when
  // a collection is created with schema:{}). Child FK columns must match.
  console.log('\nsocial_posts.content_plan:')
  await createField('social_posts', 'content_plan', {
    type: 'integer',
    meta: {
      interface: 'select-dropdown-m2o',
      special: ['m2o'],
      display: 'related-values',
      display_options: { template: '{{title}}' },
      note: 'Content plan this post belongs to (monthly cadence, campaign, or launch).',
      width: 'half',
      options: { template: '{{title}}' },
    },
    schema: { is_nullable: true, foreign_key_table: 'content_plans' },
  })
  await createRelation({
    collection: 'social_posts',
    field: 'content_plan',
    related_collection: 'content_plans',
    meta: { sort_field: null, one_field: 'posts' },
  })

  console.log('\ntime_entries.source_content_plan:')
  await createField('time_entries', 'source_content_plan', {
    type: 'integer',
    meta: {
      interface: 'select-dropdown-m2o',
      special: ['m2o'],
      display: 'related-values',
      display_options: { template: '{{title}}' },
      note: 'Content plan this time entry was logged against (for "hours per deliverable" reporting on retainers).',
      width: 'half',
      options: { template: '{{title}}' },
    },
    schema: { is_nullable: true, foreign_key_table: 'content_plans' },
  })
  await createRelation({
    collection: 'time_entries',
    field: 'source_content_plan',
    related_collection: 'content_plans',
    meta: { sort_field: null },
  })

  console.log('\n── Done ──\n')
  console.log('Next steps:')
  console.log('  1. pnpm generate:types')
  console.log('  2. Wire policy perms (admin/staff CRUD; portal read-by-target_client; public read-by-token).')
}

main().catch((err) => {
  console.error('Setup failed:', err)
  process.exit(1)
})
