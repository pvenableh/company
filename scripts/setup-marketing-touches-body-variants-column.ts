#!/usr/bin/env npx tsx
/**
 * Directus — marketing_touches.body_variants JSON column.
 *
 * P4 Item A.2 of the Composition Canvas redesign. Per-target variants
 * for the email body + subject. Keyed by the target's stable id
 * (`list:<int>` or `segment:<filter>`); each value is
 * `{ subject?: string; body_markdown: string }`.
 *
 * Normalization rule (enforced on write by the marketing touches POST +
 * PATCH handlers): a lane is dropped when its body matches the master
 * AND either subject is undefined or matches the master subject.
 * Drop-empty-lanes means the column stays NULL in the common case
 * (touch with one target, no forks).
 *
 * Send path reads `body_variants[targetKeyOf(recipient.sourceTarget)] ??
 * { subject: master_subject, body_markdown: master_body }` when fanning
 * out — see `shared/composition.ts` for `targetKeyOf`.
 *
 * Shape:
 *   marketing_touches.body_variants    JSON, nullable
 *
 * Idempotent — re-running is safe.
 *
 * Usage:
 *   pnpm tsx scripts/setup-marketing-touches-body-variants-column.ts
 *
 * Then:
 *   pnpm generate:types
 */

import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';

if (!DIRECTUS_TOKEN) {
	console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN env var is required');
	process.exit(1);
}

async function directusRequest<T = unknown>(
	path: string,
	method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
	body?: unknown,
): Promise<{ ok: boolean; status: number; data: T | null; error: string | null }> {
	const response = await fetch(`${DIRECTUS_URL}${path}`, {
		method,
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${DIRECTUS_TOKEN}`,
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	const text = await response.text();
	let json: any = {};
	try { json = text ? JSON.parse(text) : {}; } catch { /* non-JSON */ }
	return {
		ok: response.ok,
		status: response.status,
		data: response.ok ? ((json.data ?? null) as T) : null,
		error: response.ok ? null : text,
	};
}

async function fieldExists(collection: string, field: string): Promise<boolean> {
	const res = await directusRequest(`/fields/${collection}/${field}`);
	return res.ok;
}

async function ensureBodyVariantsField(): Promise<'created' | 'skipped' | 'failed'> {
	if (await fieldExists('marketing_touches', 'body_variants')) {
		console.log('  [skip] marketing_touches.body_variants already exists');
		return 'skipped';
	}
	const res = await directusRequest('/fields/marketing_touches', 'POST', {
		field: 'body_variants',
		type: 'json',
		meta: {
			interface: 'input-code',
			options: { language: 'json' },
			note: 'Per-target subject + body variants. Keyed by `list:<id>` or `segment:<filter>`. Null when the touch has no forks. See [[project_composition_canvas_redesign]] Item A.2.',
		},
		schema: { is_nullable: true },
	});
	if (!res.ok) {
		console.error(`  [fail] marketing_touches.body_variants: ${res.error}`);
		return 'failed';
	}
	console.log('  [ok]   marketing_touches.body_variants created');
	return 'created';
}

async function main() {
	console.log('=========================================');
	console.log('  marketing_touches.body_variants');
	console.log('=========================================');
	console.log(`Target: ${DIRECTUS_URL}\n`);

	const ping = await directusRequest('/server/info');
	if (!ping.ok) {
		console.error(`Cannot connect to Directus: ${ping.error}`);
		process.exit(1);
	}
	console.log('Connected to Directus\n');

	console.log('--- marketing_touches.body_variants ---');
	const field = await ensureBodyVariantsField();

	console.log('\n=========================================');
	console.log('  Summary');
	console.log('=========================================');
	console.log(`  body_variants field: ${field}`);

	if (field === 'failed') process.exit(1);

	console.log('');
	console.log('Done. The marketing_touches policy uses fields=["*"]');
	console.log('so the new column is covered automatically.');
	console.log('');
	console.log('Next: pnpm generate:types');
}

main().catch((err) => {
	console.error('Setup failed:', err);
	process.exit(1);
});
