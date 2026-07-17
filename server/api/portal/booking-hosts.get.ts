// server/api/portal/booking-hosts.get.ts
//
// Bookable hosts for a client-portal user: the members of the portal user's
// organization who have public booking enabled. Portal users are NOT org
// members (they live in client_portal_users), so this resolves the org from the
// verified portal context and reads via the admin client, scoped to that one org.
//
// Returns the same host shape as /api/scheduler/available-hosts so the portal
// booking page and the internal directory can share a card component.
import { readItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const ctx = await requirePortalContext(event);
	const directus = getServerDirectus();

	const orgs = (await directus.request(
		readItems('organizations', {
			fields: ['id', 'slug', 'name', 'users.directus_users_id'],
			filter: { id: { _eq: ctx.organizationId } },
			limit: 1,
		}),
	)) as any[];

	const org = orgs[0];
	if (!org) return { success: true, data: [], org: null };

	const memberUserIds = (org.users || [])
		.map((u: any) => (typeof u.directus_users_id === 'object' ? u.directus_users_id?.id : u.directus_users_id))
		.filter(Boolean);

	if (memberUserIds.length === 0) {
		return { success: true, data: [], org: { slug: org.slug, name: org.name } };
	}

	const settings = (await directus.request(
		readItems('scheduler_settings', {
			filter: {
				public_booking_enabled: { _eq: true },
				user_id: { _in: memberUserIds },
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
	)) as any[];

	const hosts = settings
		.map((s: any) => ({
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
			org_slug: org.slug,
		}))
		.filter((h: any) => h.id);

	return { success: true, data: hosts, org: { slug: org.slug, name: org.name } };
});
