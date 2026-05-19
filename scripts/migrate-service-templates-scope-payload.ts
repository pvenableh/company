#!/usr/bin/env npx tsx
/**
 * Migrate service_templates from free-text `scope_template` to structured
 * `scope_payload: ScopeTreePayload` (reuses the typed-block scope_tree
 * primitive shipped in step 3 of the document-system overhaul).
 *
 * What this does:
 *   1. Adds the `scope_payload` field to the collection if missing.
 *   2. For each row with a non-empty `scope_template` and an empty / null
 *      `scope_payload`, builds a one-phase ScopeTreePayload using the
 *      markdown text as the phase summary. Lets existing copy survive
 *      the transition without re-typing — users can then split it into
 *      phases inline.
 *   3. Hides the `scope_template` field on the Directus admin UI so it
 *      stops being the default authoring surface there.
 *
 * Idempotent. Pass --apply to actually write — default is a dry-run.
 *
 *   pnpm tsx scripts/migrate-service-templates-scope-payload.ts          # dry-run
 *   pnpm tsx scripts/migrate-service-templates-scope-payload.ts --apply  # write
 */
import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!DIRECTUS_TOKEN) { console.error('DIRECTUS_SERVER_TOKEN required'); process.exit(1); }

const APPLY = process.argv.includes('--apply');

interface ScopeTreeNode {
	id: string;
	heading: string;
	summary?: string | null;
	bullets?: string[];
	note?: string | null;
	hours?: number | null;
	fee?: number | null;
	deliverables?: string[];
	show_hours?: boolean;
	show_fee?: boolean;
	show_deliverables?: boolean;
	children?: ScopeTreeNode[];
}
interface ScopeTreePayload {
	numbering_style?: 'phase_word' | 'phase_number' | 'decimal' | 'none';
	phases: ScopeTreeNode[];
}

function nodeId(): string {
	if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
	return `phase_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
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
	if (!r.ok) {
		if (r.status === 409) return { data: null, error: 'already_exists', status: r.status };
		if (r.status === 400 && /already exists|already has an associated/i.test(text)) {
			return { data: null, error: 'already_exists', status: r.status };
		}
		return { data: null, error: `${r.status}: ${text}`, status: r.status };
	}
	try { return { data: text ? JSON.parse(text).data ?? null : null, error: null, status: r.status }; }
	catch { return { data: null, error: 'parse_error', status: r.status }; }
}

async function ensureField() {
	console.log('• Ensuring service_templates.scope_payload field exists…');
	const r = await directusRequest('/fields/service_templates', 'POST', {
		field: 'scope_payload', type: 'json',
		meta: {
			special: ['cast-json'],
			interface: 'input-code',
			options: { language: 'JSON', lineNumber: true },
			note: 'Structured ScopeTreePayload — phased deliverables editable in-app via ScopeTreeEditor. Replaces free-text scope_template.',
		},
		schema: {},
	});
	if (r.error === 'already_exists') { console.log('  → field already present'); return; }
	if (r.error) { console.error('  → ERROR:', r.error); process.exit(1); }
	console.log('  → created');
}

async function hideLegacyField() {
	console.log('• Hiding legacy service_templates.scope_template in Directus admin…');
	// PATCH the field meta to set hidden=true and update the note.
	const r = await directusRequest('/fields/service_templates/scope_template', 'PATCH', {
		meta: {
			interface: 'input-rich-text-md',
			hidden: true,
			note: 'Legacy free-text scope. Superseded by scope_payload (structured ScopeTreePayload). Kept read-only for back-compat on rows pre-dating the typed-block migration.',
		},
	});
	if (r.error) { console.warn('  → could not hide (non-fatal):', r.error); return; }
	console.log('  → hidden');
}

function buildSeedPayload(scopeTemplate: string): ScopeTreePayload {
	// Single phase that carries the legacy markdown forward as the phase's
	// intro summary. The user can then split it into proper phases inline
	// using the editor.
	return {
		numbering_style: 'phase_word',
		phases: [
			{
				id: nodeId(),
				heading: 'Scope',
				summary: scopeTemplate.trim(),
				bullets: [],
				note: null,
				hours: null,
				fee: null,
				deliverables: [],
				show_hours: false,
				show_fee: false,
				show_deliverables: false,
				children: [],
			},
		],
	};
}

function payloadIsEmpty(p: any): boolean {
	if (p == null) return true;
	if (typeof p !== 'object') return true;
	if (!Array.isArray(p.phases)) return true;
	return p.phases.length === 0;
}

async function backfillRows() {
	console.log('• Scanning service_templates rows…');
	const r = await directusRequest<any[]>(
		'/items/service_templates?fields=id,organization,name,scope_template,scope_payload&limit=-1',
	);
	if (r.error || !r.data) {
		console.error('  → read error:', r.error);
		process.exit(1);
	}
	const rows = r.data;
	console.log(`  → ${rows.length} rows found`);
	let toBackfill = 0;
	let skippedAlreadyTyped = 0;
	let skippedEmpty = 0;
	const updates: Array<{ id: string | number; payload: ScopeTreePayload; name: string }> = [];
	for (const row of rows) {
		const hasPayload = !payloadIsEmpty(row.scope_payload);
		if (hasPayload) { skippedAlreadyTyped++; continue; }
		const text = (row.scope_template || '').trim();
		if (!text) { skippedEmpty++; continue; }
		updates.push({ id: row.id, payload: buildSeedPayload(text), name: row.name || '(unnamed)' });
		toBackfill++;
	}
	console.log(`  → already typed: ${skippedAlreadyTyped}`);
	console.log(`  → empty (no scope_template): ${skippedEmpty}`);
	console.log(`  → to backfill: ${toBackfill}`);

	if (toBackfill === 0) { console.log('  → nothing to backfill'); return; }

	if (!APPLY) {
		console.log('\nDry-run — no writes performed. Re-run with --apply to backfill.');
		for (const u of updates.slice(0, 5)) {
			console.log(`    • ${u.name} (id=${u.id}) — ${u.payload.phases[0].summary?.slice(0, 60)}…`);
		}
		if (updates.length > 5) console.log(`    … +${updates.length - 5} more`);
		return;
	}

	console.log('\n• Writing scope_payload backfills…');
	for (const u of updates) {
		const w = await directusRequest(`/items/service_templates/${u.id}`, 'PATCH', { scope_payload: u.payload });
		if (w.error) console.warn(`  → FAILED ${u.id} (${u.name}):`, w.error);
		else console.log(`  → ${u.id} (${u.name})`);
	}
}

async function main() {
	console.log('==========================================');
	console.log('  service_templates.scope_payload — Migrate');
	console.log('==========================================');
	console.log(`Directus URL: ${DIRECTUS_URL}`);
	console.log(`Mode: ${APPLY ? 'APPLY (writing)' : 'DRY-RUN'}\n`);
	await ensureField();
	await hideLegacyField();
	await backfillRows();
	console.log('\n==========================================');
	console.log('  Done');
	console.log('==========================================');
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
