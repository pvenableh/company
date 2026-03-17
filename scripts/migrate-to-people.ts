#!/usr/bin/env npx tsx
/**
 * Migrate existing contacts and CardDesk contacts into the unified `people` collection.
 *
 * This is a non-destructive migration:
 *   - Reads from `contacts` and `cd_contacts`
 *   - Creates records in `people` with source tracking
 *   - Deduplicates on email address (first match wins, CardDesk data merged)
 *   - Does NOT delete or modify the source collections
 *
 * Safe to run multiple times — skips records that already exist in `people`
 * (matched by source_collection + source_id).
 *
 * Run after setup-people-collection.ts:
 *
 *   pnpm tsx scripts/migrate-to-people.ts
 *
 * Options:
 *   --dry-run    Preview what would be migrated without writing
 */

import 'dotenv/config'

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055'
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || ''
const DRY_RUN = process.argv.includes('--dry-run')

if (!DIRECTUS_TOKEN) {
  console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN environment variable is required')
  process.exit(1)
}

// ─── API Helper ───────────────────────────────────────────────────────────────

async function directusFetch<T = unknown>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' = 'GET',
  body?: unknown
): Promise<T | null> {
  const response = await fetch(`${DIRECTUS_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DIRECTUS_TOKEN}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`${method} ${path} → ${response.status}: ${text.slice(0, 200)}`)
  }

  const json = await response.json()
  return json.data ?? null
}

async function fetchAll<T = Record<string, unknown>>(collection: string, fields: string[] = ['*']): Promise<T[]> {
  const items: T[] = []
  let page = 1
  const limit = 100

  while (true) {
    const batch = await directusFetch<T[]>(
      `/items/${collection}?fields=${fields.join(',')}&limit=${limit}&page=${page}&sort=date_created`
    )
    if (!batch || batch.length === 0) break
    items.push(...batch)
    if (batch.length < limit) break
    page++
  }

  return items
}

// ─── Field Mapping ────────────────────────────────────────────────────────────

interface PeopleRecord {
  source: string
  source_id: string
  source_collection: string
  prefix?: string
  first_name: string
  last_name?: string
  display_name: string
  email?: string
  phone?: string
  title?: string
  company?: string
  industry?: string
  website?: string
  linkedin_url?: string
  instagram_handle?: string
  mailing_address?: string
  timezone?: string
  category?: string
  rating?: string
  tags?: string[]
  custom_fields?: Record<string, unknown>
  notes?: string
  met_at?: string
  is_client?: boolean
  client_at?: string
  hibernated?: boolean
  email_subscribed?: boolean
  unsubscribe_token?: string
  email_bounced?: boolean
  total_emails_sent?: number
  total_opens?: number
  total_clicks?: number
  photo?: string
  user_created?: string
  status: string
  [key: string]: unknown
}

function mapContact(contact: Record<string, unknown>): PeopleRecord {
  const firstName = (contact.first_name as string) || ''
  const lastName = (contact.last_name as string) || ''
  const displayName = [firstName, lastName].filter(Boolean).join(' ') || (contact.email as string) || 'Unknown'

  return {
    source: 'earnest',
    source_id: contact.id as string,
    source_collection: 'contacts',
    status: (contact.status as string) || 'published',
    prefix: contact.prefix as string | undefined,
    first_name: firstName,
    last_name: lastName,
    display_name: displayName,
    email: contact.email as string | undefined,
    phone: contact.phone as string | undefined,
    title: contact.title as string | undefined,
    company: contact.company as string | undefined,
    industry: contact.industry as string | undefined,
    website: contact.website as string | undefined,
    linkedin_url: contact.linkedin_url as string | undefined,
    instagram_handle: contact.instagram_handle as string | undefined,
    mailing_address: contact.mailing_address as string | undefined,
    timezone: contact.timezone as string | undefined,
    category: contact.category as string | undefined,
    tags: contact.tags as string[] | undefined,
    custom_fields: contact.custom_fields ? JSON.parse(contact.custom_fields as string) : undefined,
    notes: contact.notes as string | undefined,
    photo: contact.photo as string | undefined,
    email_subscribed: contact.email_subscribed as boolean | undefined,
    unsubscribe_token: contact.unsubscribe_token as string | undefined,
    email_bounced: contact.email_bounced as boolean | undefined,
    total_emails_sent: contact.total_emails_sent as number | undefined,
    total_opens: contact.total_opens as number | undefined,
    total_clicks: contact.total_clicks as number | undefined,
    user_created: contact.user_created as string | undefined,
  }
}

function mapCdContact(cd: Record<string, unknown>): PeopleRecord {
  const firstName = (cd.first_name as string) || ''
  const lastName = (cd.last_name as string) || ''
  const name = (cd.name as string) || ''
  const displayName = name || [firstName, lastName].filter(Boolean).join(' ') || (cd.email as string) || 'Unknown'

  return {
    source: 'carddesk',
    source_id: cd.id as string,
    source_collection: 'cd_contacts',
    status: (cd.hibernated as boolean) ? 'archived' : 'published',
    first_name: firstName || displayName.split(' ')[0] || displayName,
    last_name: lastName || displayName.split(' ').slice(1).join(' ') || undefined,
    display_name: displayName,
    email: cd.email as string | undefined,
    phone: cd.phone as string | undefined,
    title: cd.title as string | undefined,
    company: cd.company as string | undefined,
    industry: cd.industry as string | undefined,
    category: 'networking',
    rating: cd.rating as string | undefined,
    notes: cd.notes as string | undefined,
    met_at: cd.met_at as string | undefined,
    is_client: cd.is_client as boolean | undefined,
    client_at: cd.client_at as string | undefined,
    hibernated: cd.hibernated as boolean | undefined,
    user_created: cd.user_created as string | undefined,
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${DRY_RUN ? '🔍 DRY RUN — ' : ''}Migrating to unified People collection\n`)
  console.log(`Directus URL: ${DIRECTUS_URL}\n`)

  // ── 1. Load existing people records to avoid duplicates ──
  console.log('Loading existing people records...')
  const existingPeople = await fetchAll<Record<string, unknown>>('people', ['id', 'source_collection', 'source_id', 'email'])
  const existingKeys = new Set(
    existingPeople.map((p) => `${p.source_collection}:${p.source_id}`)
  )
  const existingEmails = new Map<string, string>()
  for (const p of existingPeople) {
    if (p.email) existingEmails.set((p.email as string).toLowerCase(), p.id as string)
  }
  console.log(`  Found ${existingPeople.length} existing people records\n`)

  // ── 2. Fetch source data ──
  console.log('Fetching contacts...')
  const contacts = await fetchAll<Record<string, unknown>>('contacts')
  console.log(`  Found ${contacts.length} contacts\n`)

  console.log('Fetching CardDesk contacts...')
  let cdContacts: Record<string, unknown>[] = []
  try {
    cdContacts = await fetchAll<Record<string, unknown>>('cd_contacts')
    console.log(`  Found ${cdContacts.length} CardDesk contacts\n`)
  } catch (err) {
    console.log(`  ⚠ Could not fetch cd_contacts (collection may not exist): ${err}\n`)
  }

  // ── 3. Map and deduplicate ──
  const toCreate: PeopleRecord[] = []
  const emailsSeen = new Map<string, number>(
    [...existingEmails.entries()].map(([email]) => [email, -1])
  )
  let skippedExisting = 0
  let skippedDuplicate = 0

  // Process Earnest contacts first (they're the primary source)
  for (const contact of contacts) {
    const key = `contacts:${contact.id}`
    if (existingKeys.has(key)) {
      skippedExisting++
      continue
    }

    const mapped = mapContact(contact)
    const emailLower = mapped.email?.toLowerCase()

    if (emailLower && emailsSeen.has(emailLower)) {
      skippedDuplicate++
      continue
    }

    if (emailLower) emailsSeen.set(emailLower, toCreate.length)
    toCreate.push(mapped)
  }

  // Process CardDesk contacts (merge into existing if email matches)
  for (const cd of cdContacts) {
    const key = `cd_contacts:${cd.id}`
    if (existingKeys.has(key)) {
      skippedExisting++
      continue
    }

    const mapped = mapCdContact(cd)
    const emailLower = mapped.email?.toLowerCase()

    if (emailLower && emailsSeen.has(emailLower)) {
      const idx = emailsSeen.get(emailLower)!
      if (idx >= 0) {
        // Merge CardDesk data into existing record (add rating, met_at, is_client)
        const existing = toCreate[idx]
        if (mapped.rating && !existing.rating) existing.rating = mapped.rating
        if (mapped.met_at && !existing.met_at) existing.met_at = mapped.met_at
        if (mapped.is_client) existing.is_client = true
        if (mapped.client_at) existing.client_at = mapped.client_at
        if (mapped.notes && !existing.notes) existing.notes = mapped.notes
      }
      skippedDuplicate++
      continue
    }

    if (emailLower) emailsSeen.set(emailLower, toCreate.length)
    toCreate.push(mapped)
  }

  // ── 4. Summary ──
  console.log('─── Migration Summary ───')
  console.log(`  Records to create:  ${toCreate.length}`)
  console.log(`  Skipped (existing): ${skippedExisting}`)
  console.log(`  Skipped (dupes):    ${skippedDuplicate}`)
  console.log(`  From contacts:      ${toCreate.filter((r) => r.source === 'earnest').length}`)
  console.log(`  From CardDesk:      ${toCreate.filter((r) => r.source === 'carddesk').length}`)
  console.log()

  if (DRY_RUN) {
    console.log('🔍 Dry run complete — no records written.\n')
    if (toCreate.length > 0) {
      console.log('Sample records that would be created:')
      for (const record of toCreate.slice(0, 3)) {
        console.log(`  - ${record.display_name} (${record.email || 'no email'}) [${record.source}]`)
      }
      if (toCreate.length > 3) console.log(`  ... and ${toCreate.length - 3} more`)
    }
    return
  }

  if (toCreate.length === 0) {
    console.log('✅ Nothing to migrate — all records already exist.\n')
    return
  }

  // ── 5. Create records in batches ──
  const BATCH_SIZE = 25
  let created = 0
  let errors = 0

  for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
    const batch = toCreate.slice(i, i + BATCH_SIZE)
    console.log(`  Creating batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(toCreate.length / BATCH_SIZE)} (${batch.length} records)...`)

    for (const record of batch) {
      try {
        // Strip undefined values
        const clean = Object.fromEntries(
          Object.entries(record).filter(([, v]) => v !== undefined)
        )
        await directusFetch('/items/people', 'POST', clean)
        created++
      } catch (err) {
        errors++
        console.error(`    ✗ Failed to create ${record.display_name}: ${err}`)
      }
    }
  }

  console.log(`\n✅ Migration complete!`)
  console.log(`   Created: ${created}`)
  if (errors > 0) console.log(`   Errors:  ${errors}`)
  console.log(`\nNext steps:`)
  console.log(`  1. Verify in Directus: ${DIRECTUS_URL}/admin/content/people`)
  console.log(`  2. Set up Directus Flow to sync new cd_contacts → people`)
  console.log(`  3. Regenerate types: pnpm generate:types\n`)
}

main().catch(console.error)
