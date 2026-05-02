#!/usr/bin/env npx tsx
/**
 * One-off: run the social demo seed against the two demo orgs without
 * re-seeding everything else. Idempotent only in the sense that running it
 * again will create *more* placeholder accounts/posts; if you need a clean
 * slate, wipe social_accounts + social_posts for the demo orgs first.
 */

import 'dotenv/config'
import { directusRequest, seedSocial } from './lib/demo-seed'

interface ClientRow { id: string; slug: string; name: string }

async function clientsFor(orgId: string): Promise<Record<string, string>> {
  const path = `/items/clients?filter[organization][_eq]=${orgId}&fields=id,slug,name&limit=-1`
  const res = await directusRequest<ClientRow[]>(path)
  if (!res.ok || !res.data) {
    console.error(`  failed to load clients for org ${orgId}: ${res.error || res.status}`)
    return {}
  }
  const map: Record<string, string> = {}
  for (const r of res.data) map[r.slug] = r.id
  return map
}

async function main() {
  const SOLO_ID = '40c4d2e5-79d2-4008-9a97-9c14f94dfd0e'
  const AGENCY_ID = 'd409875b-01d7-4f85-84c8-01c9badbb338'

  console.log('=== Solo demo ===')
  const soloClients = await clientsFor(SOLO_ID)
  await seedSocial({
    orgId: SOLO_ID,
    assignments: [
      { clientId: null, clientName: 'House', platforms: ['instagram', 'linkedin'] },
      { clientId: soloClients['helios-studio'] ?? null, clientName: 'Helios Studio', platforms: ['instagram'] },
    ],
    postCount: 6,
  })

  console.log('\n=== Agency demo ===')
  const agencyClients = await clientsFor(AGENCY_ID)
  await seedSocial({
    orgId: AGENCY_ID,
    assignments: [
      { clientId: null, clientName: 'House', platforms: ['instagram', 'tiktok'] },
      { clientId: agencyClients['helios-studio'] ?? null, clientName: 'Helios Hospitality Group', platforms: ['instagram', 'tiktok'] },
      { clientId: agencyClients['atlas-fintech'] ?? null, clientName: 'Atlas Fintech', platforms: ['instagram', 'linkedin'] },
      { clientId: agencyClients['beacon-school'] ?? null, clientName: 'Beacon School', platforms: ['instagram'] },
    ],
    postCount: 10,
  })

  console.log('\nDone.')
}

main().catch((err) => {
  console.error('Seed failed:', err.message || err)
  process.exit(1)
})
