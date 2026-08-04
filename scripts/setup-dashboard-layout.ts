#!/usr/bin/env npx tsx
/**
 * Dashboard layout — per-user command-center widget arrangement (show/hide +
 * drag-reorder). Adds ONE nullable, additive JSON field to `ai_preferences`:
 *   - dashboard_layout  (json)  { order: string[], hidden: string[] }
 *
 * `useDashboardLayout` writes localStorage instantly and mirrors to this field
 * (debounced) so a user's arrangement follows them across devices. Missing
 * field just means localStorage-only — the save is isolated in try/catch.
 * Additive + idempotent.
 *
 * Usage: pnpm tsx scripts/setup-dashboard-layout.ts  (then pnpm generate:types)
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

	await addField('dashboard_layout', {
		type: 'json',
		meta: {
			interface: 'input-code',
			options: { language: 'json' },
			note: 'Per-user command-center layout: { order: string[], hidden: string[] } (see useDashboardLayout.ts).',
			width: 'full',
		},
		schema: { is_nullable: true },
	});

	console.log('\nDone. Run `pnpm generate:types` to refresh shared/directus.ts.');
}
main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
