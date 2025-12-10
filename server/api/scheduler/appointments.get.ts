// server/api/scheduler/appointments.get.ts
import { createDirectus, rest, readItems, staticToken } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();
	
	const client = createDirectus(config.public.directusUrl)
		.with(staticToken(config.directusServerToken))
		.with(rest());

	try {
		const data = await client.request(
			readItems('appointments', {
				fields: ['*', 'video_meeting.*', 'attendees.*', 'user_created.first_name', 'user_created.last_name'],
				filter: { status: { _neq: 'archived' } },
				sort: ['-start_time'],
				limit: 100,
			})
		);
		return { data };
	} catch (error: any) {
		throw createError({ statusCode: 500, message: error.message });
	}
});
