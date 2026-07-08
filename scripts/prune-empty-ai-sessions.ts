// scripts/prune-empty-ai-sessions.ts
/**
 * Delete `ai_chat_sessions` rows that have ZERO `ai_chat_messages`.
 *
 * These accumulate from testing / abandoned opens: the session row (and its
 * title, derived from the first message) is written, but no messages ended up
 * persisted — so the history browser lists them and they load to an empty
 * state. They carry no content, so pruning is lossless.
 *
 * Dry run: `tsx scripts/prune-empty-ai-sessions.ts`
 * Commit:  `tsx scripts/prune-empty-ai-sessions.ts --apply`
 */

import { createDirectus, rest, staticToken, readItems, deleteItem } from '@directus/sdk';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'https://admin.earnest.guru';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_TOKEN;

if (!DIRECTUS_TOKEN) {
	console.error('DIRECTUS_SERVER_TOKEN (or DIRECTUS_TOKEN) not set');
	process.exit(1);
}

const apply = process.argv.includes('--apply');
const directus = createDirectus(DIRECTUS_URL).with(rest()).with(staticToken(DIRECTUS_TOKEN));

/** Read every row of a collection in pages (Directus caps page size at ~ limit). */
async function readAll<T = any>(collection: string, fields: string[]): Promise<T[]> {
	const PAGE = 500;
	const out: T[] = [];
	for (let page = 1; ; page++) {
		const rows = (await directus.request(
			readItems(collection as any, { fields: fields as any, limit: PAGE, page }),
		)) as T[];
		out.push(...rows);
		if (rows.length < PAGE) break;
	}
	return out;
}

async function main() {
	console.log(`\nPrune empty ai_chat_sessions — ${apply ? 'APPLY' : 'DRY RUN'}\n`);

	// 1. Every session (id + a little context for the report).
	const sessions = await readAll<{ id: string | number; title: string | null; user: string | null; status: string | null; date_updated: string | null }>(
		'ai_chat_sessions',
		['id', 'title', 'user', 'status', 'date_updated'],
	);

	// 2. The set of session ids that actually have ≥1 message.
	const messages = await readAll<{ session: string | number | null }>('ai_chat_messages', ['session']);
	const hasMessages = new Set<string>();
	for (const m of messages) {
		if (m.session != null) hasMessages.add(String(m.session));
	}

	const empty = sessions.filter((s) => !hasMessages.has(String(s.id)));

	console.log(`Total sessions:     ${sessions.length}`);
	console.log(`With messages:      ${sessions.length - empty.length}`);
	console.log(`Empty (to prune):   ${empty.length}\n`);

	if (!empty.length) {
		console.log('Nothing to prune. ✅\n');
		return;
	}

	for (const s of empty) {
		console.log(`  - #${s.id}  ${(s.title || '(untitled)').slice(0, 50).padEnd(50)}  ${s.date_updated || ''}`);
	}
	console.log('');

	if (!apply) {
		console.log('Dry run — re-run with --apply to delete these.\n');
		return;
	}

	let deleted = 0;
	const failures: Array<{ id: string | number; error: string }> = [];
	for (const s of empty) {
		try {
			await directus.request(deleteItem('ai_chat_sessions' as any, s.id as any));
			deleted++;
		} catch (e: any) {
			failures.push({ id: s.id, error: e?.errors?.[0]?.message || e?.message || String(e) });
		}
	}

	console.log(`\nDeleted ${deleted}/${empty.length} empty sessions.`);
	if (failures.length) {
		console.log(`\n${failures.length} could not be deleted (likely referenced by an ai_action):`);
		for (const f of failures) console.log(`  - #${f.id}: ${f.error}`);
	}
	console.log('');
}

main().catch((e) => {
	console.error('Prune failed:', e);
	process.exit(1);
});
