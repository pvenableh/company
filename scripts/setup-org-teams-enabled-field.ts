#!/usr/bin/env npx tsx
/**
 * organizations.teams_enabled — per-org control over whether the Teams feature
 * is surfaced in the UI. Solo/small orgs that never group their members can
 * turn it off to hide the clutter (the "All teams" selector, team fields in
 * ticket/task forms, the org Teams floor, list team chips, etc).
 *
 * Opt-OUT: default `true` so orgs already using teams aren't disrupted — only
 * an explicit `false` hides the feature. `null`/`undefined` counts as ENABLED
 * (mirrors `goals_enabled`; contrast `weather_enabled`, which is opt-in/false).
 *
 * Read client-side via `useOrganization.js` → `useTeamsEnabled()`. This only
 * hides UI; team values already stored on tickets/projects are preserved on
 * save, so re-enabling brings everything back untouched.
 *
 * Additive + idempotent. Run:  pnpm tsx scripts/setup-org-teams-enabled-field.ts
 * Then:                        pnpm generate:types
 */
import 'dotenv/config';

const DIRECTUS_URL = (process.env.DIRECTUS_URL || 'http://localhost:8055').replace(/\/$/, '');
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!TOKEN) {
	console.error('DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN required');
	process.exit(1);
}

const COLLECTION = 'organizations';

async function req(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown) {
	const r = await fetch(`${DIRECTUS_URL}${path}`, {
		method,
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
		body: body ? JSON.stringify(body) : undefined,
	});
	return { ok: r.ok, status: r.status, text: await r.text() };
}

async function fieldExists(field: string): Promise<boolean> {
	const { ok } = await req(`/fields/${COLLECTION}/${field}`);
	return ok;
}

async function addField(field: string, payload: unknown) {
	if (await fieldExists(field)) {
		console.log(`  ✓ ${COLLECTION}.${field} already exists`);
		return;
	}
	const { ok, text } = await req(`/fields/${COLLECTION}`, 'POST', payload);
	if (!ok && !/exists/i.test(text)) {
		console.error(`  ✗ ${field} create failed: ${text}`);
		process.exit(1);
	}
	console.log(`  + ${COLLECTION}.${field} created`);
}

async function main() {
	console.log(`\n── ${COLLECTION} teams_enabled field ──\n`);
	console.log(`Directus: ${DIRECTUS_URL}\n`);

	await addField('teams_enabled', {
		field: 'teams_enabled',
		type: 'boolean',
		meta: {
			interface: 'boolean',
			note: 'Show the Teams feature (team selectors, team fields, the org Teams floor). Off = hide it for solo/small orgs. On by default.',
			width: 'half',
			options: { label: 'Teams enabled for this org' },
		},
		schema: { default_value: true, is_nullable: true },
	});

	console.log('\n── Done ──\n');
	console.log('Next: pnpm generate:types');
}

main().catch((err) => {
	console.error('Setup failed:', err);
	process.exit(1);
});
