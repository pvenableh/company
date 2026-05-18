#!/usr/bin/env npx tsx
/**
 * Migrate document blocks from the legacy entry shape to the typed shape.
 *
 *   Legacy entry: { block_id, heading, content, page_break_after }
 *   Typed entry:  { id, type, payload, library_ref, page_break_after }
 *
 * Touches:
 *   - proposals.blocks (rewrites JSON array)
 *   - contracts.blocks (rewrites JSON array)
 *   - document_blocks rows (sets type='rich_text' + payload={ heading: name, body_markdown: content })
 *
 * Idempotent: rows already in the typed shape are left alone. Rows where
 * neither shape is recognizable are reported and skipped.
 *
 * Pass --apply to actually write. Default is a dry-run that reports counts.
 *
 *   pnpm tsx scripts/migrate-blocks-to-typed.ts            # dry-run
 *   pnpm tsx scripts/migrate-blocks-to-typed.ts --apply    # write
 */
import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!DIRECTUS_TOKEN) { console.error('DIRECTUS_SERVER_TOKEN required'); process.exit(1); }

const APPLY = process.argv.includes('--apply');

interface LegacyEntry {
	block_id: string | null;
	heading: string | null;
	content: string;
	page_break_after?: boolean;
}
interface TypedEntry {
	id: string;
	type: string;
	payload: Record<string, any>;
	library_ref?: string | null;
	page_break_after?: boolean;
}

function entryId(): string {
	if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
	return `entry_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function isTyped(e: any): e is TypedEntry {
	return !!e && typeof e === 'object' && typeof e.type === 'string' && 'payload' in e;
}

function migrateEntry(e: any): TypedEntry {
	if (isTyped(e)) {
		return {
			id: typeof e.id === 'string' && e.id ? e.id : entryId(),
			type: e.type,
			payload: e.payload || {},
			library_ref: e.library_ref ?? null,
			page_break_after: !!e.page_break_after,
		};
	}
	const legacy = e as LegacyEntry;
	return {
		id: entryId(),
		type: 'rich_text',
		payload: {
			heading: legacy?.heading ?? null,
			body_markdown: typeof legacy?.content === 'string' ? legacy.content : '',
		},
		library_ref: legacy?.block_id ?? null,
		page_break_after: !!legacy?.page_break_after,
	};
}

async function directusRequest<T = unknown>(
	path: string,
	method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
	body?: unknown,
): Promise<{ data: T | null; error: string | null; status: number }> {
	const r = await fetch(`${DIRECTUS_URL}${path}`, {
		method,
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DIRECTUS_TOKEN}` },
		body: body ? JSON.stringify(body) : undefined,
	});
	const text = await r.text();
	if (!r.ok) return { data: null, error: `${r.status}: ${text}`, status: r.status };
	return { data: text ? (JSON.parse(text).data ?? null) : null, error: null, status: r.status };
}

async function fetchAll(collection: string, fields: string[]): Promise<any[]> {
	const all: any[] = [];
	let page = 1;
	const limit = 200;
	while (true) {
		const q = `?fields=${fields.join(',')}&limit=${limit}&page=${page}&sort=id`;
		const { data, error } = await directusRequest<any[]>(`/items/${collection}${q}`);
		if (error) throw new Error(`${collection} fetch failed: ${error}`);
		if (!data || data.length === 0) break;
		all.push(...data);
		if (data.length < limit) break;
		page += 1;
	}
	return all;
}

async function migrateDocumentArray(collection: 'proposals' | 'contracts') {
	console.log(`\n=== ${collection}.blocks ===`);
	const rows = await fetchAll(collection, ['id', 'blocks']);
	let touched = 0;
	let skippedTyped = 0;
	let skippedEmpty = 0;
	for (const row of rows) {
		const blocks = row.blocks;
		if (!Array.isArray(blocks) || blocks.length === 0) {
			skippedEmpty += 1;
			continue;
		}
		const allTyped = blocks.every(isTyped);
		if (allTyped) {
			skippedTyped += 1;
			continue;
		}
		const next = blocks.map(migrateEntry);
		touched += 1;
		if (!APPLY) {
			console.log(`  [dry] ${collection}#${row.id} — ${blocks.length} entries → typed`);
			continue;
		}
		const { error } = await directusRequest(`/items/${collection}/${row.id}`, 'PATCH', { blocks: next });
		if (error) console.error(`  [err] ${collection}#${row.id} — ${error}`);
		else console.log(`  [ok]  ${collection}#${row.id} — ${blocks.length} entries migrated`);
	}
	console.log(`  summary: ${rows.length} rows, ${touched} ${APPLY ? 'migrated' : 'would migrate'}, ${skippedTyped} already typed, ${skippedEmpty} empty`);
}

async function migrateLibrary() {
	console.log('\n=== document_blocks (library rows) ===');
	const rows = await fetchAll('document_blocks', ['id', 'name', 'content', 'type', 'payload']);
	let touched = 0;
	let skippedTyped = 0;
	for (const row of rows) {
		if (row.type && row.payload && typeof row.payload === 'object') {
			skippedTyped += 1;
			continue;
		}
		const payload = { heading: row.name || null, body_markdown: row.content || '' };
		touched += 1;
		if (!APPLY) {
			console.log(`  [dry] document_blocks#${row.id} (${row.name}) → type=rich_text + payload`);
			continue;
		}
		const { error } = await directusRequest(`/items/document_blocks/${row.id}`, 'PATCH', {
			type: 'rich_text',
			payload,
		});
		if (error) console.error(`  [err] document_blocks#${row.id} — ${error}`);
		else console.log(`  [ok]  document_blocks#${row.id} (${row.name}) migrated`);
	}
	console.log(`  summary: ${rows.length} rows, ${touched} ${APPLY ? 'migrated' : 'would migrate'}, ${skippedTyped} already typed`);
}

async function main() {
	console.log('==========================================');
	console.log(`  Migrate blocks to typed shape  ${APPLY ? '(APPLY)' : '(DRY-RUN — pass --apply to write)'}`);
	console.log('==========================================');
	console.log(`Directus URL: ${DIRECTUS_URL}`);
	await migrateDocumentArray('proposals');
	await migrateDocumentArray('contracts');
	await migrateLibrary();
	console.log('\n==========================================');
	console.log('  Done');
	console.log('==========================================');
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
