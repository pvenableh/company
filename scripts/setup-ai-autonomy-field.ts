#!/usr/bin/env npx tsx
/**
 * Add `directus_users.ai_autonomy_tier` — the per-user Earnest trust dial (0–3).
 *
 *   pnpm tsx scripts/setup-ai-autonomy-field.ts
 *
 * The tier governs how much of Earnest's proposed work auto-runs for THIS user:
 *   0 = ask me everything (default — the current behavior, nothing auto-runs)
 *   1 = handle the small stuff (reversible additions)
 *   2 = draft freely (also structural creates)
 *   3 = full partner (most, but email / money / meetings ALWAYS stay gated)
 *
 * Additive + nullable + default 0, so existing users are unaffected until they
 * turn the dial. Mirrors the `app_palette` / `layout_mode` user-pref fields.
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
	console.log('Creating directus_users.ai_autonomy_tier field...');

	const res = await fetch(`${DIRECTUS_URL}/fields/directus_users`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
		body: JSON.stringify({
			field: 'ai_autonomy_tier',
			type: 'integer',
			meta: {
				interface: 'select-dropdown',
				note: "Earnest trust dial: how much of Earnest's proposed work auto-runs for this user (0 ask everything … 3 full partner; email/money/meetings always stay gated).",
				options: {
					choices: [
						{ text: '0 — Ask me everything', value: 0 },
						{ text: '1 — Handle the small stuff', value: 1 },
						{ text: '2 — Draft freely', value: 2 },
						{ text: '3 — Full partner', value: 3 },
					],
				},
			},
			schema: { default_value: 0 },
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

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
