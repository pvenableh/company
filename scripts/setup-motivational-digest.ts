#!/usr/bin/env npx tsx
/**
 * Motivational digest — per-user "here's your day" email preferences.
 * Adds four nullable, additive fields to `ai_preferences`:
 *   - motivational_digest_enabled   (boolean)  opt-in
 *   - motivational_digest_cadence   (string)   daily | weekdays | weekly | off
 *   - motivational_digest_hour      (integer)  0–23, the user's LOCAL send hour
 *   - motivational_digest_sections  (json)     which content blocks to include
 *
 * Send-time localisation reuses the existing `directus_users.timezone` field.
 * Additive + idempotent.
 *
 * Usage: pnpm tsx scripts/setup-motivational-digest.ts  (then pnpm generate:types)
 */
import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!DIRECTUS_TOKEN) { console.error('Error: DIRECTUS_SERVER_TOKEN required'); process.exit(1); }

async function req(path: string, method = 'GET', body?: unknown) {
	const r = await fetch(`${DIRECTUS_URL}${path}`, {
		method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DIRECTUS_TOKEN}` },
		body: body ? JSON.stringify(body) : undefined,
	});
	return { ok: r.ok, status: r.status, error: r.ok ? null : await r.text().catch(() => '') };
}

async function addField(field: string, spec: Record<string, unknown>) {
	if ((await req(`/fields/ai_preferences/${field}`)).ok) {
		console.log(`  [skip] ai_preferences.${field} already exists`);
		return;
	}
	const res = await req('/fields/ai_preferences', 'POST', { field, ...spec });
	if (!res.ok) { console.error(`  [fail] ${field}: ${res.error}`); process.exit(1); }
	console.log(`  [ok]   ai_preferences.${field} created`);
}

async function main() {
	console.log(`Directus: ${DIRECTUS_URL}\n`);

	await addField('motivational_digest_enabled', {
		type: 'boolean',
		meta: { interface: 'boolean', note: 'Send the daily/weekly motivational digest email.', width: 'half' },
		schema: { default_value: false, is_nullable: true },
	});

	await addField('motivational_digest_cadence', {
		type: 'string',
		meta: {
			interface: 'select-dropdown',
			options: { choices: [
				{ text: 'Every day', value: 'daily' },
				{ text: 'Weekdays only', value: 'weekdays' },
				{ text: 'Weekly (Mondays)', value: 'weekly' },
				{ text: 'Off', value: 'off' },
			] },
			note: 'How often the motivational digest is sent.',
			width: 'half',
		},
		schema: { default_value: 'weekdays', is_nullable: true },
	});

	await addField('motivational_digest_hour', {
		type: 'integer',
		meta: { interface: 'input', note: 'Preferred LOCAL send hour (0–23), evaluated against the user timezone.', width: 'half' },
		schema: { default_value: 7, is_nullable: true },
	});

	await addField('motivational_digest_sections', {
		type: 'json',
		meta: { interface: 'tags', note: 'Which content blocks to include (see shared/digest.ts DIGEST_SECTIONS).', width: 'full' },
		schema: { is_nullable: true },
	});

	console.log('\nDone. Run `pnpm generate:types` to refresh shared/directus.ts.');
}
main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
