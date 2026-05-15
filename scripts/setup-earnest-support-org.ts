#!/usr/bin/env npx tsx
/**
 * Earnest — internal bug/feedback inbox org.
 *
 * Creates (or upgrades) the dedicated "Earnest" organization that
 * receives every ticket submitted through the Help → Report-a-bug menu in
 * the app. Reuses the existing `tickets` collection so kanban, statuses,
 * comments, and AI context all work out of the box.
 *
 * Why a dedicated org (not a Hue client):
 *   - Keeps the internal feedback inbox isolated from any real client work.
 *   - Cross-tenant submissions land in one place regardless of reporter org.
 *
 * The script:
 *   1. Find-or-creates the org by `code=ERN` / `slug=earnest`.
 *   2. Seeds the five system org_roles via ensureRoles().
 *   3. Adds the owner (defaults to peter@huestudios.com) as an Owner member.
 *   4. Prints the org UUID — paste into Vercel env as EARNEST_SUPPORT_ORG_ID.
 *
 * Idempotent — safe to re-run.
 *
 *   pnpm tsx scripts/setup-earnest-support-org.ts
 *   EARNEST_SUPPORT_OWNER_EMAIL=peter@huestudios.com pnpm tsx scripts/setup-earnest-support-org.ts
 */

import 'dotenv/config';
import {
	assertDirectusToken,
	directusRequest,
	findOne,
	findOrCreate,
	ensureRoles,
	ensureMembership,
} from './lib/demo-seed';

const SUPPORT_ORG_NAME = 'Earnest';
const SUPPORT_ORG_SLUG = 'earnest';
const SUPPORT_ORG_SHORT = 'Earnest';
const SUPPORT_ORG_CODE = 'ERN';
const OWNER_EMAIL = process.env.EARNEST_SUPPORT_OWNER_EMAIL || 'peter@huestudios.com';

async function ensureSupportOrg(): Promise<any | null> {
	const existing =
		(await findOne<any>('organizations', { slug: { _eq: SUPPORT_ORG_SLUG } })) ||
		(await findOne<any>('organizations', { code: { _eq: SUPPORT_ORG_CODE } })) ||
		(await findOne<any>('organizations', { name: { _eq: SUPPORT_ORG_NAME } }));

	if (existing) {
		console.log(`  [skip] org "${SUPPORT_ORG_NAME}" (id=${existing.id})`);
		await directusRequest(`/items/organizations/${existing.id}`, 'PATCH', {
			name: SUPPORT_ORG_NAME,
			slug: SUPPORT_ORG_SLUG,
			short_name: SUPPORT_ORG_SHORT,
			code: SUPPORT_ORG_CODE,
			status: 'published',
			active: true,
		});
		return existing;
	}

	const res = await directusRequest<any>('/items/organizations', 'POST', {
		name: SUPPORT_ORG_NAME,
		slug: SUPPORT_ORG_SLUG,
		short_name: SUPPORT_ORG_SHORT,
		code: SUPPORT_ORG_CODE,
		status: 'published',
		active: true,
		plan: 'enterprise',
		notes: 'Internal bug/feedback inbox. Tickets submitted via Help → Report a bug land here.',
	});
	if (!res.ok) {
		console.error(`  [fail] create org: ${res.error}`);
		return null;
	}
	console.log(`  [ok]   org "${SUPPORT_ORG_NAME}" (id=${(res.data as any)?.id})`);
	return res.data;
}

async function findUserByEmail(email: string): Promise<any | null> {
	const qs = `filter=${encodeURIComponent(JSON.stringify({ email: { _eq: email } }))}&limit=1`;
	const res = await directusRequest<any[]>(`/users?${qs}`);
	if (res.ok && Array.isArray(res.data) && res.data.length > 0) return res.data[0];
	return null;
}

async function main() {
	assertDirectusToken();

	console.log(`Earnest org bootstrap (owner: ${OWNER_EMAIL})`);

	const org = await ensureSupportOrg();
	if (!org) process.exit(1);

	console.log('Seeding org_roles ...');
	const roles = await ensureRoles(org.id);
	if (!roles.owner) {
		console.error('  [fail] owner role not seeded');
		process.exit(1);
	}

	console.log(`Finding owner user (${OWNER_EMAIL}) ...`);
	const owner = await findUserByEmail(OWNER_EMAIL);
	if (!owner) {
		console.error(`  [fail] No directus_users row found for ${OWNER_EMAIL}. Create the user first.`);
		process.exit(1);
	}
	console.log(`  [ok]   owner user (id=${owner.id})`);

	console.log('Creating owner membership ...');
	await ensureMembership(org.id, owner.id, roles.owner, `owner ${OWNER_EMAIL}`);

	console.log('');
	console.log('────────────────────────────────────────────────────────────');
	console.log(`  EARNEST_SUPPORT_ORG_ID=${org.id}`);
	console.log('────────────────────────────────────────────────────────────');
	console.log('  Paste the line above into Vercel env (dev + preview + prod)');
	console.log('  and your local .env so /api/support/submit can route tickets.');
	console.log('');
}

main().catch((err) => {
	console.error('Fatal:', err);
	process.exit(1);
});
