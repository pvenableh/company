#!/usr/bin/env npx tsx
/**
 * Migrate marketing_touches email bodies from markdown to HTML.
 *
 * P4.3 Item C of the Composition Canvas redesign. The Tiptap rich-text
 * editor stores HTML; we add `email_body_html` as the canonical column
 * (see scripts/setup-marketing-touches-email-body-html-column.ts) and
 * backfill it here from the legacy `email_body_markdown` column.
 *
 * Idempotent: rows that already have `email_body_html` populated are
 * skipped. Same idempotency rule applies per-lane on the JSON
 * `body_variants` column — a lane that already has `body_html` is left
 * alone; only legacy lanes with `body_markdown` get converted.
 *
 *   pnpm tsx scripts/migrate-email-body-markdown-to-html.ts            # dry-run
 *   pnpm tsx scripts/migrate-email-body-markdown-to-html.ts --apply    # write
 */
import 'dotenv/config';
import { marked } from 'marked';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!DIRECTUS_TOKEN) {
	console.error('DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN required');
	process.exit(1);
}

const APPLY = process.argv.includes('--apply');

marked.setOptions({ gfm: true, breaks: true });

function mdToHtml(md: string | null | undefined): string {
	if (!md) return '';
	try {
		const html = marked.parse(md, { async: false }) as string;
		return html.trim();
	} catch (err) {
		console.warn('  [warn] marked failed; using empty body:', err);
		return '';
	}
}

interface LaneIn {
	subject?: string;
	body_html?: string;
	body_markdown?: string;
}
type VariantsIn = Record<string, LaneIn> | null;
type VariantsOut = Record<string, { subject?: string; body_html: string }>;

/** Returns null if nothing changed; otherwise the rewritten variant
 *  object. Drops the deprecated `body_markdown` field on the way out so
 *  the persisted shape is single-axis. */
function migrateVariants(variants: VariantsIn): VariantsOut | null {
	if (!variants || typeof variants !== 'object') return null;
	let changed = false;
	const out: VariantsOut = {};
	for (const [key, lane] of Object.entries(variants)) {
		if (!lane || typeof lane !== 'object') continue;
		const hasHtml = typeof lane.body_html === 'string' && lane.body_html.length > 0;
		const html = hasHtml ? lane.body_html! : mdToHtml(lane.body_markdown);
		// Anything that wasn't already in single-axis html shape is a
		// change — either we converted from md or we just dropped the
		// legacy field from the persisted shape.
		if (!hasHtml || lane.body_markdown !== undefined) changed = true;
		const next: { subject?: string; body_html: string } = { body_html: html };
		if (typeof lane.subject === 'string') next.subject = lane.subject;
		out[key] = next;
	}
	if (!changed) return null;
	return out;
}

async function directusRequest<T = unknown>(
	path: string,
	method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
	body?: unknown,
): Promise<{ data: T | null; error: string | null; status: number }> {
	const r = await fetch(`${DIRECTUS_URL}${path}`, {
		method,
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${DIRECTUS_TOKEN}`,
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	const txt = await r.text();
	let json: any = {};
	try { json = txt ? JSON.parse(txt) : {}; } catch { /* non-JSON */ }
	return {
		status: r.status,
		data: r.ok ? ((json.data ?? null) as T) : null,
		error: r.ok ? null : txt,
	};
}

interface TouchRow {
	id: number;
	email_body_markdown: string | null;
	email_body_html: string | null;
	body_variants: VariantsIn;
}

async function listTouches(): Promise<TouchRow[]> {
	const out: TouchRow[] = [];
	const PAGE = 200;
	let page = 1;
	for (;;) {
		const res = await directusRequest<TouchRow[]>(
			`/items/marketing_touches?fields=id,email_body_markdown,email_body_html,body_variants&filter[kind][_eq]=email&limit=${PAGE}&page=${page}`,
		);
		if (!res.data) {
			console.error('Touch list failed:', res.error);
			process.exit(1);
		}
		const batch = res.data as TouchRow[];
		out.push(...batch);
		if (batch.length < PAGE) break;
		page++;
	}
	return out;
}

async function main() {
	console.log('=========================================');
	console.log('  marketing_touches: markdown → HTML');
	console.log('=========================================');
	console.log(`Target: ${DIRECTUS_URL}`);
	console.log(`Mode:   ${APPLY ? 'APPLY (will write)' : 'DRY RUN'}\n`);

	const ping = await directusRequest('/server/info');
	if (!ping.data && ping.error) {
		console.error('Cannot connect to Directus:', ping.error);
		process.exit(1);
	}

	const rows = await listTouches();
	console.log(`Found ${rows.length} email touch row(s)\n`);

	let masterUpdates = 0;
	let variantUpdates = 0;
	let skipped = 0;
	let failed = 0;

	for (const row of rows) {
		const patch: Record<string, unknown> = {};

		const needsMaster =
			(!row.email_body_html || row.email_body_html.trim() === '')
			&& !!row.email_body_markdown;
		if (needsMaster) {
			patch.email_body_html = mdToHtml(row.email_body_markdown);
		}

		const nextVariants = migrateVariants(row.body_variants);
		if (nextVariants !== null) {
			patch.body_variants = nextVariants;
		}

		if (Object.keys(patch).length === 0) {
			skipped++;
			continue;
		}

		const tag: string[] = [];
		if ('email_body_html' in patch) tag.push('master');
		if ('body_variants' in patch) tag.push(`${Object.keys(nextVariants!).length} lane(s)`);
		console.log(`  touch ${row.id}: ${tag.join(' + ')}`);

		if ('email_body_html' in patch) masterUpdates++;
		if ('body_variants' in patch) variantUpdates++;

		if (APPLY) {
			const w = await directusRequest(
				`/items/marketing_touches/${row.id}`,
				'PATCH',
				patch,
			);
			if (w.error) {
				console.error(`    [fail] PATCH ${row.id}: ${w.error}`);
				failed++;
			}
		}
	}

	console.log('\n=========================================');
	console.log('  Summary');
	console.log('=========================================');
	console.log(`  Rows scanned:            ${rows.length}`);
	console.log(`  Master backfilled:       ${masterUpdates}`);
	console.log(`  Variants migrated:       ${variantUpdates}`);
	console.log(`  Skipped (already done):  ${skipped}`);
	console.log(`  Failed:                  ${failed}`);
	console.log('');
	if (!APPLY) {
		console.log('Dry run complete. Re-run with --apply to commit.');
	} else {
		console.log('Apply complete.');
	}
}

main().catch((err) => {
	console.error('Migration failed:', err);
	process.exit(1);
});
