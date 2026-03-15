#!/usr/bin/env npx tsx
/**
 * Creates the `time_entries` collection for time tracking.
 *
 * Run:   pnpm tsx scripts/setup-time-entries.ts
 * Then:  pnpm generate:types
 */

import 'dotenv/config'

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055'
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || ''

if (!DIRECTUS_TOKEN) {
  console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN required')
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

async function createCollection(collection: string, meta: Record<string, any>) {
  console.log(`  Creating collection: ${collection}`)
  const { error } = await directusRequest('/collections', 'POST', { collection, meta, schema: {} })
  if (error === 'already_exists') { console.log(`    -> Already exists`); return true }
  if (error) { console.error(`    -> Error: ${error}`); return false }
  console.log(`    -> Created`)
  return true
}

async function createField(collection: string, field: Record<string, any>) {
  const fieldName = field.field
  console.log(`  Creating field: ${collection}.${fieldName}`)
  const { error } = await directusRequest(`/fields/${collection}`, 'POST', field)
  if (error === 'already_exists' || error?.includes('already exists')) { console.log(`    -> Already exists`); return true }
  if (error) { console.error(`    -> Error: ${error}`); return false }
  console.log(`    -> Created`)
  return true
}

// ─── time_entries ─────────────────────────────────────────────────────────────

async function setup() {
  console.log('\n=== time_entries ===')

  await createCollection('time_entries', {
    icon: 'timer',
    note: 'Time tracking entries linked to tickets, projects, tasks, or clients',
    hidden: false,
    singleton: false,
    archive_field: 'status',
    archive_value: 'archived',
    unarchive_value: 'completed',
    sort_field: 'sort',
  })

  // Status
  await createField('time_entries', {
    field: 'status',
    type: 'string',
    schema: { default_value: 'completed', is_nullable: true },
    meta: {
      interface: 'select-dropdown',
      display: 'labels',
      width: 'half',
      options: {
        choices: [
          { text: 'Running', value: 'running', color: 'var(--theme--success)' },
          { text: 'Completed', value: 'completed', color: 'var(--theme--primary)' },
          { text: 'Archived', value: 'archived', color: 'var(--theme--foreground-subdued)' },
        ],
      },
    },
  })

  // Sort
  await createField('time_entries', {
    field: 'sort',
    type: 'integer',
    schema: { is_nullable: true },
    meta: { interface: 'input', hidden: true },
  })

  // Organization (M2O)
  await createField('time_entries', {
    field: 'organization',
    type: 'uuid',
    schema: { is_nullable: false, foreign_key_table: 'organizations', foreign_key_column: 'id' },
    meta: { interface: 'select-dropdown-m2o', special: ['m2o'], required: true, width: 'half' },
  })

  // User (M2O → directus_users)
  await createField('time_entries', {
    field: 'user',
    type: 'uuid',
    schema: { is_nullable: false, foreign_key_table: 'directus_users', foreign_key_column: 'id' },
    meta: { interface: 'select-dropdown-m2o', special: ['m2o'], required: true, width: 'half' },
  })

  // Client (M2O)
  await createField('time_entries', {
    field: 'client',
    type: 'uuid',
    schema: { is_nullable: true, foreign_key_table: 'clients', foreign_key_column: 'id' },
    meta: { interface: 'select-dropdown-m2o', special: ['m2o'], width: 'half' },
  })

  // Project (M2O)
  await createField('time_entries', {
    field: 'project',
    type: 'uuid',
    schema: { is_nullable: true, foreign_key_table: 'projects', foreign_key_column: 'id' },
    meta: { interface: 'select-dropdown-m2o', special: ['m2o'], width: 'half' },
  })

  // Ticket (M2O)
  await createField('time_entries', {
    field: 'ticket',
    type: 'uuid',
    schema: { is_nullable: true, foreign_key_table: 'tickets', foreign_key_column: 'id' },
    meta: { interface: 'select-dropdown-m2o', special: ['m2o'], width: 'half' },
  })

  // Task (M2O)
  await createField('time_entries', {
    field: 'task',
    type: 'uuid',
    schema: { is_nullable: true, foreign_key_table: 'tasks', foreign_key_column: 'id' },
    meta: { interface: 'select-dropdown-m2o', special: ['m2o'], width: 'half' },
  })

  // Description
  await createField('time_entries', {
    field: 'description',
    type: 'text',
    schema: { is_nullable: true },
    meta: { interface: 'input-multiline', width: 'full' },
  })

  // Start time
  await createField('time_entries', {
    field: 'start_time',
    type: 'timestamp',
    schema: { is_nullable: false },
    meta: { interface: 'datetime', required: true, width: 'half' },
  })

  // End time
  await createField('time_entries', {
    field: 'end_time',
    type: 'timestamp',
    schema: { is_nullable: true },
    meta: { interface: 'datetime', width: 'half' },
  })

  // Duration (minutes)
  await createField('time_entries', {
    field: 'duration_minutes',
    type: 'integer',
    schema: { is_nullable: true },
    meta: { interface: 'input', width: 'half', note: 'Stored duration in minutes (allows manual adjustment)' },
  })

  // Date (for reporting)
  await createField('time_entries', {
    field: 'date',
    type: 'date',
    schema: { is_nullable: true },
    meta: { interface: 'datetime', width: 'half', note: 'Calendar date derived from start_time' },
  })

  // Billable
  await createField('time_entries', {
    field: 'billable',
    type: 'boolean',
    schema: { is_nullable: true, default_value: true },
    meta: { interface: 'boolean', width: 'half' },
  })

  // Hourly rate
  await createField('time_entries', {
    field: 'hourly_rate',
    type: 'decimal',
    schema: { is_nullable: true, numeric_precision: 10, numeric_scale: 2 },
    meta: { interface: 'input', width: 'half', note: 'Rate snapshot at time of entry' },
  })

  // Billed
  await createField('time_entries', {
    field: 'billed',
    type: 'boolean',
    schema: { is_nullable: true, default_value: false },
    meta: { interface: 'boolean', width: 'half' },
  })

  // Invoice (M2O)
  await createField('time_entries', {
    field: 'invoice',
    type: 'uuid',
    schema: { is_nullable: true, foreign_key_table: 'invoices', foreign_key_column: 'id' },
    meta: { interface: 'select-dropdown-m2o', special: ['m2o'], width: 'half' },
  })

  // Tags
  await createField('time_entries', {
    field: 'tags',
    type: 'json',
    schema: { is_nullable: true },
    meta: { interface: 'tags', special: ['cast-json'], width: 'full' },
  })

  // Audit fields
  await createField('time_entries', {
    field: 'user_created',
    type: 'uuid',
    schema: { is_nullable: true, foreign_key_table: 'directus_users', foreign_key_column: 'id' },
    meta: { interface: 'select-dropdown-m2o', special: ['user-created', 'm2o'], readonly: true, hidden: true, width: 'half' },
  })

  await createField('time_entries', {
    field: 'date_created',
    type: 'timestamp',
    schema: { is_nullable: true },
    meta: { interface: 'datetime', special: ['date-created'], readonly: true, hidden: true, width: 'half' },
  })

  await createField('time_entries', {
    field: 'user_updated',
    type: 'uuid',
    schema: { is_nullable: true, foreign_key_table: 'directus_users', foreign_key_column: 'id' },
    meta: { interface: 'select-dropdown-m2o', special: ['user-updated', 'm2o'], readonly: true, hidden: true, width: 'half' },
  })

  await createField('time_entries', {
    field: 'date_updated',
    type: 'timestamp',
    schema: { is_nullable: true },
    meta: { interface: 'datetime', special: ['date-updated'], readonly: true, hidden: true, width: 'half' },
  })

  console.log('\n✅ time_entries collection setup complete!')
  console.log('Run `pnpm generate:types` to regenerate TypeScript types.\n')
}

setup().catch(console.error)
