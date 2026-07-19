#!/usr/bin/env npx tsx
/**
 * Add `directus_users.home_mode` — the per-user home surface choice.
 *
 *   pnpm tsx scripts/setup-home-mode-field.ts
 *
 *   presence = the calm, conversational Earnest home (default — calm-first on
 *              login, the command center one gesture away)
 *   classic  = the command-center dashboard (explicit opt-out)
 *
 * Additive + nullable + default 'presence'. Mirrors the `app_palette` /
 * `layout_mode` user-pref fields. (Field first shipped with default 'classic'
 * as an opt-in; flipped to presence-for-all once validated.)
 *
 * Idempotent — a re-run hits the field-exists 400 which we treat as success.
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
	console.log('Creating directus_users.home_mode field...');

	const res = await fetch(`${DIRECTUS_URL}/fields/directus_users`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
		body: JSON.stringify({
			field: 'home_mode',
			type: 'string',
			meta: {
				interface: 'select-dropdown',
				note: 'Home surface: classic command-center dashboard, or the calm conversational Earnest presence home.',
				options: {
					choices: [
						{ text: 'Classic (command center)', value: 'classic' },
						{ text: 'Presence (conversational)', value: 'presence' },
					],
				},
			},
			schema: { default_value: 'presence' },
		}),
	});

	const text = await res.text();
	if (res.ok) console.log('  created');
	else if (res.status === 400 && /already exists/i.test(text)) console.log('  already exists, skipping');
	else { console.error(`  error ${res.status}: ${text}`); process.exit(1); }

	console.log('Done.');
}

main().catch((e) => { console.error(e); process.exit(1); });
