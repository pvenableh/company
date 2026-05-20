#!/usr/bin/env npx tsx
/**
 * Drop the drained legacy `project_tasks` collection (plus its
 * `project_tasks_watchers` junction).
 *
 * Run `scripts/migrate-project-tasks-to-tasks.ts --apply` FIRST. That migration
 * copies every project_tasks row into the richer `tasks` collection. After a
 * soak window confirming nothing new is written here, this script:
 *
 *   1. Repoints the `project_events.tasks` reverse-o2m alias from
 *      `project_tasks.event_id` → `tasks.project_event_id` so existing
 *      consumers that deep-fetch `tasks.*` from a project_event keep working.
 *   2. Drops `project_tasks_watchers` (FKs project_tasks, leaf-first).
 *   3. Drops `project_tasks`.
 *
 * Safe to re-run: each step skips work that's already done. A row-count
 * safety check refuses to drop a non-empty collection unless `--force` is
 * passed.
 *
 *   pnpm tsx scripts/drop-project-tasks-collection.ts                    # dry-run plan
 *   pnpm tsx scripts/drop-project-tasks-collection.ts --apply            # commit
 *   pnpm tsx scripts/drop-project-tasks-collection.ts --apply --force    # ignore row count
 *
 * Requires DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN.
 */

import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');

if (!TOKEN) {
	console.error('Missing DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN');
	process.exit(1);
}

async function req(
	path: string,
	method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
	body?: unknown,
): Promise<{ ok: boolean; status: number; data: any; error: string | null }> {
	const res = await fetch(`${DIRECTUS_URL}${path}`, {
		method,
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
		body: body ? JSON.stringify(body) : undefined,
	});
	const text = await res.text();
	let parsed: any = null;
	try {
		parsed = text ? JSON.parse(text) : null;
	} catch {
		/* not JSON */
	}
	if (!res.ok) return { ok: false, status: res.status, data: null, error: text };
	return { ok: true, status: res.status, data: parsed?.data ?? parsed, error: null };
}

async function collectionExists(collection: string): Promise<boolean> {
	const { ok, status } = await req(`/collections/${collection}`);
	if (ok) return true;
	if (status === 404 || status === 403) return false;
	return false;
}

async function countRows(collection: string): Promise<number | null> {
	const r = await req(`/items/${collection}?aggregate[count]=*`);
	if (!r.ok) return null;
	const arr = (r.data as any[]) ?? [];
	const c = arr[0]?.count;
	if (c == null) return null;
	return typeof c === 'number' ? c : Number(c);
}

async function repointProjectEventsTasksAlias(): Promise<void> {
	console.log('\n=== project_events.tasks alias ===');

	// Read the current Directus relation row pointing project_tasks.event_id
	// at project_events. Directus tracks reverse-o2m aliases through the
	// /relations endpoint — there's exactly one row whose many_collection is
	// `project_tasks` and many_field is `event_id`.
	const rel = await req('/relations/project_tasks/event_id');
	if (!rel.ok) {
		console.log(`  no project_tasks.event_id relation found (status ${rel.status}); nothing to repoint`);
		return;
	}
	const data: any = rel.data;
	const oneCollection = data?.related_collection || data?.meta?.one_collection;
	const oneField = data?.meta?.one_field;
	console.log(`  current alias: ${oneCollection}.${oneField} ← project_tasks.event_id`);

	if (oneCollection !== 'project_events' || oneField !== 'tasks') {
		console.log(`  unexpected alias shape — bailing without changes`);
		return;
	}

	// Check whether tasks.project_event_id already exposes an alias named
	// `tasks` on project_events — if so we don't need to do anything; if
	// the alias is named differently (or absent), we patch its meta.one_field.
	const tasksRel = await req('/relations/tasks/project_event_id');
	if (!tasksRel.ok) {
		console.log(`  no tasks.project_event_id relation found (status ${tasksRel.status}) — abort`);
		return;
	}
	const tasksData: any = tasksRel.data;
	const existingAlias = tasksData?.meta?.one_field;
	console.log(`  tasks.project_event_id → project_events.${existingAlias ?? '<none>'}`);

	if (existingAlias === 'tasks') {
		console.log(`  tasks collection already aliased as project_events.tasks — nothing to repoint`);
		return;
	}

	if (!APPLY) {
		console.log(`  [dry-run] would PATCH /relations/tasks/project_event_id meta.one_field='tasks'`);
		console.log(`  [dry-run] would NULL the project_tasks.event_id reverse alias to free the name`);
		return;
	}

	// Free the `tasks` name on project_events by clearing the old alias.
	const clearOld = await req('/relations/project_tasks/event_id', 'PATCH', {
		meta: { one_field: null },
	});
	if (!clearOld.ok) {
		console.error(`  failed to clear old alias: ${clearOld.status} ${clearOld.error}`);
		return;
	}
	const repointed = await req('/relations/tasks/project_event_id', 'PATCH', {
		meta: { one_field: 'tasks' },
	});
	if (repointed.ok) {
		console.log(`  alias repointed: project_events.tasks now → tasks.project_event_id`);
	} else {
		console.error(`  failed to repoint: ${repointed.status} ${repointed.error}`);
	}
}

async function dropCollection(collection: string): Promise<void> {
	console.log(`\n=== ${collection} ===`);

	const exists = await collectionExists(collection);
	if (!exists) {
		console.log(`  not present in Directus — nothing to drop`);
		return;
	}

	const count = await countRows(collection);
	if (count == null) {
		console.log(`  could not read row count (collection may be unreadable)`);
	} else {
		console.log(`  row count: ${count}`);
		if (count > 0 && !FORCE) {
			console.error(
				`  refusing to drop a non-empty collection. Pass --force to override, or run the migration first.`,
			);
			return;
		}
	}

	if (!APPLY) {
		console.log(`  [dry-run] would DELETE /collections/${collection}`);
		return;
	}

	const r = await req(`/collections/${collection}`, 'DELETE');
	if (r.ok) {
		console.log(`  dropped`);
	} else {
		console.error(`  failed: ${r.status} ${r.error}`);
	}
}

async function main() {
	console.log('=========================================');
	console.log(`  project_tasks drop — ${APPLY ? 'APPLY' : 'DRY RUN'}`);
	console.log(`  Target: ${DIRECTUS_URL}`);
	console.log(`  Force:  ${FORCE ? 'yes (ignore row count)' : 'no'}`);
	console.log('=========================================');

	await repointProjectEventsTasksAlias();

	// project_tasks_watchers FKs project_tasks → drop it first
	await dropCollection('project_tasks_watchers');
	await dropCollection('project_tasks');

	console.log('\nDone.');
	if (!APPLY) console.log('Re-run with --apply to commit.');
	else console.log('Re-run `pnpm generate:types` to refresh the typed schema.');
}

main().catch((err) => {
	console.error('Drop failed:', err);
	process.exit(1);
});
