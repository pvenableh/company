#!/usr/bin/env npx tsx
/**
 * setup-notification-flows.ts
 *
 * Idempotently provisions the Directus Flows that drive the portal /
 * staff notification system. Each Flow listens for item.create or
 * item.update events on a collection and POSTs the payload to
 * `/api/notifications/trigger` — which resolves recipients via
 * `notificationRecipients.ts` and fans out bell + email through
 * `emitNotification`.
 *
 * Why Flows: the trigger endpoint already exists and the recipient
 * resolver already handles every collection we care about. Wiring at
 * the Directus layer means writes from ANY source (admin UI, scripts,
 * the app, bespoke server endpoints) all fan out the same way. The
 * alternative — wrapping every mutation endpoint — leaks notification
 * logic into N call sites.
 *
 * Flows are runtime objects in Directus, not version-controlled. This
 * script reconciles them: if a flow with the same name already exists,
 * its target URL and trigger config are updated; otherwise a new one is
 * created. Re-running the script is safe.
 *
 * Webhook auth: the script reads NOTIFICATION_WEBHOOK_SECRET from env
 * and stamps it into each flow's request body. The trigger endpoint
 * checks it against `config.notificationWebhookSecret` with a constant-
 * time compare and FAILS CLOSED if either side is missing — running
 * this script without the env will provision flows that 403 in prod.
 * Make sure NOTIFICATION_WEBHOOK_SECRET is set before --apply.
 *
 * Usage:
 *   pnpm tsx scripts/setup-notification-flows.ts            # dry-run
 *   pnpm tsx scripts/setup-notification-flows.ts --apply    # mutate
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

if (APPLY && !WEBHOOK_SECRET) {
	console.error('NOTIFICATION_WEBHOOK_SECRET is required to --apply — the trigger endpoint fails closed without it.');
	process.exit(1);
}
const TRIGGER_URL = `${APP_URL.replace(/\/$/, '')}/api/notifications/trigger`;

interface FlowSpec {
	name: string;
	collection: string;
	/** Directus emits item.create + item.update as separate triggers. We
	 * subscribe to whichever apply for this collection. */
	events: Array<'items.create' | 'items.update'>;
	description: string;
}

const FLOWS: FlowSpec[] = [
	{
		name: 'notify · comments.create',
		collection: 'comments',
		events: ['items.create'],
		description: 'On new comment, fan out @mentions + assignee + portal-user notifications.',
	},
	{
		name: 'notify · reactions.create',
		collection: 'reactions',
		events: ['items.create'],
		description: 'On new reaction, bell-only ping (with upsert) to the reacted item author.',
	},
	{
		name: 'notify · tickets.update',
		collection: 'tickets',
		events: ['items.update'],
		description: 'On ticket status/assignment change, notify staff + portal users.',
	},
	{
		name: 'notify · projects.update',
		collection: 'projects',
		events: ['items.update'],
		description: 'On project status/due-date/completion change, notify staff + portal users.',
	},
	{
		name: 'notify · invoices.update',
		collection: 'invoices',
		events: ['items.update'],
		description: 'On invoice issued or paid, notify org admins + portal users on the client.',
	},
	{
		name: 'notify · contracts.update',
		collection: 'contracts',
		events: ['items.update'],
		description: 'On contract sent or signed, notify staff + portal users.',
	},
	{
		name: 'notify · proposals.update',
		collection: 'proposals',
		events: ['items.update'],
		description: 'On proposal sent/accepted/rejected, notify staff.',
	},
	{
		name: 'notify · tasks.update',
		collection: 'tasks',
		events: ['items.update'],
		description: 'On task assignment, notify the new assignee.',
	},
];

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

async function listExistingFlows(): Promise<Array<{ id: string; name: string }>> {
	const out = await api<{ data: Array<{ id: string; name: string }> }>(
		`/flows?fields=id,name&limit=-1`,
	);
	return out.data || [];
}

function buildFlowPayload(spec: FlowSpec) {
	const scope = spec.events;
	const body: Record<string, any> = {
		collection: '{{$trigger.collection}}',
		action: '{{$trigger.event}}',
		item: '{{$trigger.payload}}',
		itemId: '{{$trigger.keys[0] || $trigger.key}}',
		userId: '{{$accountability.user}}',
		orgId: '{{$trigger.payload.organization || null}}',
		previousItem: '{{$trigger.payload._previous || null}}',
	};
	if (WEBHOOK_SECRET) body.secret = WEBHOOK_SECRET;

	return {
		name: spec.name,
		icon: 'notifications_active',
		color: '#06b6d4',
		description: spec.description,
		status: 'active',
		trigger: 'event',
		accountability: 'all',
		options: {
			type: 'action',
			scope,
			collections: [spec.collection],
		},
	};
}

/**
 * Operation graph for a single flow: one `request-url` operation that
 * POSTs to the trigger endpoint. Stored under `flow.operation` (the
 * first operation in the chain).
 */
function buildOperationPayload(flowId: string) {
	const body: Record<string, any> = {
		collection: '{{$trigger.collection}}',
		action: '{{$trigger.event}}',
		item: '{{$trigger.payload}}',
		itemId: '{{$trigger.keys[0] || $trigger.key}}',
		userId: '{{$accountability.user}}',
		orgId: '{{$trigger.payload.organization || null}}',
	};
	if (WEBHOOK_SECRET) body.secret = WEBHOOK_SECRET;

	return {
		flow: flowId,
		name: 'POST trigger webhook',
		key: 'trigger_webhook',
		type: 'request',
		position_x: 19,
		position_y: 1,
		options: {
			method: 'POST',
			url: TRIGGER_URL,
			headers: [{ header: 'Content-Type', value: 'application/json' }],
			body: JSON.stringify(body, null, 2),
		},
	};
}

async function reconcile(spec: FlowSpec, existing: Array<{ id: string; name: string }>) {
	const existingFlow = existing.find((f) => f.name === spec.name);
	const payload = buildFlowPayload(spec);

	if (existingFlow) {
		console.log(`  • UPDATE flow "${spec.name}" (${existingFlow.id})`);
		if (!APPLY) return;
		await api(`/flows/${existingFlow.id}`, {
			method: 'PATCH',
			body: JSON.stringify(payload),
		});
		// Reconcile operation graph: delete existing ops, recreate the single
		// request-url op. Cheaper than diffing the graph; flows are small.
		const ops = await api<{ data: Array<{ id: string }> }>(
			`/operations?filter[flow][_eq]=${existingFlow.id}&fields=id&limit=-1`,
		);
		for (const op of ops.data || []) {
			await api(`/operations/${op.id}`, { method: 'DELETE' });
		}
		const opCreated = await api<{ data: { id: string } }>(`/operations`, {
			method: 'POST',
			body: JSON.stringify(buildOperationPayload(existingFlow.id)),
		});
		await api(`/flows/${existingFlow.id}`, {
			method: 'PATCH',
			body: JSON.stringify({ operation: opCreated.data.id }),
		});
		return;
	}

	console.log(`  • CREATE flow "${spec.name}"`);
	if (!APPLY) return;
	const created = await api<{ data: { id: string } }>(`/flows`, {
		method: 'POST',
		body: JSON.stringify(payload),
	});
	const opCreated = await api<{ data: { id: string } }>(`/operations`, {
		method: 'POST',
		body: JSON.stringify(buildOperationPayload(created.data.id)),
	});
	await api(`/flows/${created.data.id}`, {
		method: 'PATCH',
		body: JSON.stringify({ operation: opCreated.data.id }),
	});
}

async function main() {
	console.log(`\nNotification flow setup`);
	console.log(`  Directus: ${URL}`);
	console.log(`  Trigger URL: ${TRIGGER_URL}`);
	console.log(`  Webhook secret: ${WEBHOOK_SECRET ? 'set' : 'NOT SET (verification disabled)'}`);
	console.log(`  Mode: ${APPLY ? 'APPLY (mutating)' : 'DRY-RUN'}\n`);

	const existing = await listExistingFlows();
	for (const spec of FLOWS) {
		await reconcile(spec, existing);
	}

	console.log(`\n${APPLY ? 'Applied' : 'Dry-run complete'}: ${FLOWS.length} flow(s).`);
	if (!APPLY) console.log(`Re-run with --apply to mutate.`);
}

main().catch((err) => {
	console.error('[setup-notification-flows] failed:', err);
	process.exit(1);
});
