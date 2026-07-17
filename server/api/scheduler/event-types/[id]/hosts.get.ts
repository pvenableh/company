// server/api/scheduler/event-types/[id]/hosts.get.ts
// Current round-robin/collective host pool for an event type the caller owns.

import { readItem, readItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const session = await getUserSession(event);
	if (!session?.user?.id) throw createError({ statusCode: 401, message: 'Unauthorized' });
	const userId = session.user.id as string;

	const id = getRouterParam(event, 'id');
	if (!id) throw createError({ statusCode: 400, message: 'Missing event type id' });

	const directus = getTypedDirectus();
	const et = (await directus.request(
		(readItem as any)('event_types', id, { fields: ['id', 'host_user'] }).catch(() => null),
	)) as any;
	const owner = et && (typeof et.host_user === 'object' ? et.host_user?.id : et.host_user);
	if (!et || owner !== userId) throw createError({ statusCode: 404, message: 'Event type not found' });

	const rows = (await directus.request(
		(readItems as any)('event_type_hosts', { fields: ['host_user', 'enabled'], filter: { event_type: { _eq: id } } }),
	)) as any[];

	return { success: true, hostUserIds: rows.map((r) => (typeof r.host_user === 'object' ? r.host_user?.id : r.host_user)) };
});
