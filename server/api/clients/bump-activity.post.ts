/**
 * POST /api/clients/bump-activity
 *
 * Pushes `clients.last_activity_at = NOW` for every client whose child
 * project/ticket/task just changed. Called from three Directus flows
 * (one per child collection) and from any app-level bulk-import path
 * that wants to coalesce its writes.
 *
 * Body shapes (both accepted):
 *   { collection: 'projects'|'tickets'|'tasks', itemIds: string[] }
 *     Resolves child rows → unique client FKs → debounced bump.
 *
 *   { clientIds: string[] }
 *     Direct bump, no FK resolution (use from bulk-import callsites
 *     that already know which clients changed).
 *
 * Debounce: the UPDATE filter only matches rows whose `last_activity_at`
 * is null or older than 5 seconds. Repeated bumps for the same client
 * inside a 5s window collapse into one database write — which is why
 * even a 500-row bulk insert costs ~1 client PATCH per affected client.
 *
 * Auth: if NOTIFICATION_WEBHOOK_SECRET is set, the request body must
 * include a matching `secret` field. (Matches the existing notification
 * webhook pattern in scripts/setup-notification-flows.ts.) Otherwise
 * unauthenticated — same trust model as the notification trigger.
 */
import { readItems, updateItems } from '@directus/sdk';

type IncomingBody =
	| { collection: 'projects' | 'tickets' | 'tasks'; itemIds: string[] | string; secret?: string }
	| { clientIds: string[]; secret?: string };

const FK_BY_COLLECTION: Record<string, string> = {
	projects: 'client',
	tickets: 'client',
	tasks: 'client_id',
};

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();
	const expectedSecret = (config as any).notificationWebhookSecret || process.env.NOTIFICATION_WEBHOOK_SECRET || '';
	const body = (await readBody<IncomingBody>(event)) || ({} as IncomingBody);

	if (expectedSecret && (body as any).secret !== expectedSecret) {
		throw createError({ statusCode: 401, statusMessage: 'Invalid webhook secret' });
	}

	const directus = getTypedDirectus();
	let clientIds: string[] = [];

	if ('clientIds' in body && Array.isArray(body.clientIds)) {
		clientIds = body.clientIds.filter(Boolean);
	} else if ('collection' in body && body.collection) {
		const fk = FK_BY_COLLECTION[body.collection];
		if (!fk) {
			throw createError({ statusCode: 400, statusMessage: `Unsupported collection: ${body.collection}` });
		}
		// Normalize itemIds: Directus flow templates serialize $trigger.keys
		// as a JSON array, but a single-key update may render as a bare string.
		const raw = body.itemIds;
		const ids = Array.isArray(raw) ? raw : raw ? [raw] : [];
		if (!ids.length) return { bumped: 0 };

		const rows = await directus.request(
			readItems(body.collection as any, {
				filter: { id: { _in: ids } } as any,
				fields: [fk] as any,
				limit: -1,
			}),
		);
		for (const r of rows as any[]) {
			const cid = r?.[fk];
			if (cid && typeof cid === 'string') clientIds.push(cid);
		}
	} else {
		throw createError({ statusCode: 400, statusMessage: 'Provide either {collection, itemIds} or {clientIds}' });
	}

	if (!clientIds.length) return { bumped: 0 };

	// Dedupe in JS to avoid sending huge _in lists for bulk imports of one
	// client's children. (500 task imports for one client → 1 ID in filter.)
	const uniqIds = Array.from(new Set(clientIds));
	const now = new Date().toISOString();
	const debounceCutoff = new Date(Date.now() - 5_000).toISOString();

	const updated = await directus.request(
		updateItems(
			'clients' as any,
			{
				filter: {
					_and: [
						{ id: { _in: uniqIds } },
						{
							_or: [
								{ last_activity_at: { _null: true } },
								{ last_activity_at: { _lt: debounceCutoff } },
							],
						},
					],
				},
				limit: -1,
				fields: ['id'],
			} as any,
			{ last_activity_at: now } as any,
		),
	);

	return { bumped: Array.isArray(updated) ? updated.length : 0, requested: uniqIds.length };
});
