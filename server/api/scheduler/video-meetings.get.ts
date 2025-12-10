// server/api/scheduler/video-meetings.get.ts
import { createDirectus, rest, readItems, staticToken } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();
	
	const client = createDirectus(config.public.directusUrl)
		.with(staticToken(config.directusServerToken))
		.with(rest());

	try {
		const data = await client.request(
			readItems('video_meetings', {
				fields: ['*', 'host_user.first_name', 'host_user.last_name', 'related_contact.*', 'related_organization.*'],
				filter: { status: { _neq: 'archived' } },
				sort: ['-scheduled_start'],
				limit: 100,
			})
		);
		return { data };
	} catch (error: any) {
		throw createError({ statusCode: 500, message: error.message });
	}
});
