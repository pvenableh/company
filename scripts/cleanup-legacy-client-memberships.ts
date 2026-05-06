#!/usr/bin/env npx tsx
/**
 * Delete legacy `org_memberships` rows whose role.slug = 'client'
 * AND that have a matching `client_portal_users` row (same user + org).
 *
 * The legacy rows are dead weight — Session 24 split portal users into the
 * dedicated `client_portal_users` collection. Any remaining role='client'
 * org_memberships are duplicates that confuse `useOrgRole` and the
 * portal/staff middleware split.
 *
 * Rows WITHOUT a matching portal row are left alone — those need a human
 * decision (e.g. malformed legacy data, missing client FK).
 *
 *   pnpm tsx scripts/cleanup-legacy-client-memberships.ts            # dry-run
 *   pnpm tsx scripts/cleanup-legacy-client-memberships.ts --apply    # delete
 *
 * Idempotent: re-running is a no-op once the matched rows are gone.
 */

import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
const APPLY = process.argv.includes('--apply');

if (!DIRECTUS_TOKEN) {
	console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN environment variable is required');
	process.exit(1);
}

async function req<T = any>(
	path: string,
	method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
	body?: unknown,
): Promise<{ data: T | null; error: string | null }> {
	const response = await fetch(`${DIRECTUS_URL}${path}`, {
		method,
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${DIRECTUS_TOKEN}`,
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	const text = await response.text();
	if (!response.ok) return { data: null, error: `${response.status}: ${text}` };
	const json = text ? JSON.parse(text) : {};
	return { data: json.data ?? null, error: null };
}

async function main() {
	console.log('==========================================');
	console.log(`  Cleanup legacy client memberships ${APPLY ? '(APPLY)' : '(dry-run)'}`);
	console.log('==========================================');
	console.log(`Directus URL: ${DIRECTUS_URL}`);

	const memRes = await req<any[]>(
		'/items/org_memberships?filter[role][slug][_eq]=client&fields=id,user.id,user.email,organization.id,organization.name&limit=-1',
	);
	if (memRes.error) {
		console.error('Failed to fetch memberships:', memRes.error);
		process.exit(1);
	}
	const legacy = memRes.data ?? [];

	const portalRes = await req<any[]>(
		'/items/client_portal_users?fields=id,user,organization&limit=-1',
	);
	if (portalRes.error) {
		console.error('Failed to fetch portal users:', portalRes.error);
		process.exit(1);
	}
	const portalKey = new Set(
		(portalRes.data ?? []).map((r: any) => {
			const u = typeof r.user === 'object' ? r.user.id : r.user;
			const o = typeof r.organization === 'object' ? r.organization.id : r.organization;
			return `${u}::${o}`;
		}),
	);

	const matched: any[] = [];
	const unmatched: any[] = [];
	for (const m of legacy) {
		const u = m.user?.id;
		const o = m.organization?.id;
		if (!u || !o) {
			unmatched.push(m);
			continue;
		}
		if (portalKey.has(`${u}::${o}`)) matched.push(m);
		else unmatched.push(m);
	}

	console.log(`\nLegacy 'client' memberships:    ${legacy.length}`);
	console.log(`  Matched (deleting):           ${matched.length}`);
	console.log(`  Unmatched (skipping):         ${unmatched.length}`);

	if (unmatched.length) {
		console.log('\nUnmatched rows (left alone — need human decision):');
		for (const m of unmatched) {
			console.log(`  - ${m.user?.email ?? m.user?.id ?? '<no user>'} → ${m.organization?.name ?? '<no org>'}  [mem ${m.id}]`);
		}
	}

	if (!APPLY) {
		console.log('\n(dry-run) — re-run with --apply to delete the matched rows.');
		return;
	}

	if (matched.length === 0) {
		console.log('\nNothing to delete.');
		return;
	}

	console.log(`\nDeleting ${matched.length} rows…`);
	const ids = matched.map((m) => m.id);
	const { error } = await req('/items/org_memberships', 'DELETE', { keys: ids });
	if (error) {
		console.error('Delete failed:', error);
		process.exit(1);
	}
	console.log('  -> done');
}

main().catch((err) => {
	console.error('Fatal:', err);
	process.exit(1);
});
