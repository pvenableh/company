// server/api/org/invite-client.post.ts
/**
 * Invite a client user to an organization, scoped to a specific client record.
 *
 * Body: { email, organizationId, clientId }
 *
 * The role is automatically set to the org's "client" role.
 * The membership is scoped to the client record via the `client` FK.
 */

import { createItem, readItems, readUsers, readRoles, inviteUser } from '@directus/sdk';
import { ensureContactForUser } from '~~/server/utils/contact-sync';

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { email, organizationId, clientId } = body;

    if (!email || !organizationId || !clientId) {
      throw createError({
        statusCode: 400,
        message: 'email, organizationId, and clientId are required',
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

    // Verify the requesting user has permission (owner/admin/manager)
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
        message: 'Only owners, admins, and managers can invite client users',
      });
    }

    // Verify the client belongs to this org
    const clientRecord = await directus.request(
      readItems('clients', {
        filter: {
          id: { _eq: clientId },
          organization: { _eq: organizationId },
        },
        fields: ['id', 'name'],
        limit: 1,
      })
    ) as any[];

    if (!clientRecord.length) {
      throw createError({
        statusCode: 400,
        message: 'Client not found in this organization',
      });
    }

    // Find the "client" role for this org
    const clientRole = await directus.request(
      readItems('org_roles', {
        filter: {
          organization: { _eq: organizationId },
          slug: { _eq: 'client' },
        },
        fields: ['id'],
        limit: 1,
      })
    ) as any[];

    if (!clientRole.length) {
      throw createError({
        statusCode: 500,
        message: 'Client role not found. Please seed roles for this organization first.',
      });
    }

    const clientRoleId = clientRole[0].id;

    // Check if user exists
    const existingUsers = await directus.request(
      readUsers({
        filter: { email: { _eq: email } },
        fields: ['id', 'email'],
        limit: 1,
      })
    ) as any[];

    let targetUserId: string;
    let isNewUser = false;

    if (existingUsers.length > 0) {
      targetUserId = existingUsers[0].id;

      // Check for existing membership
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
            message: 'This user already has access to this organization',
          });
        }
        if (status === 'pending') {
          throw createError({
            statusCode: 409,
            message: 'An invitation is already pending for this user',
          });
        }
      }
    } else {
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

      try {
        await directus.request(
          inviteUser(email, directusRoleId, {
            invite_url: `${config.public.appUrl || ''}/auth/accept-org-invite`,
          })
        );
      } catch (inviteErr: any) {
        console.warn('Directus invite error (may be ok):', inviteErr?.message);
      }

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

    // Create the org_membership with client scope
    const membership = await directus.request(
      createItem('org_memberships', {
        organization: organizationId,
        user: targetUserId,
        role: clientRoleId,
        client: clientId,
        status: 'pending',
        invited_by: currentUserId,
        invited_at: new Date().toISOString(),
      })
    ) as any;

    // Legacy junction for backward compat
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

    // Ensure a Contact exists for this client user, linked to the client record
    try {
      await ensureContactForUser({
        directus,
        organizationId,
        userId: targetUserId,
        email,
        clientId,
        source: 'invite:client',
      });
    } catch (contactErr: any) {
      console.warn('Contact sync failed (non-fatal):', contactErr?.message);
    }

    return {
      success: true,
      message: isNewUser
        ? `Invitation sent to ${email}. They will receive an email to set up their account.`
        : `${email} has been invited as a client user for ${clientRecord[0].name}.`,
      membership: {
        id: membership.id,
        status: 'pending',
        clientId,
        isNewUser,
      },
    };
  } catch (error: any) {
    console.error('Invite client error:', error);

    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to invite client user',
    });
  }
});
