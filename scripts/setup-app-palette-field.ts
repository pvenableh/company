#!/usr/bin/env npx tsx
/**
 * Add `directus_users.app_palette` field for the per-user palette picker.
 *
 *   pnpm tsx scripts/setup-app-palette-field.ts
 *
 * Mirrors the existing `layout_mode` / `app_rail_position` user-pref fields.
 * Default value is `default`; valid values are `default`, `oceanic`, `royal`.
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
	console.log('Creating directus_users.app_palette field...');

	const res = await fetch(`${DIRECTUS_URL}/fields/directus_users`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
		body: JSON.stringify({
			field: 'app_palette',
			type: 'string',
			meta: {
				interface: 'select-dropdown',
				note: 'Per-user palette for the apps shell (default | oceanic | royal).',
				options: {
					choices: [
						{ text: 'Default', value: 'default' },
						{ text: 'Oceanic', value: 'oceanic' },
						{ text: 'Royal', value: 'royal' },
					],
				},
			},
			schema: { default_value: 'default' },
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
