// server/api/scheduler/calendar-connections.get.ts
// List the current user's connected calendars. Refresh/access tokens are NEVER
// returned to the client — they stay server-side.

import { readItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const session = await getUserSession(event);
	if (!session?.user?.id) throw createError({ statusCode: 401, message: 'Unauthorized' });
	const userId = session.user.id as string;

	// Admin client + explicit user filter: tokens stay server-side and the new
	// collection needs no client-facing policy perms.
	const directus = getTypedDirectus();

	let rows: any[] = [];
	try {
		rows = (await directus.request(
			(readItems as any)('calendar_connections', {
				fields: ['id', 'provider', 'account_email', 'display_name', 'color', 'calendar_id', 'blocks_availability', 'show_on_calendar', 'is_write_target', 'enabled', 'date_created'],
				filter: { user: { _eq: userId } },
				sort: ['date_created'],
			}),
		)) as any[];
	} catch {
		rows = []; // collection missing / no perms
	}

	return { success: true, data: rows };
});
