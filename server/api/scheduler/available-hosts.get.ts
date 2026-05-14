// server/api/scheduler/available-hosts.get.ts
//
// Returns org members who have public booking enabled. Org-scoped: the
// caller must pass `?orgId=<uuid>` and must be an active member of that
// org. Without scoping this would leak every booking-enabled user across
// the whole SaaS to anyone signed in.
//
// Org slug is included in the payload so the legacy scheduler/index page
// can construct the canonical `/book/<orgSlug>/<userSlug>` URL without
// guessing which org the host belongs to.

import { readItems } from '@directus/sdk';
import { requireOrgMembership } from '~~/server/utils/marketing-perms';

export default defineEventHandler(async (event) => {
	const query = getQuery(event);
	const orgId = typeof query.orgId === 'string' ? query.orgId : null;
	if (!orgId) {
		throw createError({ statusCode: 400, message: 'orgId query parameter is required' });
	}

	// Verifies session + active membership; throws 401/403 otherwise.
	await requireOrgMembership(event, orgId);

	const directus = await getUserDirectus(event);

	// Pull the org's slug + member user ids in a single hop, then list
	// scheduler_settings filtered to those users with booking enabled.
	const orgs = await directus.request(
		readItems('organizations', {
			fields: ['id', 'slug', 'users.directus_users_id'],
			filter: { id: { _eq: orgId } },
			limit: 1,
		}),
	) as any[];

	const org = orgs[0];
	if (!org) {
		throw createError({ statusCode: 404, message: 'Organization not found' });
	}

	const memberUserIds = (org.users || [])
		.map((u: any) => (typeof u.directus_users_id === 'object' ? u.directus_users_id?.id : u.directus_users_id))
		.filter(Boolean);

	if (memberUserIds.length === 0) {
		return { success: true, data: [] };
	}

	const settings = await directus.request(
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
	);

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

	return { success: true, data: hosts };
});
