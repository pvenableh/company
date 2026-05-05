#!/usr/bin/env npx tsx
/**
 * Standalone runner for the client-membership migration. Same logic as the
 * `/api/org/migrate-client-memberships` endpoint but uses the admin token
 * directly so it doesn't need a logged-in session.
 *
 *   pnpm tsx scripts/migrate-client-memberships.ts          # dry-run
 *   pnpm tsx scripts/migrate-client-memberships.ts --apply  # write
 *
 * Idempotent. Source rows are NOT deleted.
 */

import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
const APPLY = process.argv.includes('--apply');

if (!DIRECTUS_TOKEN) {
	console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN environment variable is required');
	process.exit(1);
}

async function dx<T = unknown>(path: string, init?: RequestInit) {
	const r = await fetch(`${DIRECTUS_URL}${path}`, {
		...(init || {}),
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${DIRECTUS_TOKEN}`,
			...((init && init.headers) || {}),
		},
	});
	const text = await r.text();
	if (!r.ok) throw new Error(`${r.status}: ${text}`);
	return text ? (JSON.parse(text).data as T) : (null as any);
}

async function main() {
	console.log('==========================================');
	console.log('  client_portal_users — Migration');
	console.log('==========================================');
	console.log(`Target: ${DIRECTUS_URL}`);
	console.log(`Mode:   ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

	const memberships = await dx<any[]>(
		`/items/org_memberships?filter[role][slug][_eq]=client&fields=id,status,invited_at,accepted_at,organization,user,client,invited_by&limit=-1`,
	);
	console.log(`Source: ${memberships.length} client-role org_memberships`);

	const existing = await dx<any[]>(
		`/items/client_portal_users?fields=id,organization,user&limit=-1`,
	);
	console.log(`Existing target rows: ${existing.length}`);

	const key = (org: string, user: string) => `${org}:${user}`;
	const existingSet = new Set<string>(
		existing
			.map((r) => {
				const orgId = typeof r.organization === 'object' ? r.organization?.id : r.organization;
				const userId = typeof r.user === 'object' ? r.user?.id : r.user;
				return orgId && userId ? key(orgId, userId) : null;
			})
			.filter((x): x is string => !!x),
	);

	const toMigrate: any[] = [];
	const skipped: any[] = [];
	const malformed: any[] = [];

	for (const m of memberships) {
		const orgId = typeof m.organization === 'object' ? m.organization?.id : m.organization;
		const userId = typeof m.user === 'object' ? m.user?.id : m.user;
		const clientId = typeof m.client === 'object' ? m.client?.id : m.client;
		const invitedBy = typeof m.invited_by === 'object' ? m.invited_by?.id : m.invited_by;

		if (!orgId || !userId) { malformed.push({ id: m.id, reason: 'missing org or user' }); continue; }
		if (!clientId) { malformed.push({ id: m.id, reason: 'missing client scope' }); continue; }
		if (existingSet.has(key(orgId, userId))) { skipped.push(m.id); continue; }

		toMigrate.push({
			sourceId: m.id,
			payload: {
				organization: orgId,
				user: userId,
				client: clientId,
				status: m.status || 'pending',
				invited_at: m.invited_at || null,
				accepted_at: m.accepted_at || null,
				invited_by: invitedBy || null,
			},
		});
	}

	console.log(`\nWould migrate: ${toMigrate.length}`);
	console.log(`Already migrated (skipped): ${skipped.length}`);
	console.log(`Malformed: ${malformed.length}`);
	if (malformed.length) {
		console.log('\nMalformed details:');
		for (const m of malformed) console.log(`  ${m.id}: ${m.reason}`);
	}
	if (toMigrate.length && !APPLY) {
		console.log('\nFirst payload sample:');
		console.log(JSON.stringify(toMigrate[0].payload, null, 2));
	}

	if (!APPLY) {
		console.log('\n[dry-run] Re-run with --apply to migrate.');
		return;
	}

	let ok = 0;
	let fail = 0;
	for (const row of toMigrate) {
		try {
			await dx(`/items/client_portal_users`, { method: 'POST', body: JSON.stringify(row.payload) });
			ok++;
		} catch (err: any) {
			fail++;
			console.error(`  FAIL ${row.sourceId}: ${err?.message}`);
		}
	}
	console.log(`\nCreated: ${ok}`);
	console.log(`Failed:  ${fail}`);
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
