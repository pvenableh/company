#!/usr/bin/env npx tsx
/**
 * agency_ratings — collection + permissions
 *
 * Private client→agency feedback (a client rating the agency that serves them).
 * Rows are written by /api/portal/agency-rating on the ADMIN token (org/client/
 * user set from the verified portal context — so no client create-perm is
 * granted; portal users can't POST arbitrary rows through the generic proxy)
 * and read by org staff/admins only — never public, never cross-org.
 *
 * Fields: organization, client, user (uuid), rating (1–5 int), comment (text),
 * status, + date_created/user_created specials.
 *
 *   pnpm tsx scripts/setup-agency-ratings.ts          # dry-run
 *   pnpm tsx scripts/setup-agency-ratings.ts --apply  # write
 *
 * Idempotent: skips the collection + perm if already present.
 */

import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
const APPLY = process.argv.includes('--apply');
const CLIENT_POLICY_ID = 'cdadd1fd-280e-4d4a-83e6-1b911889af46';

if (!DIRECTUS_TOKEN) { console.error('Need DIRECTUS_SERVER_TOKEN'); process.exit(1); }

async function req<T = any>(path: string, method = 'GET', body?: unknown) {
	const res = await fetch(`${DIRECTUS_URL}${path}`, {
		method,
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DIRECTUS_TOKEN}` },
		body: body ? JSON.stringify(body) : undefined,
	});
	const text = await res.text();
	if (!res.ok) return { data: null as T | null, error: `${res.status}: ${text}` };
	return { data: (text ? JSON.parse(text).data : null) as T | null, error: null as string | null };
}

const COLLECTION = 'agency_ratings';

async function main() {
	console.log(`agency_ratings setup — ${APPLY ? 'APPLY' : 'DRY-RUN'} · ${DIRECTUS_URL}`);

	const { data: existing } = await req(`/collections/${COLLECTION}`);
	if (existing) {
		console.log('  [skip] collection already exists');
	} else if (!APPLY) {
		console.log('  [would] create collection agency_ratings + fields');
	} else {
		const { error } = await req('/collections', 'POST', {
			collection: COLLECTION,
			meta: { icon: 'star', note: 'Private client→agency feedback (NPS/CSAT).', hidden: false, singleton: false },
			schema: {},
			fields: [
				{ field: 'id', type: 'integer', meta: { hidden: true, interface: 'input', readonly: true }, schema: { is_primary_key: true, has_auto_increment: true } },
				{ field: 'status', type: 'string', schema: { default_value: 'published' }, meta: { interface: 'select-dropdown', options: { choices: [{ text: 'Published', value: 'published' }, { text: 'Archived', value: 'archived' }] }, width: 'half' } },
				{ field: 'organization', type: 'uuid', meta: { interface: 'input', width: 'half', note: 'Org being rated' } },
				{ field: 'client', type: 'uuid', meta: { interface: 'input', width: 'half', note: 'Rating client' } },
				{ field: 'user', type: 'uuid', meta: { interface: 'input', width: 'half', note: 'Portal user who rated' } },
				{ field: 'rating', type: 'integer', meta: { interface: 'input', width: 'half', note: '1–5' } },
				{ field: 'comment', type: 'text', meta: { interface: 'input-multiline' } },
				{ field: 'date_created', type: 'timestamp', meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true, width: 'half' }, schema: {} },
				{ field: 'user_created', type: 'uuid', meta: { special: ['user-created'], interface: 'select-dropdown-m2o', readonly: true, hidden: true, width: 'half' }, schema: {} },
			],
		});
		if (error) { console.error(`  [fail] collection: ${error}`); process.exit(1); }
		console.log('  [ok] collection created');
	}
	// No portal create-perm: /api/portal/agency-rating writes on the admin token.
}

main().catch((e) => { console.error(e); process.exit(1); });
