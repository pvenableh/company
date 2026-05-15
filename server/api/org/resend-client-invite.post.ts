// server/api/org/resend-client-invite.post.ts
/**
 * Resend a client portal invitation by re-triggering the Directus invite email.
 *
 * Body: { membershipId, organizationId }
 *   - `membershipId` is the `client_portal_users` row id (kept named
 *     `membershipId` for backwards-compat with the existing UI calls).
 *
 * Only re-sends for rows in `pending` status. Already-active rows
 * return 409. Same role check as invite-client (owner/admin/manager only).
 */

import { readItem, readItems, readUser, inviteUser } from '@directus/sdk';
import { sendOrgInviteEmail } from '~~/server/utils/invite-email';

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

    const portalRow = await directus.request(
      readItem('client_portal_users', membershipId, {
        fields: ['id', 'status', 'organization', 'user', 'client'],
      } as any)
    ) as any;

    if (!portalRow || portalRow.organization !== organizationId) {
      throw createError({ statusCode: 404, message: 'Portal user not found in this organization' });
    }

    if (portalRow.status === 'active') {
      throw createError({ statusCode: 409, message: 'This user already has active access' });
    }

    if (portalRow.status === 'suspended') {
      throw createError({ statusCode: 400, message: 'Cannot resend invite to a suspended user — restore access first' });
    }

    const userId = typeof portalRow.user === 'string' ? portalRow.user : portalRow.user?.id;
    if (!userId) {
      throw createError({ statusCode: 500, message: 'Portal user row has no associated user' });
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

    // Branded resend email (always send so it works regardless of Directus SMTP).
    try {
      const [org, inviter, clientRow] = await Promise.all([
        directus.request(
          readItem('organizations' as any, organizationId, { fields: ['id', 'name'] as any }),
        ).catch(() => null) as Promise<any>,
        directus.request(
          readUser(currentUserId, { fields: ['id', 'first_name', 'last_name', 'email'] as any }),
        ).catch(() => null) as Promise<any>,
        (typeof portalRow.client === 'string' || typeof portalRow.client === 'number')
          ? directus.request(
            readItem('clients' as any, portalRow.client, { fields: ['id', 'name'] as any }),
          ).catch(() => null) as Promise<any>
          : Promise.resolve(portalRow.client || null),
      ]);
      const inviterName = inviter
        ? `${inviter.first_name || ''} ${inviter.last_name || ''}`.trim() || inviter.email || null
        : null;
      await sendOrgInviteEmail({
        to: user.email,
        inviterName,
        inviterEmail: inviter?.email || null,
        orgId: organizationId,
        orgName: org?.name || 'Earnest',
        membershipId: portalRow.id,
        roleLabel: 'Client Portal',
        clientName: clientRow?.name || null,
        isNewUser: false,
      });
    } catch (emailErr: any) {
      console.warn('Invite resend email failed (non-fatal):', emailErr?.message || emailErr);
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
