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
 * Auth: intentionally unauthenticated. The only side effect this endpoint
 * can produce is a timestamp bump on `clients.last_activity_at`, which has
 * no security impact (it's a sort key). The write is also rate-limited by
 * the 5s debounce filter — an attacker can't generate write volume even
 * with unlimited request volume. Trust the URL as the secret.
 */
import { readItems, updateItems } from '@directus/sdk';

type IncomingBody =
	| { collection: 'projects' | 'tickets' | 'tasks'; itemIds: string[] | string }
	| { clientIds: string[] };

const FK_BY_COLLECTION: Record<string, string> = {
	projects: 'client',
	tickets: 'client',
	tasks: 'client_id',
};

/**
 * Directus's flow templating substitutes `{{$trigger.keys}}` as a JSON
 * string when wrapped in quotes — `"itemIds": "{{$trigger.keys}}"` ends up
 * as `"itemIds": "[\"id\"]"` after substitution. Even with unquoted
 * templates, edge cases (single-key updates, older Directus versions) can
 * arrive as bare strings. Accept all three shapes.
 */
function normalizeItemIds(raw: unknown): string[] {
	if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === 'string');
	if (typeof raw !== 'string' || !raw) return [];
	if (raw.startsWith('[')) {
		try {
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === 'string');
		} catch {
			/* fall through to single-id treatment */
		}
	}
	return [raw];
}

export default defineEventHandler(async (event) => {
	const body = (await readBody<IncomingBody>(event)) || ({} as IncomingBody);

	const directus = getTypedDirectus();
	let clientIds: string[] = [];

	if ('clientIds' in body && Array.isArray(body.clientIds)) {
		clientIds = body.clientIds.filter(Boolean);
	} else if ('collection' in body && body.collection) {
		const fk = FK_BY_COLLECTION[body.collection];
		if (!fk) {
			throw createError({ statusCode: 400, statusMessage: `Unsupported collection: ${body.collection}` });
		}
		const ids = normalizeItemIds((body as any).itemIds);
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
