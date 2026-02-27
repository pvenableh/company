// server/api/scheduler/available-hosts.get.ts
// Returns admin users who have public booking enabled (for clients to find)
import { readItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const session = await getUserSession(event);
	if (!session?.user?.id) {
		throw createError({ statusCode: 401, message: 'Unauthorized' });
	}

	const directus = await getUserDirectus(event);

	// Get scheduler settings where public booking is enabled
	const settings = await directus.request(
		readItems('scheduler_settings', {
			filter: {
				public_booking_enabled: { _eq: true },
			},
			fields: [
				'user_id.id',
				'user_id.first_name',
				'user_id.last_name',
				'user_id.email',
				'user_id.avatar',
				'default_duration',
				'default_meeting_type',
				'booking_page_slug',
				'booking_page_title',
				'booking_page_description',
			],
		}),
	);

	const hosts = settings.map((s: any) => ({
		id: s.user_id?.id,
		first_name: s.user_id?.first_name,
		last_name: s.user_id?.last_name,
		email: s.user_id?.email,
		avatar: s.user_id?.avatar,
		default_duration: s.default_duration,
		default_meeting_type: s.default_meeting_type,
		booking_page_slug: s.booking_page_slug,
		booking_page_title: s.booking_page_title,
		booking_page_description: s.booking_page_description,
	})).filter((h: any) => h.id);

	return { success: true, data: hosts };
});
