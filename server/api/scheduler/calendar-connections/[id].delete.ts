// server/api/scheduler/calendar-connections/[id].delete.ts
// Disconnect (delete) one of the current user's calendar connections.

import { readItem, deleteItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const session = await getUserSession(event);
	if (!session?.user?.id) throw createError({ statusCode: 401, message: 'Unauthorized' });
	const userId = session.user.id as string;
	const id = getRouterParam(event, 'id');
	if (!id) throw createError({ statusCode: 400, message: 'Missing id' });

	const directus = getTypedDirectus();

	const row = (await directus.request((readItem as any)('calendar_connections', id, { fields: ['id', 'user'] }).catch(() => null))) as any;
	const owner = row && (typeof row.user === 'object' ? row.user?.id : row.user);
	if (!row || owner !== userId) throw createError({ statusCode: 404, message: 'Connection not found' });

	await directus.request((deleteItem as any)('calendar_connections', id));
	return { success: true };
});
