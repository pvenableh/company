// server/api/scheduler/public-booking/[orgSlug]/[userSlug].get.ts
//
// Org-scoped public booking endpoint. URL: /api/scheduler/public-booking/<orgSlug>/<userSlug>
//
// Resolution order:
//   1. Look up the organization by `slug`. 404 if not found.
//   2. Resolve the user inside that org. `userSlug` may be a UUID (direct
//      `directus_users` lookup) OR a per-user `scheduler_settings.booking_page_slug`.
//      Either way, the resolved user must have an active row in that org's
//      junction (`users` o2m on organizations) — otherwise 404, so a known
//      user's UUID can't be used to brand under another org's URL.
//   3. Standard load: settings + availability + upcoming 30-day meetings.

import { createDirectus, rest, staticToken, readItems, readUser } from '@directus/sdk';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();
	const orgSlug = getRouterParam(event, 'orgSlug');
	const userSlug = getRouterParam(event, 'userSlug');

	if (!orgSlug || !userSlug) {
		throw createError({ statusCode: 400, message: 'orgSlug and userSlug are required' });
	}

	const serverToken = config.directusServerToken as string;
	const client = serverToken
		? createDirectus(config.public.directusUrl).with(rest()).with(staticToken(serverToken))
		: createDirectus(config.public.directusUrl).with(rest());

	try {
		// 1. Resolve user. Prefer booking_page_slug; fall back to UUID lookup
		//    if the slug looks like a UUID.
		let userId: string | null = null;

		const settingsBySlug = await client.request(
			readItems('scheduler_settings', {
				fields: ['user_id'],
				filter: { booking_page_slug: { _eq: userSlug } },
				limit: 1,
			}),
		);
		if (settingsBySlug.length > 0) {
			userId = (settingsBySlug[0] as any).user_id;
		} else if (UUID_RE.test(userSlug)) {
			userId = userSlug;
		}

		if (!userId) {
			throw createError({ statusCode: 404, message: 'User not found' });
		}

		// 2. Resolve org by slug AND verify the user is a member of it in
		//    a single query — uses the same `users.directus_users_id` reverse
		//    M2M walk that useOrganization relies on. If the org doesn't
		//    exist OR the user isn't in it, this returns []. Combined check
		//    means a known UUID can't be branded under another org's URL.
		const orgs = await client.request(
			readItems('organizations', {
				fields: ['id', 'name', 'slug', 'logo', 'brand_color', 'whitelabel', 'website'],
				filter: {
					slug: { _eq: orgSlug },
					users: { directus_users_id: { _eq: userId } },
				},
				limit: 1,
			}),
		);
		const organization = orgs[0];
		if (!organization) {
			throw createError({ statusCode: 404, message: 'Not found' });
		}

		const user = await client.request(
			readUser(userId, { fields: ['id', 'first_name', 'last_name', 'avatar', 'email'] }),
		);

		// 3. Settings + availability + meetings
		const settings = await client.request(
			readItems('scheduler_settings', {
				fields: ['*'],
				filter: { user_id: { _eq: user.id } },
				limit: 1,
			}),
		);
		const userSettings = settings[0] || {
			public_booking_enabled: true,
			default_duration: 30,
			booking_page_title: 'Schedule a meeting',
		};

		if (!userSettings.public_booking_enabled) {
			throw createError({ statusCode: 403, message: 'Booking is disabled for this user' });
		}

		const availability = await client.request(
			readItems('availability', {
				fields: ['*'],
				filter: { user_id: { _eq: user.id } },
			}),
		);

		const now = new Date();
		const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

		const existingMeetings = await client.request(
			readItems('video_meetings', {
				fields: ['scheduled_start', 'scheduled_end', 'duration_minutes'],
				filter: {
					_and: [
						{ host_user: { _eq: user.id } },
						{ status: { _in: ['scheduled', 'in_progress'] } },
						{ scheduled_start: { _gte: now.toISOString() } },
						{ scheduled_start: { _lte: thirtyDaysLater.toISOString() } },
					],
				},
			}),
		);

		const existingAppointments = await client.request(
			readItems('appointments', {
				fields: ['start_time', 'end_time'],
				filter: {
					_and: [
						{ user_created: { _eq: user.id } },
						{ status: { _neq: 'canceled' } },
						{ start_time: { _gte: now.toISOString() } },
						{ start_time: { _lte: thirtyDaysLater.toISOString() } },
					],
				},
			}),
		);

		return {
			organization: {
				id: organization.id,
				name: organization.name,
				slug: organization.slug,
				logo: organization.logo,
				brand_color: organization.brand_color,
				whitelabel: !!organization.whitelabel,
				website: organization.website,
			},
			user: { id: user.id, first_name: user.first_name, last_name: user.last_name, avatar: user.avatar },
			settings: userSettings,
			availability,
			meetings: [
				...existingMeetings,
				...existingAppointments.map((a: any) => ({ scheduled_start: a.start_time, scheduled_end: a.end_time })),
			],
		};
	} catch (error: any) {
		if (!error.statusCode) console.error('Error fetching booking data:', error);
		throw createError({
			statusCode: error.statusCode || 500,
			message: error.message || 'Failed to fetch booking data',
		});
	}
});
