// server/api/scheduler/calendar-connections/[id].patch.ts
// Update display/behaviour of one of the current user's calendar connections.
// Only whitelisted display fields are writable — never tokens.

import { readItem, updateItem } from '@directus/sdk';

const WRITABLE = ['display_name', 'color', 'blocks_availability', 'show_on_calendar', 'is_write_target', 'enabled'] as const;

export default defineEventHandler(async (event) => {
	const session = await getUserSession(event);
	if (!session?.user?.id) throw createError({ statusCode: 401, message: 'Unauthorized' });
	const userId = session.user.id as string;
	const id = getRouterParam(event, 'id');
	if (!id) throw createError({ statusCode: 400, message: 'Missing id' });

	const directus = getTypedDirectus();

	// Ownership check.
	const row = (await directus.request((readItem as any)('calendar_connections', id, { fields: ['id', 'user'] }).catch(() => null))) as any;
	const owner = row && (typeof row.user === 'object' ? row.user?.id : row.user);
	if (!row || owner !== userId) throw createError({ statusCode: 404, message: 'Connection not found' });

	const body = await readBody(event);
	const patch: Record<string, any> = {};
	for (const k of WRITABLE) if (k in body) patch[k] = body[k];
	if (Object.keys(patch).length === 0) throw createError({ statusCode: 400, message: 'No writable fields' });

	const updated = await directus.request((updateItem as any)('calendar_connections', id, patch, {
		fields: ['id', 'provider', 'account_email', 'display_name', 'color', 'blocks_availability', 'show_on_calendar', 'is_write_target', 'enabled'],
	}));
	return { success: true, data: updated };
});
