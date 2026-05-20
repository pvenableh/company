#!/usr/bin/env npx tsx
/**
 * Migrate `project_tasks` rows → `tasks` rows
 * ─────────────────────────────────────────────
 * `project_tasks` is being deprecated in favor of the richer `tasks` collection
 * (Session 29 — AI add_task already writes to `tasks`). This script copies every
 * project_tasks row into `tasks` with the proper field mapping, then can be
 * followed by `scripts/drop-project-tasks-collection.ts` once code is repointed.
 *
 * Field mapping
 * ─────────────
 *   project_tasks.id          → tasks.id                       (same UUID — idempotency)
 *   project_tasks.event_id    → tasks.project_event_id
 *   project_tasks.project     → tasks.project_id
 *   project_tasks.title       → tasks.title
 *   project_tasks.description → tasks.description
 *   project_tasks.assignee_id → tasks_directus_users m2m row
 *   project_tasks.completed   → tasks.status ('completed' if true, else 'new')
 *   project_tasks.completed_at→ tasks.date_completed
 *   project_tasks.due_date    → tasks.due_date
 *   project_tasks.priority    → tasks.priority (enum aligns, both have low/med/high)
 *   project_tasks.date_created→ tasks.date_created             (preserve via override field)
 *   project_tasks.user_created→ tasks.user_created             (preserve)
 *   project_tasks.sort        → tasks.sort
 *
 * Derived
 * ───────
 *   tasks.organization_id ← project.organization or event.project.organization
 *   tasks.category        ← 'event' if event_id present, else 'project'
 *   tasks.schedule        ← 'unscheduled' (migrated tasks aren't auto-prioritized)
 *
 * Dropped (no equivalent on tasks)
 * ─────────────────────────────────
 *   completed_by, watchers, status (publish/draft/archived enum)
 *
 * Archived rows
 * ─────────────
 *   project_tasks.status='archived' → SKIPPED (don't litter the new collection).
 *   If you want to keep them, they need a manual carry-over.
 *
 * Usage
 * ─────
 *   pnpm tsx scripts/migrate-project-tasks-to-tasks.ts             # dry-run
 *   pnpm tsx scripts/migrate-project-tasks-to-tasks.ts --apply     # commit
 *
 * Idempotent: each tasks row carries the source project_tasks UUID; re-running
 * skips rows whose id already exists in `tasks`.
 */

import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
const APPLY = process.argv.includes('--apply');

if (!DIRECTUS_TOKEN) {
	console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN required');
	process.exit(1);
}

async function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
	// Directus returns 503 "Under pressure" when the API is overloaded.
	// Retry with exponential backoff so a long-running batch survives a
	// transient hiccup rather than aborting halfway through.
	const maxAttempts = 6;
	let attempt = 0;
	while (true) {
		attempt++;
		const r = await fetch(`${DIRECTUS_URL}${path}`, {
			...init,
			headers: {
				Authorization: `Bearer ${DIRECTUS_TOKEN}`,
				'Content-Type': 'application/json',
				...(init.headers || {}),
			},
		});
		if (r.ok) {
			if (r.status === 204) return undefined as any;
			const j = await r.json();
			return j.data ?? j;
		}
		const body = await r.text().catch(() => '');
		const retryable = r.status === 503 || r.status === 429 || r.status === 502 || r.status === 504;
		if (retryable && attempt < maxAttempts) {
			const wait = Math.min(30000, 500 * Math.pow(2, attempt - 1));
			console.warn(`  [retry] ${r.status} on ${init.method || 'GET'} ${path} — sleeping ${wait}ms (attempt ${attempt}/${maxAttempts})`);
			await sleep(wait);
			continue;
		}
		throw new Error(`${r.status} ${r.statusText} on ${init.method || 'GET'} ${path}\n${body}`);
	}
}

interface ProjectTaskRow {
	id: string;
	status: 'published' | 'draft' | 'archived';
	sort: number | null;
	user_created: string | null;
	date_created: string | null;
	title: string | null;
	description: string | null;
	assignee_id: string | null;
	completed: boolean | null;
	completed_at: string | null;
	completed_by: string | null;
	due_date: string | null;
	priority: 'low' | 'medium' | 'high' | null;
	event_id:
		| string
		| {
				id: string;
				project: string | { id: string; organization: string | null } | null;
		  }
		| null;
	project: string | { id: string; organization: string | null } | null;
}

interface ExistingTaskRow {
	id: string;
}

async function loadUserOrgs(userIds: string[]): Promise<Map<string, string>> {
	const map = new Map<string, string>();
	if (userIds.length === 0) return map;
	const unique = Array.from(new Set(userIds));
	const memberships = await api<any[]>(
		'/items/org_memberships?fields=user,organization&filter[user][_in]=' +
			unique.join(',') +
			'&filter[status][_eq]=active' +
			'&limit=-1',
	);
	for (const m of memberships) {
		if (!m.user || !m.organization) continue;
		// First active membership wins (most users have one anyway).
		if (!map.has(m.user)) map.set(m.user, m.organization);
	}
	return map;
}

function resolveOrg(row: ProjectTaskRow, userOrgs: Map<string, string>): string | null {
	if (row.project && typeof row.project === 'object' && row.project.organization) {
		return row.project.organization;
	}
	if (row.event_id && typeof row.event_id === 'object') {
		const proj = row.event_id.project;
		if (proj && typeof proj === 'object') return proj.organization;
	}
	// Personal/quick tasks that landed in project_tasks without FKs — fall back
	// to the creator's primary org so we can migrate them as category='quick'.
	if (row.user_created && userOrgs.has(row.user_created)) {
		return userOrgs.get(row.user_created) || null;
	}
	return null;
}

function resolveProjectId(row: ProjectTaskRow): string | null {
	if (row.project) return typeof row.project === 'object' ? row.project.id : row.project;
	if (row.event_id && typeof row.event_id === 'object' && row.event_id.project) {
		return typeof row.event_id.project === 'object' ? row.event_id.project.id : row.event_id.project;
	}
	return null;
}

function resolveEventId(row: ProjectTaskRow): string | null {
	if (!row.event_id) return null;
	return typeof row.event_id === 'object' ? row.event_id.id : row.event_id;
}

async function main() {
	console.log('==========================================');
	console.log('  project_tasks → tasks migration');
	console.log(`  Mode: ${APPLY ? 'APPLY (writes!)' : 'DRY-RUN (no writes)'}`);
	console.log(`  Directus: ${DIRECTUS_URL}`);
	console.log('==========================================\n');

	const rows = await api<ProjectTaskRow[]>(
		'/items/project_tasks' +
			'?fields=' +
			[
				'id',
				'status',
				'sort',
				'user_created',
				'date_created',
				'title',
				'description',
				'assignee_id',
				'completed',
				'completed_at',
				'completed_by',
				'due_date',
				'priority',
				'event_id.id',
				'event_id.project.id',
				'event_id.project.organization',
				'project.id',
				'project.organization',
			].join(',') +
			'&limit=-1',
	);

	console.log(`Loaded ${rows.length} project_tasks row(s).\n`);

	if (rows.length === 0) {
		console.log('  Nothing to migrate. Done.');
		return;
	}

	const existingIds = new Set(
		(
			await api<ExistingTaskRow[]>(
				'/items/tasks?fields=id&filter[id][_in]=' + rows.map(r => r.id).join(',') + '&limit=-1',
			)
		).map(t => t.id),
	);

	const orphanCreators = rows
		.filter(r => !r.project && (!r.event_id || (typeof r.event_id === 'object' && !r.event_id.project)))
		.map(r => r.user_created)
		.filter((id): id is string => !!id);
	const userOrgs = await loadUserOrgs(orphanCreators);
	console.log(`Loaded ${userOrgs.size} user→org mapping(s) for orphan rows.\n`);

	let migrated = 0;
	let migratedAsQuick = 0;
	let skippedAlreadyMigrated = 0;
	let skippedArchived = 0;
	let skippedMissingOrg = 0;
	const assignmentsToCreate: Array<{ tasks_id: string; directus_users_id: string }> = [];

	for (const row of rows) {
		if (existingIds.has(row.id)) {
			skippedAlreadyMigrated++;
			console.log(`  [skip] ${row.id.slice(0, 8)}… — already in tasks`);
			continue;
		}
		if (row.status === 'archived') {
			skippedArchived++;
			console.log(`  [skip] ${row.id.slice(0, 8)}… "${row.title || '(untitled)'}" — archived`);
			continue;
		}

		const org = resolveOrg(row, userOrgs);
		if (!org) {
			skippedMissingOrg++;
			console.warn(`  [warn] ${row.id.slice(0, 8)}… "${row.title || '(untitled)'}" — no org resolvable; skipping`);
			continue;
		}

		const projectId = resolveProjectId(row);
		const eventId = resolveEventId(row);
		const isCompleted = !!row.completed;
		const category: 'event' | 'project' | 'quick' = eventId ? 'event' : projectId ? 'project' : 'quick';
		if (category === 'quick') migratedAsQuick++;

		const payload: Record<string, any> = {
			id: row.id, // preserve UUID for idempotency
			title: row.title || null,
			description: row.description || null,
			status: isCompleted ? 'completed' : 'new',
			date_completed: isCompleted ? row.completed_at : null,
			due_date: row.due_date || null,
			priority: row.priority || null,
			schedule: 'unscheduled',
			project_id: projectId,
			project_event_id: eventId,
			organization_id: org,
			category,
			sort: row.sort,
			date_created: row.date_created,
			user_created: row.user_created,
		};

		console.log(
			`  [migrate] ${row.id.slice(0, 8)}… "${row.title || '(untitled)'}" → status=${payload.status}, category=${category}`,
		);

		if (APPLY) {
			await api('/items/tasks', {
				method: 'POST',
				body: JSON.stringify(payload),
			});
			// Light pacing so prod Directus doesn't 503 us. ~10 writes/sec is
			// well under what the API can handle steady-state but avoids the
			// "Under pressure" backoff trigger.
			await sleep(100);
		}

		if (row.assignee_id) {
			assignmentsToCreate.push({ tasks_id: row.id, directus_users_id: row.assignee_id });
		}

		migrated++;
	}

	console.log(`\nCreating ${assignmentsToCreate.length} assignment junction row(s)…`);
	let assignmentsCreated = 0;
	for (const a of assignmentsToCreate) {
		if (APPLY) {
			try {
				await api('/items/tasks_directus_users', {
					method: 'POST',
					body: JSON.stringify(a),
				});
				assignmentsCreated++;
			} catch (err: any) {
				console.warn(`  [warn] assignment ${a.tasks_id.slice(0, 8)}…/${a.directus_users_id.slice(0, 8)}… failed: ${err.message}`);
			}
		} else {
			assignmentsCreated++;
		}
	}

	console.log('\n==========================================');
	console.log('  Summary');
	console.log('==========================================');
	console.log(`  Total project_tasks rows:     ${rows.length}`);
	console.log(`  → Already migrated (skipped): ${skippedAlreadyMigrated}`);
	console.log(`  → Archived (skipped):         ${skippedArchived}`);
	console.log(`  → Missing org (skipped):      ${skippedMissingOrg}`);
	console.log(`  → Migrated:                   ${migrated}`);
	console.log(`     (of which category=quick:  ${migratedAsQuick})`);
	console.log(`  Assignment rows created:      ${assignmentsCreated}`);
	console.log('');
	if (!APPLY) {
		console.log('  This was a DRY-RUN. Re-run with --apply to write changes.');
	} else {
		console.log('  Done. Next: repoint code, then drop project_tasks collection.');
	}
}

main().catch(err => {
	console.error('Fatal:', err);
	process.exit(1);
});
