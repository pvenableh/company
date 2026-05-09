#!/usr/bin/env npx tsx
/**
 * Apps Layout Phase 1 — schema setup
 *
 * Adds two per-user preference columns the Apps Layout shell reads:
 *
 *   directus_users.layout_mode        string, 'classic' | 'apps', default 'classic'
 *   directus_users.app_rail_position  string, 'left' | 'top' | 'bottom' | 'right' | 'floating', default 'left'
 *
 * Both default to legacy classic behaviour, so no backfill is needed —
 * existing users keep what they have today.
 *
 *   pnpm tsx scripts/setup-apps-layout-fields.ts
 *
 * Idempotent: re-running is safe.
 */
import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!DIRECTUS_TOKEN) { console.error('DIRECTUS_SERVER_TOKEN required'); process.exit(1); }

async function directusRequest(
	path: string,
	method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
	body?: unknown,
): Promise<{ error: string | null }> {
	const r = await fetch(`${DIRECTUS_URL}${path}`, {
		method,
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DIRECTUS_TOKEN}` },
		body: body ? JSON.stringify(body) : undefined,
	});
	const text = await r.text();
	if (!r.ok) {
		if (r.status === 400 && /already exists/i.test(text)) return { error: 'already_exists' };
		return { error: `${r.status}: ${text}` };
	}
	return { error: null };
}

async function createField(collection: string, field: Record<string, any>) {
	console.log(`  ${collection}.${field.field}`);
	const { error } = await directusRequest(`/fields/${collection}`, 'POST', field);
	if (error === 'already_exists') {
		console.log('    -> Already exists');
		return;
	}
	if (error) {
		console.error('    -> Error:', error);
		process.exit(1);
	}
	console.log('    -> Created');
}

async function main() {
	console.log('=== Apps Layout — schema setup ===');

	await createField('directus_users', {
		field: 'layout_mode',
		type: 'string',
		meta: {
			interface: 'select-dropdown',
			options: {
				choices: [
					{ text: 'Classic', value: 'classic' },
					{ text: 'Apps', value: 'apps' },
				],
			},
			note: 'Personal navigation shell. Classic = sidebar + hats; Apps = department-store rail.',
			width: 'half',
		},
		schema: { default_value: 'classic', is_nullable: false },
	});

	await createField('directus_users', {
		field: 'app_rail_position',
		type: 'string',
		meta: {
			interface: 'select-dropdown',
			options: {
				choices: [
					{ text: 'Left', value: 'left' },
					{ text: 'Top', value: 'top' },
					{ text: 'Right', value: 'right' },
					{ text: 'Bottom', value: 'bottom' },
					{ text: 'Floating', value: 'floating' },
				],
			},
			note: 'Apps mode rail placement. Ignored in classic.',
			width: 'half',
		},
		schema: { default_value: 'left', is_nullable: false },
	});

	console.log('Done.');
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
