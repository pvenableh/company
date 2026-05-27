#!/usr/bin/env npx tsx
/**
 * Directus — marketing_touches.email_body_html TEXT column.
 *
 * P4 Item C of the Composition Canvas redesign (P4.3). Tiptap stores HTML;
 * markdown was a convenience for the plain-textarea era. New canvas writes
 * land in `email_body_html`. The old `email_body_markdown` column stays
 * one release as a fallback read source — the send path reads
 * `email_body_html ?? markdownToHtml(email_body_markdown)` so unmigrated
 * rows keep rendering until the backfill script runs.
 *
 * Per-target variant lanes (the JSON `body_variants` column added in P4.1b)
 * also gain a `body_html` field. JSON shape change is code-only — no
 * migration on the column itself. See:
 *   scripts/migrate-email-body-markdown-to-html.ts
 *
 * Shape:
 *   marketing_touches.email_body_html    TEXT, nullable
 *
 * Idempotent — re-running is safe.
 *
 * Usage:
 *   pnpm tsx scripts/setup-marketing-touches-email-body-html-column.ts
 *
 * Then:
 *   pnpm generate:types
 *   pnpm tsx scripts/migrate-email-body-markdown-to-html.ts          # dry-run
 *   pnpm tsx scripts/migrate-email-body-markdown-to-html.ts --apply  # commit
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

async function ensureEmailBodyHtmlField(): Promise<'created' | 'skipped' | 'failed'> {
	if (await fieldExists('marketing_touches', 'email_body_html')) {
		console.log('  [skip] marketing_touches.email_body_html already exists');
		return 'skipped';
	}
	const res = await directusRequest('/fields/marketing_touches', 'POST', {
		field: 'email_body_html',
		type: 'text',
		meta: {
			interface: 'input-rich-text-html',
			note: 'Email body as HTML (Tiptap output). New writes from the canvas land here; the legacy email_body_markdown column is kept one release as a fallback read source. See [[project_composition_canvas_redesign]] Item C / P4.3.',
		},
		schema: { is_nullable: true },
	});
	if (!res.ok) {
		console.error(`  [fail] marketing_touches.email_body_html: ${res.error}`);
		return 'failed';
	}
	console.log('  [ok]   marketing_touches.email_body_html created');
	return 'created';
}

async function main() {
	console.log('=========================================');
	console.log('  marketing_touches.email_body_html');
	console.log('=========================================');
	console.log(`Target: ${DIRECTUS_URL}\n`);

	const ping = await directusRequest('/server/info');
	if (!ping.ok) {
		console.error(`Cannot connect to Directus: ${ping.error}`);
		process.exit(1);
	}
	console.log('Connected to Directus\n');

	console.log('--- marketing_touches.email_body_html ---');
	const field = await ensureEmailBodyHtmlField();

	console.log('\n=========================================');
	console.log('  Summary');
	console.log('=========================================');
	console.log(`  email_body_html field: ${field}`);

	if (field === 'failed') process.exit(1);

	console.log('');
	console.log('Done. The marketing_touches policy uses fields=["*"]');
	console.log('so the new column is covered automatically.');
	console.log('');
	console.log('Next:');
	console.log('  pnpm generate:types');
	console.log('  pnpm tsx scripts/migrate-email-body-markdown-to-html.ts          # dry-run');
	console.log('  pnpm tsx scripts/migrate-email-body-markdown-to-html.ts --apply  # commit');
}

main().catch((err) => {
	console.error('Setup failed:', err);
	process.exit(1);
});
