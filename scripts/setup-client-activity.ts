#!/usr/bin/env npx tsx
/**
 * setup-client-activity.ts
 *
 * Provisions everything needed to swap the "Recent" client sort from a
 * 3-aggregate read-path to a denormalized `clients.last_activity_at`
 * column. Idempotent — safe to re-run.
 *
 * Steps (all conditional, skip if already done):
 *   1. Add `clients.last_activity_at` field (datetime, indexed, nullable)
 *   2. Backfill: max(date_updated) across projects + tickets + tasks per
 *      client, merged with the client's own date_updated, PATCHed onto
 *      every client row.
 *   3. Create three Directus flows (projects/tickets/tasks → items.create
 *      + items.update) that POST to `/api/clients/bump-activity`. The
 *      endpoint debounces at 5s, so bulk imports collapse into ~1 client
 *      PATCH per affected client.
 *
 * Usage:
 *   pnpm tsx scripts/setup-client-activity.ts            # dry-run (default)
 *   pnpm tsx scripts/setup-client-activity.ts --apply    # mutate
 */

import 'dotenv/config';

const URL = process.env.DIRECTUS_URL!;
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
const APP_URL = process.env.APP_BASE_URL || process.env.NUXT_PUBLIC_SITE_URL || 'https://app.earnest.guru';
const WEBHOOK_SECRET = process.env.NOTIFICATION_WEBHOOK_SECRET || '';

if (!URL || !TOKEN) {
	console.error('DIRECTUS_URL and DIRECTUS_SERVER_TOKEN are required.');
	process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const ENDPOINT_URL = `${APP_URL.replace(/\/$/, '')}/api/clients/bump-activity`;

async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
	const res = await fetch(`${URL.replace(/\/$/, '')}${path}`, {
		...init,
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${TOKEN}`,
			...(init.headers || {}),
		},
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`${init.method || 'GET'} ${path} → ${res.status}: ${text}`);
	}
	if (res.status === 204) return {} as T;
	return (await res.json()) as T;
}

// ── 1. Field ─────────────────────────────────────────────────────────────

async function ensureField() {
	console.log('\n[1/3] clients.last_activity_at field');
	const existing = await api<{ data: any }>(`/fields/clients/last_activity_at`).catch(() => null);
	if (existing?.data?.field === 'last_activity_at') {
		console.log('  • already present — skip');
		return;
	}
	console.log('  • CREATE field');
	if (!APPLY) return;
	await api(`/fields/clients`, {
		method: 'POST',
		body: JSON.stringify({
			field: 'last_activity_at',
			type: 'timestamp',
			meta: {
				interface: 'datetime',
				readonly: true,
				note: 'Bumped by /api/clients/bump-activity when a child project/ticket/task changes. Drives the "Recent" client sort.',
				width: 'half',
				special: ['date-created'].includes('') ? [] : null,
			},
			schema: {
				is_nullable: true,
			},
		}),
	});
	// Index it so the sort + filter stay fast at scale.
	await api(`/fields/clients/last_activity_at`, {
		method: 'PATCH',
		body: JSON.stringify({ schema: { is_indexed: true } }),
	}).catch((err) => console.warn('  • could not set index (may not be supported on this Directus version):', err.message));
}

// ── 2. Backfill ──────────────────────────────────────────────────────────

interface MaxRow {
	clientId: string;
	ts: string;
}

async function aggregateMax(collection: string, fk: string): Promise<MaxRow[]> {
	const params = new URLSearchParams({
		'aggregate[max]': 'date_updated',
		groupBy: fk,
		limit: '-1',
	});
	const res = await api<{ data: any[] }>(`/items/${collection}?${params}`).catch((err) => {
		console.warn(`  • aggregate failed for ${collection}: ${err.message}`);
		return { data: [] };
	});
	const out: MaxRow[] = [];
	for (const row of res.data || []) {
		const cid = row?.[fk];
		const ts = row?.max?.date_updated;
		if (cid && ts) out.push({ clientId: cid, ts });
	}
	return out;
}

async function backfill() {
	console.log('\n[2/3] Backfill last_activity_at');

	// Field may not exist yet in dry-run. Read defensively: try with it, fall
	// back to date_updated only so the rest of the script can still report
	// what *would* be bumped.
	let clients = await api<{ data: Array<{ id: string; date_updated: string | null; last_activity_at: string | null }> }>(
		`/items/clients?fields=id,date_updated,last_activity_at&limit=-1`,
	).catch(() => null);
	if (!clients) {
		console.log('  • last_activity_at column missing (probably dry-run before field creation) — reading id,date_updated only');
		const fallback = await api<{ data: Array<{ id: string; date_updated: string | null }> }>(
			`/items/clients?fields=id,date_updated&limit=-1`,
		);
		clients = { data: fallback.data.map((c) => ({ ...c, last_activity_at: null })) };
	}
	const total = clients.data.length;
	console.log(`  • ${total} clients in scope`);

	const [projectMax, ticketMax, taskMax] = await Promise.all([
		aggregateMax('projects', 'client'),
		aggregateMax('tickets', 'client'),
		aggregateMax('tasks', 'client_id'),
	]);
	console.log(`  • aggregates: projects=${projectMax.length} tickets=${ticketMax.length} tasks=${taskMax.length}`);

	const merged: Record<string, string> = {};
	for (const list of [projectMax, ticketMax, taskMax]) {
		for (const { clientId, ts } of list) {
			if (!merged[clientId] || ts > merged[clientId]) merged[clientId] = ts;
		}
	}

	// Build per-client target value. Skip rows that are already up-to-date
	// (lets re-runs be cheap — no PATCH if value hasn't changed).
	const updates: Array<{ id: string; target: string }> = [];
	for (const c of clients.data) {
		const childMax = merged[c.id] || '';
		const target = pickLatest(c.date_updated || '', childMax);
		if (!target) continue;
		if (c.last_activity_at === target) continue;
		updates.push({ id: c.id, target });
	}

	console.log(`  • ${updates.length} client row(s) need a bump`);
	if (!APPLY) return;

	// Sequential to be kind to Directus; one-shot script, ~30ms per row.
	let done = 0;
	for (const u of updates) {
		await api(`/items/clients/${u.id}`, {
			method: 'PATCH',
			body: JSON.stringify({ last_activity_at: u.target }),
		});
		done++;
		if (done % 25 === 0) console.log(`    … ${done}/${updates.length}`);
	}
	console.log(`  • done (${done} patched)`);
}

function pickLatest(x: string, y: string): string {
	if (!x) return y;
	if (!y) return x;
	return x > y ? x : y;
}

// ── 3. Flows ─────────────────────────────────────────────────────────────

interface FlowSpec {
	name: string;
	collection: 'projects' | 'tickets' | 'tasks';
}

const FLOWS: FlowSpec[] = [
	{ name: 'activity · projects → clients.last_activity_at', collection: 'projects' },
	{ name: 'activity · tickets → clients.last_activity_at', collection: 'tickets' },
	{ name: 'activity · tasks → clients.last_activity_at', collection: 'tasks' },
];

function buildFlowPayload(spec: FlowSpec) {
	return {
		name: spec.name,
		icon: 'history',
		color: '#06b6d4',
		description: `Bump clients.last_activity_at when a ${spec.collection.slice(0, -1)} is created or updated.`,
		status: 'active',
		trigger: 'event',
		accountability: 'all',
		options: {
			type: 'action',
			scope: ['items.create', 'items.update'],
			collections: [spec.collection],
		},
	};
}

function buildOperationPayload(flowId: string, spec: FlowSpec) {
	// Hand-built JSON template — wrapping `{{$trigger.keys}}` in quotes would
	// make Directus substitute the array as a JSON string ("[\"id\"]"). The
	// endpoint normalizes either shape, but unquoted lands as a real array
	// and is easier to read in flow revision logs.
	const body = `{
  "collection": "${spec.collection}",
  "itemIds": {{$trigger.keys}}
}`;
	return {
		flow: flowId,
		name: 'POST bump-activity',
		key: 'bump_activity',
		type: 'request',
		position_x: 19,
		position_y: 1,
		options: {
			method: 'POST',
			url: ENDPOINT_URL,
			headers: [{ header: 'Content-Type', value: 'application/json' }],
			body,
		},
	};
}

async function reconcileFlows() {
	console.log('\n[3/3] Directus flows');
	const existing = await api<{ data: Array<{ id: string; name: string }> }>(`/flows?fields=id,name&limit=-1`);
	for (const spec of FLOWS) {
		const flow = existing.data?.find((f) => f.name === spec.name);
		const payload = buildFlowPayload(spec);

		if (flow) {
			console.log(`  • UPDATE "${spec.name}"`);
			if (!APPLY) continue;
			await api(`/flows/${flow.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
			const ops = await api<{ data: Array<{ id: string }> }>(
				`/operations?filter[flow][_eq]=${flow.id}&fields=id&limit=-1`,
			);
			for (const op of ops.data || []) {
				await api(`/operations/${op.id}`, { method: 'DELETE' });
			}
			const opCreated = await api<{ data: { id: string } }>(`/operations`, {
				method: 'POST',
				body: JSON.stringify(buildOperationPayload(flow.id, spec)),
			});
			await api(`/flows/${flow.id}`, {
				method: 'PATCH',
				body: JSON.stringify({ operation: opCreated.data.id }),
			});
		} else {
			console.log(`  • CREATE "${spec.name}"`);
			if (!APPLY) continue;
			const created = await api<{ data: { id: string } }>(`/flows`, {
				method: 'POST',
				body: JSON.stringify(payload),
			});
			const opCreated = await api<{ data: { id: string } }>(`/operations`, {
				method: 'POST',
				body: JSON.stringify(buildOperationPayload(created.data.id, spec)),
			});
			await api(`/flows/${created.data.id}`, {
				method: 'PATCH',
				body: JSON.stringify({ operation: opCreated.data.id }),
			});
		}
	}
}

async function main() {
	console.log(`\nclient-activity setup`);
	console.log(`  Directus:    ${URL}`);
	console.log(`  Endpoint:    ${ENDPOINT_URL}`);
	console.log(`  Secret:      ${WEBHOOK_SECRET ? 'set' : 'NOT SET (verification disabled)'}`);
	console.log(`  Mode:        ${APPLY ? 'APPLY (mutating)' : 'DRY-RUN'}`);

	await ensureField();
	await backfill();
	await reconcileFlows();

	console.log(`\n${APPLY ? 'Applied.' : 'Dry-run complete.'} Re-run with --apply to mutate.`);
}

main().catch((err) => {
	console.error('[setup-client-activity] failed:', err);
	process.exit(1);
});
