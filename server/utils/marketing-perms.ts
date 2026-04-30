/**
 * Marketing-campaigns access guard.
 *
 * `marketing_campaigns` is currently provisioned without row-level Directus
 * permissions for any org role, so reads/writes via the user's session token
 * fail with "no permission to access collection". The marketing routes work
 * around this by using the server token after gating on org membership in
 * application code — same trust boundary the user-token path would have
 * once Directus perms are wired up.
 *
 * `requireOrgMembership(event, orgId)` — verify the caller is an active
 * member of `orgId`, throw 401/403 otherwise. Returns the membership row.
 *
 * `getMarketingCampaign(directus, id)` — fetch one campaign row by id with
 * the server token. Used by per-id routes that need the org id off the
 * campaign before they can run the membership check.
 */
import { readItems, readItem } from '@directus/sdk';

export async function requireOrgMembership(event: any, organizationId: string): Promise<{ userId: string; membershipId: string }> {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	if (!userId) {
		throw createError({ statusCode: 401, message: 'Authentication required' });
	}
	if (!organizationId) {
		throw createError({ statusCode: 400, message: 'organizationId is required' });
	}
	const directus = getTypedDirectus();
	const memberships = await directus.request(
		readItems('org_memberships', {
			filter: {
				_and: [
					{ user: { _eq: userId } },
					{ organization: { _eq: organizationId } },
					{ status: { _eq: 'active' } },
				],
			},
			fields: ['id'],
			limit: 1,
		}),
	) as any[];
	if (!memberships?.length) {
		throw createError({ statusCode: 403, message: 'You are not a member of this organization' });
	}
	return { userId, membershipId: memberships[0].id };
}

export async function getMarketingCampaign(id: string): Promise<{ id: string; organization: string | null } & Record<string, any>> {
	const directus = getTypedDirectus();
	const campaign = await directus.request(
		readItem('marketing_campaigns', id, { fields: ['*'] }),
	).catch(() => null) as any;
	if (!campaign) {
		throw createError({ statusCode: 404, message: 'Campaign not found' });
	}
	return campaign;
}
