#!/usr/bin/env npx tsx
/**
 * Add `directus_users.view_lens` field for the "Me" lens toggle on the
 * Command Center (Stage 2 of the "Me" lens initiative).
 *
 *   pnpm tsx scripts/setup-view-lens-field.ts
 *
 * Mirrors the existing `app_palette` / `layout_mode` / `app_rail_position`
 * user-pref fields. Default `me`; valid values are `me`, `org`.
 *
 * Idempotent — re-running is a no-op (the field-create POST returns 400
 * "already exists" which we treat as success).
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
	console.log('Creating directus_users.view_lens field...');

	const res = await fetch(`${DIRECTUS_URL}/fields/directus_users`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
		body: JSON.stringify({
			field: 'view_lens',
			type: 'string',
			meta: {
				interface: 'select-dropdown',
				note: 'Command Center lens preference — controls band emphasis on /. (me | org)',
				options: {
					choices: [
						{ text: 'For me', value: 'me' },
						{ text: 'For org', value: 'org' },
					],
				},
			},
			schema: { default_value: 'me' },
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
