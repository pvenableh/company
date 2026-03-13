// server/api/org/invite-details.post.ts
/**
 * Fetch details of a pending org invitation.
 * Used by the accept-org-invite page to display org name, role, etc.
 *
 * Body: { membershipId }
 *
 * This is a public endpoint (no auth required) so invited users
 * can view the invitation before accepting.
 */

import { readItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { membershipId } = body;

    if (!membershipId) {
      throw createError({
        statusCode: 400,
        message: 'membershipId is required',
      });
    }

    const directus = getTypedDirectus();

    const memberships = await directus.request(
      readItems('org_memberships', {
        filter: { id: { _eq: membershipId } },
        fields: [
          'id',
          'status',
          'invited_at',
          'organization.id',
          'organization.name',
          'organization.icon',
          'user.id',
          'user.email',
          'user.first_name',
          'user.last_name',
          'user.status',
          'role.id',
          'role.name',
          'role.slug',
          'client.id',
          'client.name',
        ],
        limit: 1,
      })
    ) as any[];

    if (!memberships.length) {
      throw createError({
        statusCode: 404,
        message: 'Invitation not found',
      });
    }

    return {
      success: true,
      membership: memberships[0],
    };
  } catch (error: any) {
    console.error('Invite details error:', error);

    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to load invitation details',
    });
  }
});
