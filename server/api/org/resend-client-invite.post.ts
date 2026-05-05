// server/api/org/resend-client-invite.post.ts
/**
 * Resend a client portal invitation by re-triggering the Directus invite email.
 *
 * Body: { membershipId, organizationId }
 *
 * Only re-sends for memberships in `pending` status. Already-active members
 * return 409. Same role check as invite-client (owner/admin/manager only).
 */

import { readItem, readItems, readUser, inviteUser } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { membershipId, organizationId } = body;

    if (!membershipId || !organizationId) {
      throw createError({
        statusCode: 400,
        message: 'membershipId and organizationId are required',
      });
    }

    const directus = getServerDirectus();
    const config = useRuntimeConfig();

    const session = await getUserSession(event);
    const currentUserId = session?.user?.id;

    if (!currentUserId) {
      throw createError({ statusCode: 401, message: 'Not authenticated' });
    }

    const requesterMembership = await directus.request(
      readItems('org_memberships', {
        filter: {
          organization: { _eq: organizationId },
          user: { _eq: currentUserId },
          status: { _eq: 'active' },
        },
        fields: ['id', 'role.slug'],
        limit: 1,
      })
    ) as any[];

    const requesterRole = requesterMembership[0]?.role?.slug;
    if (!requesterRole || !['owner', 'admin', 'manager'].includes(requesterRole)) {
      throw createError({
        statusCode: 403,
        message: 'Only owners, admins, and managers can resend client invitations',
      });
    }

    const membership = await directus.request(
      readItem('org_memberships', membershipId, {
        fields: ['id', 'status', 'organization', 'user', 'role.slug'],
      })
    ) as any;

    if (!membership || membership.organization !== organizationId) {
      throw createError({ statusCode: 404, message: 'Membership not found in this organization' });
    }

    if (membership.role?.slug !== 'client') {
      throw createError({ statusCode: 400, message: 'This route only resends client portal invitations' });
    }

    if (membership.status === 'active') {
      throw createError({ statusCode: 409, message: 'This user already has active access' });
    }

    if (membership.status === 'suspended') {
      throw createError({ statusCode: 400, message: 'Cannot resend invite to a suspended user — restore access first' });
    }

    const userId = typeof membership.user === 'string' ? membership.user : membership.user?.id;
    if (!userId) {
      throw createError({ statusCode: 500, message: 'Membership has no associated user' });
    }

    const user = await directus.request(
      readUser(userId, { fields: ['id', 'email', 'role'] })
    ) as any;

    if (!user?.email) {
      throw createError({ statusCode: 500, message: 'User email not found' });
    }

    const directusRoleId = (typeof user.role === 'string' ? user.role : user.role?.id)
      || config.public.directusRoleUser
      || null;

    if (!directusRoleId) {
      throw createError({
        statusCode: 500,
        message: 'Cannot determine Directus role for invite',
      });
    }

    try {
      await directus.request(
        inviteUser(user.email, directusRoleId, {
          invite_url: `${config.public.appUrl || ''}/auth/accept-org-invite`,
        })
      );
    } catch (inviteErr: any) {
      console.warn('Directus resend invite error (may be ok):', inviteErr?.message);
    }

    return {
      success: true,
      message: `Invitation resent to ${user.email}.`,
    };
  } catch (error: any) {
    console.error('Resend client invite error:', error);
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to resend invitation',
    });
  }
});
