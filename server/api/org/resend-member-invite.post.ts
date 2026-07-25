// server/api/org/resend-member-invite.post.ts
/**
 * Resend a STAFF member invitation — re-issues a fresh branded invite email
 * (with a new signed, 7-day-expiring token) for a pending org_membership.
 *
 * Body: { membershipId, organizationId }
 *   - `membershipId` is the `org_memberships` row id.
 *
 * Only re-sends for rows in `pending` status (active → 409). Owner/admin only,
 * matching invite-member. Mirrors resend-client-invite.post.ts for staff.
 */

import { readItem, readItems, readUser } from '@directus/sdk';
import { sendOrgInviteEmail } from '~~/server/utils/invite-email';

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { membershipId, organizationId } = body;

    if (!membershipId || !organizationId) {
      throw createError({ statusCode: 400, message: 'membershipId and organizationId are required' });
    }

    const directus = getServerDirectus();

    const session = await getUserSession(event);
    const currentUserId = (session as any)?.user?.id as string | undefined;
    if (!currentUserId) {
      throw createError({ statusCode: 401, message: 'Not authenticated' });
    }

    // Same gate as invite-member: owner/admin of this org may (re)invite staff.
    const requesterMembership = (await directus.request(
      readItems('org_memberships', {
        filter: {
          organization: { _eq: organizationId },
          user: { _eq: currentUserId },
          status: { _eq: 'active' },
        },
        fields: ['id', 'role.slug'],
        limit: 1,
      }),
    )) as any[];
    const requesterRole = requesterMembership[0]?.role?.slug;
    if (!requesterRole || !['owner', 'admin'].includes(requesterRole)) {
      throw createError({ statusCode: 403, message: 'Only owners and admins can resend member invitations' });
    }

    const membership = (await directus.request(
      readItem('org_memberships', membershipId, {
        fields: ['id', 'status', 'organization', 'user', 'role.name'],
      } as any),
    ).catch(() => null)) as any;

    const membershipOrg = typeof membership?.organization === 'object' ? membership.organization?.id : membership?.organization;
    if (!membership || membershipOrg !== organizationId) {
      throw createError({ statusCode: 404, message: 'Membership not found in this organization' });
    }
    if (membership.status === 'active') {
      throw createError({ statusCode: 409, message: 'This user is already an active member' });
    }
    if (membership.status === 'suspended') {
      throw createError({ statusCode: 400, message: 'Cannot resend to a suspended member — reactivate instead' });
    }

    const userId = typeof membership.user === 'string' ? membership.user : membership.user?.id;
    if (!userId) {
      throw createError({ statusCode: 500, message: 'Membership has no associated user' });
    }
    const user = (await directus.request(
      readUser(userId, { fields: ['id', 'email', 'status'] }),
    )) as any;
    if (!user?.email) {
      throw createError({ statusCode: 500, message: 'User email not found' });
    }

    try {
      const [org, inviter] = await Promise.all([
        directus.request(readItem('organizations' as any, organizationId, { fields: ['id', 'name'] as any })).catch(() => null) as Promise<any>,
        directus.request(readUser(currentUserId, { fields: ['id', 'first_name', 'last_name', 'email'] as any })).catch(() => null) as Promise<any>,
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
        membershipId: membership.id,
        roleLabel: membership.role?.name || 'Member',
        // A never-accepted invitee is still status 'invited' → they set a
        // password; anyone else already has an account.
        isNewUser: user.status === 'invited',
      });
    } catch (emailErr: any) {
      console.warn('Member invite resend email failed (non-fatal):', emailErr?.message || emailErr);
    }

    return { success: true, message: `Invitation resent to ${user.email}.` };
  } catch (error: any) {
    console.error('Resend member invite error:', error);
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to resend invitation',
    });
  }
});
