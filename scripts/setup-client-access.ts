#!/usr/bin/env npx tsx
/**
 * Directus Client Access Control Setup Script
 *
 * Creates junction collections and M2M relationships for granular client access:
 *   1. clients_teams          – Assigns clients to teams (team members inherit access)
 *   2. clients_directus_users – Individual user overrides for client access
 *   3. M2M fields on clients, teams, and directus_users
 *
 * Access model after setup:
 *   - Owner/Admin       → all clients in org (always)
 *   - Manager/Member    → union of (team-assigned clients + individually-assigned clients)
 *   - Client-role user  → their scoped client only (unchanged)
 *
 * Run once:
 *   pnpm tsx scripts/setup-client-access.ts
 *
 * After running, regenerate TypeScript types:
 *   pnpm generate:types
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
  } catch (err: any) {
    return { data: null, error: err.message }
  }
}

async function createCollection(collection: string, meta: Record<string, any>) {
  console.log(`  Creating collection: ${collection}`)
  const { error } = await directusRequest('/collections', 'POST', {
    collection,
    meta,
    schema: {},
  })
  if (error === 'already_exists') {
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

async function createField(collection: string, field: Record<string, any>) {
  const fieldName = field.field
  console.log(`  Creating field: ${collection}.${fieldName}`)
  const { error } = await directusRequest(`/fields/${collection}`, 'POST', field)
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

async function createRelation(relation: Record<string, any>) {
  console.log(`  Creating relation: ${relation.collection}.${relation.field} -> ${relation.related_collection}`)
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

// ─── 1. clients_teams junction ────────────────────────────────────────────────

async function setupClientsTeams() {
  console.log('\n=== clients_teams (junction) ===')

  await createCollection('clients_teams', {
    icon: 'group_work',
    note: 'Junction: assigns clients to teams for access control',
    hidden: true,
    singleton: false,
  })

  // Primary key
  await createField('clients_teams', {
    field: 'id',
    type: 'integer',
    meta: { interface: 'input', readonly: true, hidden: true },
    schema: { is_primary_key: true, has_auto_increment: true },
  })

  // FK to clients
  await createField('clients_teams', {
    field: 'clients_id',
    type: 'uuid',
    meta: {
      interface: 'select-dropdown-m2o',
      special: ['m2o'],
      hidden: true,
    },
    schema: {
      foreign_key_table: 'clients',
      foreign_key_column: 'id',
      is_nullable: true,
    },
  })

  // FK to teams
  await createField('clients_teams', {
    field: 'teams_id',
    type: 'uuid',
    meta: {
      interface: 'select-dropdown-m2o',
      special: ['m2o'],
      hidden: true,
    },
    schema: {
      foreign_key_table: 'teams',
      foreign_key_column: 'id',
      is_nullable: true,
    },
  })

  // Sort field
  await createField('clients_teams', {
    field: 'sort',
    type: 'integer',
    meta: { interface: 'input', hidden: true },
    schema: { is_nullable: true },
  })

  // Date created
  await createField('clients_teams', {
    field: 'date_created',
    type: 'timestamp',
    meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true },
    schema: {},
  })

  // Relations
  await createRelation({
    collection: 'clients_teams',
    field: 'clients_id',
    related_collection: 'clients',
    meta: {
      junction_field: 'teams_id',
      one_field: 'assigned_teams',
      sort_field: 'sort',
    },
    schema: {
      on_delete: 'SET NULL',
    },
  })

  await createRelation({
    collection: 'clients_teams',
    field: 'teams_id',
    related_collection: 'teams',
    meta: {
      junction_field: 'clients_id',
      one_field: 'assigned_clients',
      sort_field: null,
    },
    schema: {
      on_delete: 'SET NULL',
    },
  })
}

// ─── 2. clients_directus_users junction ───────────────────────────────────────

async function setupClientsUsers() {
  console.log('\n=== clients_directus_users (junction) ===')

  await createCollection('clients_directus_users', {
    icon: 'person_add',
    note: 'Junction: assigns individual users to clients for access overrides',
    hidden: true,
    singleton: false,
  })

  // Primary key
  await createField('clients_directus_users', {
    field: 'id',
    type: 'integer',
    meta: { interface: 'input', readonly: true, hidden: true },
    schema: { is_primary_key: true, has_auto_increment: true },
  })

  // FK to clients
  await createField('clients_directus_users', {
    field: 'clients_id',
    type: 'uuid',
    meta: {
      interface: 'select-dropdown-m2o',
      special: ['m2o'],
      hidden: true,
    },
    schema: {
      foreign_key_table: 'clients',
      foreign_key_column: 'id',
      is_nullable: true,
    },
  })

  // FK to directus_users
  await createField('clients_directus_users', {
    field: 'directus_users_id',
    type: 'uuid',
    meta: {
      interface: 'select-dropdown-m2o',
      special: ['m2o'],
      hidden: true,
    },
    schema: {
      foreign_key_table: 'directus_users',
      foreign_key_column: 'id',
      is_nullable: true,
    },
  })

  // Sort field
  await createField('clients_directus_users', {
    field: 'sort',
    type: 'integer',
    meta: { interface: 'input', hidden: true },
    schema: { is_nullable: true },
  })

  // Date created
  await createField('clients_directus_users', {
    field: 'date_created',
    type: 'timestamp',
    meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true },
    schema: {},
  })

  // Relations
  await createRelation({
    collection: 'clients_directus_users',
    field: 'clients_id',
    related_collection: 'clients',
    meta: {
      junction_field: 'directus_users_id',
      one_field: 'assigned_users',
      sort_field: 'sort',
    },
    schema: {
      on_delete: 'SET NULL',
    },
  })

  await createRelation({
    collection: 'clients_directus_users',
    field: 'directus_users_id',
    related_collection: 'directus_users',
    meta: {
      junction_field: 'clients_id',
      one_field: 'assigned_clients',
      sort_field: null,
    },
    schema: {
      on_delete: 'SET NULL',
    },
  })
}

// ─── 3. Update M2M alias fields on parent collections ─────────────────────────

async function setupParentFields() {
  console.log('\n=== M2M alias fields on parent collections ===')

  // clients.assigned_teams (M2M alias)
  // This field may already exist from earlier attempt — update it
  const { error: checkError } = await directusRequest(`/fields/clients/assigned_teams`)
  if (checkError) {
    await createField('clients', {
      field: 'assigned_teams',
      type: 'alias',
      meta: {
        interface: 'list-m2m',
        special: ['m2m'],
        options: { template: '{{teams_id.name}}', junctionFieldsLocation: 'bottom' },
        display: 'related-values',
        display_options: { template: '{{teams_id.name}}' },
        note: 'Teams assigned to this client',
        width: 'full',
        hidden: false,
      },
    })
  } else {
    // Update existing
    await directusRequest('/fields/clients/assigned_teams', 'PATCH', {
      meta: {
        special: ['m2m'],
        interface: 'list-m2m',
        options: { template: '{{teams_id.name}}', junctionFieldsLocation: 'bottom' },
        display: 'related-values',
        display_options: { template: '{{teams_id.name}}' },
        note: 'Teams assigned to this client',
      },
    })
    console.log('  Updated clients.assigned_teams with M2M special')
  }

  // clients.assigned_users (M2M alias)
  await createField('clients', {
    field: 'assigned_users',
    type: 'alias',
    meta: {
      interface: 'list-m2m',
      special: ['m2m'],
      options: {
        template: '{{directus_users_id.first_name}} {{directus_users_id.last_name}}',
        junctionFieldsLocation: 'bottom',
      },
      display: 'related-values',
      display_options: { template: '{{directus_users_id.first_name}} {{directus_users_id.last_name}}' },
      note: 'Individual users with direct access to this client',
      width: 'full',
      hidden: false,
    },
  })

  // teams.assigned_clients (O2M alias — reverse of clients_teams)
  await createField('teams', {
    field: 'assigned_clients',
    type: 'alias',
    meta: {
      interface: 'list-m2m',
      special: ['m2m'],
      options: { template: '{{clients_id.name}}', junctionFieldsLocation: 'bottom' },
      display: 'related-values',
      display_options: { template: '{{clients_id.name}}' },
      note: 'Clients assigned to this team',
      width: 'full',
      hidden: false,
    },
  })
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗')
  console.log('║  Client Access Control — Directus Schema Setup      ║')
  console.log('╠══════════════════════════════════════════════════════╣')
  console.log(`║  Directus: ${DIRECTUS_URL.padEnd(41)}║`)
  console.log('╚══════════════════════════════════════════════════════╝')

  // Verify connection (ping returns plain text "pong", not JSON)
  try {
    const pingRes = await fetch(`${DIRECTUS_URL}/server/ping`, {
      headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
    })
    const pingText = await pingRes.text()
    if (!pingRes.ok || !pingText.includes('pong')) {
      console.error(`\nCannot reach Directus at ${DIRECTUS_URL}: ${pingText}`)
      process.exit(1)
    }
  } catch (err: any) {
    console.error(`\nCannot reach Directus at ${DIRECTUS_URL}: ${err.message}`)
    process.exit(1)
  }
  console.log('\n✓ Connected to Directus')

  await setupClientsTeams()
  await setupClientsUsers()
  await setupParentFields()

  console.log('\n══════════════════════════════════════════════════════')
  console.log('✓ Client access control schema setup complete!')
  console.log('')
  console.log('Next steps:')
  console.log('  1. Run: pnpm generate:types')
  console.log('  2. Set up Directus permissions for the new collections')
  console.log('  3. The useClients composable will now filter by role + assignments')
  console.log('')
}

main().catch(console.error)
