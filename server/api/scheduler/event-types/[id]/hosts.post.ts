// server/api/scheduler/event-types/[id]/hosts.post.ts
// Replace the round-robin/collective host pool for an event type the caller owns.
// Body: { hostUserIds: string[] }. Writes event_type_hosts rows with the admin
// client (the junction has no client-facing perms); ownership is session-verified.

import { readItem, readItems, createItem, deleteItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const session = await getUserSession(event);
	if (!session?.user?.id) throw createError({ statusCode: 401, message: 'Unauthorized' });
	const userId = session.user.id as string;

	const id = getRouterParam(event, 'id');
	if (!id) throw createError({ statusCode: 400, message: 'Missing event type id' });

	const body = await readBody(event);
	const hostUserIds: string[] = Array.isArray(body?.hostUserIds)
		? Array.from(new Set(body.hostUserIds.filter((x: any) => typeof x === 'string' && x)))
		: [];

	const directus = getTypedDirectus();

	// Ownership: only the event type's owner may set its pool.
	const et = (await directus.request(
		(readItem as any)('event_types', id, { fields: ['id', 'host_user'] }).catch(() => null),
	)) as any;
	const owner = et && (typeof et.host_user === 'object' ? et.host_user?.id : et.host_user);
	if (!et || owner !== userId) throw createError({ statusCode: 404, message: 'Event type not found' });

	// Replace the pool.
	await directus.request((deleteItems as any)('event_type_hosts', {
		filter: { event_type: { _eq: id } },
	})).catch(() => {});

	for (const hid of hostUserIds) {
		await directus.request((createItem as any)('event_type_hosts', {
			event_type: id,
			host_user: hid,
			enabled: true,
		})).catch(() => {});
	}

	const rows = (await directus.request(
		(readItems as any)('event_type_hosts', { fields: ['host_user'], filter: { event_type: { _eq: id } } }),
	)) as any[];

	return { success: true, hostUserIds: rows.map((r) => (typeof r.host_user === 'object' ? r.host_user?.id : r.host_user)) };
});
