#!/usr/bin/env npx tsx
/**
 * Directus People Collection Setup Script
 *
 * Creates the unified `people` collection that merges:
 *   - `contacts` (Earnest CRM contacts)
 *   - `cd_contacts` (CardDesk networking contacts)
 *
 * The `people` collection is a federation layer — existing collections
 * remain intact and continue working. This collection provides a unified
 * view for CRM Intelligence, search, and cross-app relationships.
 *
 * Run once during initial setup:
 *
 *   pnpm tsx scripts/setup-people-collection.ts
 *
 * After running:
 *   1. Run the migration script to backfill existing data:
 *      pnpm tsx scripts/migrate-to-people.ts
 *   2. Regenerate types:
 *      pnpm generate:types
 *
 * Prerequisites:
 *   - Directus instance running
 *   - Admin static token with schema write permissions
 */

import 'dotenv/config'

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
      if (response.status === 409) {
        return { data: null, error: 'already_exists' }
      }
      return { data: null, error: `${response.status}: ${text}` }
    }

    const json = text ? JSON.parse(text) : {}
    return { data: json.data ?? null, error: null }
  } catch (err: unknown) {
    return { data: null, error: String(err) }
  }
}

async function createCollection(collection: string, meta: Record<string, unknown>) {
  console.log(`  Creating collection: ${collection}`)
  const { error } = await directusRequest('/collections', 'POST', {
    collection,
    meta,
    schema: {},
  })
  if (error === 'already_exists') {
    console.log(`    ⏭  Already exists, skipping`)
    return true
  }
  if (error) {
    console.error(`    ✗  ${error}`)
    return false
  }
  console.log(`    ✓  Created`)
  return true
}

async function createField(collection: string, field: Record<string, unknown>) {
  const name = field.field as string
  console.log(`  Creating field: ${collection}.${name}`)
  const { error } = await directusRequest(`/fields/${collection}`, 'POST', field)
  if (error === 'already_exists') {
    console.log(`    ⏭  Already exists, skipping`)
    return true
  }
  if (error) {
    console.error(`    ✗  ${error}`)
    return false
  }
  console.log(`    ✓  Created`)
  return true
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔧 Setting up the unified People collection\n')
  console.log(`Directus URL: ${DIRECTUS_URL}\n`)

  // ── 1. Create `people` collection ──

  await createCollection('people', {
    icon: 'people',
    note: 'Unified CRM — contacts, clients, and CardDesk networking connections',
    singleton: false,
    sort_field: 'sort',
    archive_field: 'status',
    archive_value: 'archived',
    unarchive_value: 'published',
  })

  // ── 2. Create fields ──

  const fields = [
    // Status
    {
      field: 'status',
      type: 'string',
      schema: { default_value: 'published' },
      meta: {
        interface: 'select-dropdown',
        display: 'labels',
        width: 'half',
        options: {
          choices: [
            { text: 'Published', value: 'published' },
            { text: 'Draft', value: 'draft' },
            { text: 'Archived', value: 'archived' },
          ],
        },
      },
    },
    {
      field: 'sort',
      type: 'integer',
      schema: {},
      meta: { hidden: true },
    },

    // ── Source tracking ──
    {
      field: 'source',
      type: 'string',
      schema: { default_value: 'earnest' },
      meta: {
        interface: 'select-dropdown',
        display: 'labels',
        width: 'half',
        note: 'Where this record originated',
        options: {
          choices: [
            { text: 'Earnest', value: 'earnest' },
            { text: 'CardDesk', value: 'carddesk' },
            { text: 'Import', value: 'import' },
            { text: 'Manual', value: 'manual' },
          ],
        },
      },
    },
    {
      field: 'source_id',
      type: 'string',
      schema: {},
      meta: {
        width: 'half',
        note: 'ID in the original collection (contacts.id or cd_contacts.id)',
      },
    },
    {
      field: 'source_collection',
      type: 'string',
      schema: {},
      meta: {
        width: 'half',
        note: 'Original collection name (contacts, cd_contacts)',
        hidden: true,
      },
    },

    // ── Identity ──
    {
      field: 'prefix',
      type: 'string',
      schema: {},
      meta: {
        interface: 'select-dropdown',
        width: 'quarter',
        options: {
          choices: [
            { text: 'Mr.', value: 'Mr.' },
            { text: 'Ms.', value: 'Ms.' },
            { text: 'Mrs.', value: 'Mrs.' },
            { text: 'Dr.', value: 'Dr.' },
            { text: 'Prof.', value: 'Prof.' },
            { text: 'Mx.', value: 'Mx.' },
          ],
        },
      },
    },
    {
      field: 'first_name',
      type: 'string',
      schema: {},
      meta: { width: 'half', required: true },
    },
    {
      field: 'last_name',
      type: 'string',
      schema: {},
      meta: { width: 'half' },
    },
    {
      field: 'display_name',
      type: 'string',
      schema: {},
      meta: {
        width: 'full',
        note: 'Full display name (auto-generated from first + last if blank)',
      },
    },
    {
      field: 'email',
      type: 'string',
      schema: {},
      meta: { width: 'half' },
    },
    {
      field: 'phone',
      type: 'string',
      schema: {},
      meta: { width: 'half' },
    },
    {
      field: 'photo',
      type: 'uuid',
      schema: {},
      meta: { interface: 'file-image', width: 'half' },
    },

    // ── Professional ──
    {
      field: 'title',
      type: 'string',
      schema: {},
      meta: { width: 'half', note: 'Job title' },
    },
    {
      field: 'company',
      type: 'string',
      schema: {},
      meta: { width: 'half', note: 'Company name (free text)' },
    },
    {
      field: 'industry',
      type: 'string',
      schema: {},
      meta: {
        interface: 'select-dropdown',
        width: 'half',
        options: {
          choices: [
            { text: 'Technology', value: 'Technology' },
            { text: 'Finance', value: 'Finance' },
            { text: 'Healthcare', value: 'Healthcare' },
            { text: 'Real Estate', value: 'Real Estate' },
            { text: 'Legal', value: 'Legal' },
            { text: 'Marketing', value: 'Marketing' },
            { text: 'Education', value: 'Education' },
            { text: 'Hospitality', value: 'Hospitality' },
            { text: 'Non-Profit', value: 'Non-Profit' },
            { text: 'Government', value: 'Government' },
            { text: 'Venture Capital', value: 'Venture Capital' },
            { text: 'Other', value: 'Other' },
          ],
          allowOther: true,
        },
      },
    },
    {
      field: 'website',
      type: 'string',
      schema: {},
      meta: { width: 'half' },
    },

    // ── Social ──
    {
      field: 'linkedin_url',
      type: 'string',
      schema: {},
      meta: { width: 'half' },
    },
    {
      field: 'instagram_handle',
      type: 'string',
      schema: {},
      meta: { width: 'half' },
    },

    // ── Location ──
    {
      field: 'mailing_address',
      type: 'text',
      schema: {},
      meta: { interface: 'input-multiline', width: 'half' },
    },
    {
      field: 'timezone',
      type: 'string',
      schema: {},
      meta: { width: 'half' },
    },

    // ── CRM ──
    {
      field: 'category',
      type: 'string',
      schema: {},
      meta: {
        interface: 'select-dropdown',
        width: 'half',
        options: {
          choices: [
            { text: 'Client', value: 'client' },
            { text: 'Prospect', value: 'prospect' },
            { text: 'Partner', value: 'partner' },
            { text: 'Vendor', value: 'vendor' },
            { text: 'Media', value: 'media' },
            { text: 'Networking', value: 'networking' },
            { text: 'Other', value: 'other' },
          ],
          allowOther: true,
        },
      },
    },
    {
      field: 'rating',
      type: 'string',
      schema: {},
      meta: {
        interface: 'select-dropdown',
        width: 'half',
        note: 'Lead temperature (from CardDesk or manual)',
        options: {
          choices: [
            { text: 'Hot', value: 'hot' },
            { text: 'Warm', value: 'warm' },
            { text: 'Nurture', value: 'nurture' },
            { text: 'Cold', value: 'cold' },
          ],
        },
      },
    },
    {
      field: 'tags',
      type: 'json',
      schema: {},
      meta: { interface: 'tags', width: 'full' },
    },
    {
      field: 'custom_fields',
      type: 'json',
      schema: {},
      meta: { interface: 'input-code', width: 'full', note: 'Arbitrary key-value metadata' },
    },
    {
      field: 'notes',
      type: 'text',
      schema: {},
      meta: { interface: 'input-rich-text-md', width: 'full' },
    },
    {
      field: 'met_at',
      type: 'string',
      schema: {},
      meta: { width: 'half', note: 'Where/when first met (from CardDesk)' },
    },

    // ── CardDesk-specific (preserved for sync) ──
    {
      field: 'is_client',
      type: 'boolean',
      schema: { default_value: false },
      meta: { width: 'half', note: 'CardDesk conversion flag' },
    },
    {
      field: 'client_at',
      type: 'timestamp',
      schema: {},
      meta: { width: 'half', note: 'When converted to client in CardDesk' },
    },
    {
      field: 'hibernated',
      type: 'boolean',
      schema: { default_value: false },
      meta: { width: 'half', note: 'Soft-paused in CardDesk (no deletion)' },
    },

    // ── Email engagement (from contacts) ──
    {
      field: 'email_subscribed',
      type: 'boolean',
      schema: { default_value: true },
      meta: { width: 'half' },
    },
    {
      field: 'unsubscribe_token',
      type: 'string',
      schema: {},
      meta: { hidden: true },
    },
    {
      field: 'email_bounced',
      type: 'boolean',
      schema: { default_value: false },
      meta: { width: 'half' },
    },
    {
      field: 'total_emails_sent',
      type: 'integer',
      schema: { default_value: 0 },
      meta: { width: 'quarter' },
    },
    {
      field: 'total_opens',
      type: 'integer',
      schema: { default_value: 0 },
      meta: { width: 'quarter' },
    },
    {
      field: 'total_clicks',
      type: 'integer',
      schema: { default_value: 0 },
      meta: { width: 'quarter' },
    },

    // ── Relations (M2O) ──
    {
      field: 'client',
      type: 'uuid',
      schema: {},
      meta: {
        interface: 'select-dropdown-m2o',
        width: 'half',
        note: 'Company this person belongs to',
        special: ['m2o'],
      },
      relation: {
        related_collection: 'clients',
      },
    },
    {
      field: 'user',
      type: 'uuid',
      schema: {},
      meta: {
        interface: 'select-dropdown-m2o',
        width: 'half',
        note: 'Linked Directus user account',
        special: ['m2o'],
      },
      relation: {
        related_collection: 'directus_users',
      },
    },
  ]

  for (const field of fields) {
    await createField('people', field)
  }

  // ── 3. Create organization junction ──

  console.log('\n  Setting up people ↔ organizations junction...')

  await createCollection('people_organizations', {
    icon: 'link',
    hidden: true,
    note: 'Junction: people to organizations (many-to-many)',
  })

  const junctionFields = [
    {
      field: 'people_id',
      type: 'uuid',
      schema: {},
      meta: { hidden: true, special: ['m2o'] },
      relation: { related_collection: 'people' },
    },
    {
      field: 'organizations_id',
      type: 'uuid',
      schema: {},
      meta: { hidden: true, special: ['m2o'] },
      relation: { related_collection: 'organizations' },
    },
  ]

  for (const field of junctionFields) {
    await createField('people_organizations', field)
  }

  // Add O2M alias on people for the junction
  await createField('people', {
    field: 'organizations',
    type: 'alias',
    meta: {
      interface: 'list-m2m',
      special: ['m2m'],
      note: 'Organizations this person belongs to',
    },
    relation: {
      collection: 'people_organizations',
      field: 'people_id',
      related_collection: 'organizations',
      meta: {
        junction_field: 'organizations_id',
      },
    },
  })

  console.log('\n✅ People collection setup complete!')
  console.log('\nNext steps:')
  console.log('  1. Run migration:  pnpm tsx scripts/migrate-to-people.ts')
  console.log('  2. Regen types:    pnpm generate:types')
  console.log('  3. Set permissions in Directus for the people collection\n')
}

main().catch(console.error)
