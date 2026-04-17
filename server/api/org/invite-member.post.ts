// server/api/org/invite-member.post.ts
/**
 * Invite a member to an organization with a specific org role.
 *
 * Body: { email, organizationId, roleId }
 *
 * Flow:
 * 1. Validates the requesting user has permission (owner/admin of the org)
 * 2. Checks if user already has a membership in this org
 * 3. Looks up or creates the Directus user
 * 4. Creates a pending org_membership
 * 5. Also creates the legacy junction entry for backward compat
 */

import { createItem, readItems, readUsers, readRoles, inviteUser, createUser } from '@directus/sdk';
import { ensureContactForUser } from '~~/server/utils/contact-sync';

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { email, organizationId, roleId } = body;

    if (!email || !organizationId || !roleId) {
      throw createError({
        statusCode: 400,
        message: 'email, organizationId, and roleId are required',
      });
    }

    const directus = getServerDirectus();
    const config = useRuntimeConfig();

    // Get the current user from session
    const session = await getUserSession(event);
    const currentUserId = session?.user?.id;

    if (!currentUserId) {
      throw createError({ statusCode: 401, message: 'Not authenticated' });
    }

    // Verify the requesting user is owner or admin of this org
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
    if (!requesterRole || !['owner', 'admin'].includes(requesterRole)) {
      throw createError({
        statusCode: 403,
        message: 'Only owners and admins can invite members',
      });
    }

    // Verify the role belongs to this org
    const targetRole = await directus.request(
      readItems('org_roles', {
        filter: {
          id: { _eq: roleId },
          organization: { _eq: organizationId },
        },
        fields: ['id', 'slug', 'name'],
        limit: 1,
      })
    ) as any[];

    if (!targetRole.length) {
      throw createError({
        statusCode: 400,
        message: 'Invalid role for this organization',
      });
    }

    // Prevent inviting someone as owner
    if (targetRole[0].slug === 'owner') {
      throw createError({
        statusCode: 400,
        message: 'Cannot invite someone as owner. Transfer ownership instead.',
      });
    }

    // Check if a user with this email already exists
    const existingUsers = await directus.request(
      readUsers({
        filter: { email: { _eq: email } },
        fields: ['id', 'email', 'first_name', 'last_name'],
        limit: 1,
      })
    ) as any[];

    let targetUserId: string;
    let isNewUser = false;

    if (existingUsers.length > 0) {
      targetUserId = existingUsers[0].id;

      // Check if they already have a membership in this org
      const existingMembership = await directus.request(
        readItems('org_memberships', {
          filter: {
            organization: { _eq: organizationId },
            user: { _eq: targetUserId },
          },
          fields: ['id', 'status'],
          limit: 1,
        })
      ) as any[];

      if (existingMembership.length > 0) {
        const status = existingMembership[0].status;
        if (status === 'active') {
          throw createError({
            statusCode: 409,
            message: 'This user is already a member of this organization',
          });
        }
        if (status === 'pending') {
          throw createError({
            statusCode: 409,
            message: 'An invitation is already pending for this user',
          });
        }
        // If suspended, we could reactivate — for now just error
        throw createError({
          statusCode: 409,
          message: 'This user has a suspended membership. Please reactivate instead.',
        });
      }
    } else {
      // User doesn't exist — create via Directus invite
      isNewUser = true;

      // Resolve the Directus system role for the new user
      let directusRoleId = config.public.directusRoleUser || null;

      if (!directusRoleId) {
        // Env var not set — query Directus for a non-admin role to assign
        try {
          const roles = await directus.request(
            readRoles({
              filter: { admin_access: { _eq: false } },
              fields: ['id', 'name'],
              limit: 1,
            })
          ) as any[];
          if (roles.length) {
            directusRoleId = roles[0].id;
          }
        } catch (roleErr: any) {
          console.warn('Failed to query Directus roles:', roleErr?.message);
        }
      }

      if (!directusRoleId) {
        throw createError({
          statusCode: 500,
          message: 'No default user role configured. Set NUXT_PUBLIC_DIRECTUS_ROLE_USER or create a non-admin role in Directus.',
        });
      }

      // Use Directus SDK invite to create the user with an invitation
      try {
        await directus.request(
          inviteUser(email, directusRoleId, {
            invite_url: `${config.public.appUrl || ''}/auth/accept-org-invite`,
          })
        );
      } catch (inviteErr: any) {
        // If invite fails (e.g. user exists but we didn't find them), log and continue
        console.warn('Directus invite error (may be ok):', inviteErr?.message);
      }

      // Re-fetch the user after invite (Directus creates the user record)
      const newUsers = await directus.request(
        readUsers({
          filter: { email: { _eq: email } },
          fields: ['id'],
          limit: 1,
        })
      ) as any[];

      if (!newUsers.length) {
        throw createError({
          statusCode: 500,
          message: 'Failed to create user invitation',
        });
      }

      targetUserId = newUsers[0].id;
    }

    // Create the org_membership (pending)
    const membership = await directus.request(
      createItem('org_memberships', {
        organization: organizationId,
        user: targetUserId,
        role: roleId,
        status: 'pending',
        invited_by: currentUserId,
        invited_at: new Date().toISOString(),
      })
    ) as any;

    // Also create legacy junction entry for backward compat
    try {
      const existingJunction = await directus.request(
        readItems('organizations_directus_users', {
          filter: {
            organizations_id: { _eq: organizationId },
            directus_users_id: { _eq: targetUserId },
          },
          fields: ['id'],
          limit: 1,
        })
      ) as any[];

      if (!existingJunction.length) {
        await directus.request(
          createItem('organizations_directus_users', {
            organizations_id: organizationId,
            directus_users_id: targetUserId,
          })
        );
      }
    } catch (junctionErr: any) {
      console.warn('Legacy junction create failed (non-fatal):', junctionErr?.message);
    }

    // Ensure a Contact exists for this user in this org
    try {
      await ensureContactForUser({
        directus,
        organizationId,
        userId: targetUserId,
        email,
        firstName: existingUsers[0]?.first_name || null,
        lastName: existingUsers[0]?.last_name || null,
        source: 'invite:member',
      });
    } catch (contactErr: any) {
      console.warn('Contact sync failed (non-fatal):', contactErr?.message);
    }

    return {
      success: true,
      message: isNewUser
        ? `Invitation sent to ${email}. They will receive an email to set up their account.`
        : `${email} has been invited to join the organization.`,
      membership: {
        id: membership.id,
        status: 'pending',
        isNewUser,
      },
    };
  } catch (error: any) {
    console.error('Invite member error:', error);

    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to invite member',
    });
  }
});
