#!/usr/bin/env npx tsx
/**
 * Add `directus_users.dismissed_app_intros` field for the dismissible
 * per-app intro cards (Stage 3 of the "Me" lens initiative).
 *
 *   pnpm tsx scripts/setup-app-intros-field.ts
 *
 * Stores a flat JSON array of AppId strings (e.g. ["clients", "money"]).
 * Null/undefined means "nothing dismissed" — the code path uses
 * `parseDismissed()` to coerce that into an empty Set, so no backfill
 * migration is needed.
 *
 * Idempotent — re-running treats 400 "already exists" as success.
 */
import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';

if (!TOKEN) {
	console.error('Missing DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN');
	process.exit(1);
}

async function main() {
	console.log(`Target: ${DIRECTUS_URL}`);
	console.log('Creating directus_users.dismissed_app_intros field...');

	const res = await fetch(`${DIRECTUS_URL}/fields/directus_users`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
		body: JSON.stringify({
			field: 'dismissed_app_intros',
			type: 'json',
			meta: {
				interface: 'tags',
				note: 'List of /apps/* intro cards the user has dismissed (Stage 3). Array of AppId strings.',
				special: ['cast-json'],
				options: { presets: ['clients', 'work', 'money', 'marketing', 'organization'] },
			},
			schema: { default_value: null },
		}),
	});

	const text = await res.text();
	if (res.ok) {
		console.log('  created');
	} else if (res.status === 400 && /already exists/i.test(text)) {
		console.log('  already exists, skipping');
	} else {
		console.error(`  error ${res.status}: ${text}`);
		process.exit(1);
	}

	console.log('Done.');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
