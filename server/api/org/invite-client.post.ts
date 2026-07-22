// server/api/org/invite-client.post.ts
/**
 * Invite a client user to an organization, scoped to a specific client record.
 *
 * Body: { email, organizationId, clientId }
 *
 * Writes to `client_portal_users` — the dedicated table for external portal
 * users (split out from `org_memberships` to kill role-slug discrimination
 * across the codebase).
 */

import { createItem, createUser, readItem, readItems, readUser, readUsers, readRoles } from '@directus/sdk';
import { ensureContactForUser } from '~~/server/utils/contact-sync';
import { sendOrgInviteEmail } from '~~/server/utils/invite-email';

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

      // Check for existing portal-user row scoped to THIS client. A user can
      // legitimately hold portal rows for multiple clients in the same org, so
      // existence must be checked at (org, user, client) — not just (org, user)
      // — otherwise the inviter sees "already has access" while the client's
      // Portal Access card (filtered by clientId) shows nobody.
      const existingPortalRow = await directus.request(
        readItems('client_portal_users', {
          filter: {
            organization: { _eq: organizationId },
            user: { _eq: targetUserId },
            client: { _eq: clientId },
          },
          fields: ['id', 'status'],
          limit: 1,
        } as any)
      ) as any[];

      if (existingPortalRow.length > 0) {
        const status = existingPortalRow[0].status;
        if (status === 'active') {
          throw createError({
            statusCode: 409,
            message: `This user already has portal access for ${clientRecord[0].name}`,
          });
        }
        if (status === 'pending') {
          throw createError({
            statusCode: 409,
            message: `An invitation is already pending for this user on ${clientRecord[0].name}`,
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

      // Create the portal user directly in the `invited` state. We do NOT use
      // Directus's `inviteUser()` — when SMTP is configured it sends its own
      // unbranded, non-pill email on top of our branded one. The branded accept
      // flow (`?membership=<id>`) sets the password directly at accept time, so
      // Directus's native invite token isn't needed. `email_notifications:false`
      // also suppresses native notification duplicates.
      let createdUser: any = null;
      try {
        createdUser = await directus.request(
          createUser({
            email,
            status: 'invited',
            role: directusRoleId,
            email_notifications: false,
          } as any)
        );
      } catch (createErr: any) {
        console.warn('Directus createUser error (may be a race):', createErr?.message);
      }

      let newUserId = createdUser?.id || null;
      if (!newUserId) {
        const newUsers = await directus.request(
          readUsers({
            filter: { email: { _eq: email } },
            fields: ['id'],
            limit: 1,
          })
        ) as any[];
        newUserId = newUsers[0]?.id || null;
      }

      if (!newUserId) {
        throw createError({
          statusCode: 500,
          message: 'Failed to create user invitation',
        });
      }

      targetUserId = newUserId;
    }

    // Create the client_portal_users row
    const portalRow = await directus.request(
      createItem('client_portal_users', {
        organization: organizationId,
        user: targetUserId,
        client: clientId,
        status: 'pending',
        invited_by: currentUserId,
        invited_at: new Date().toISOString(),
      } as any)
    ) as any;

    // NOTE: We deliberately do NOT create an `organizations_directus_users`
    // junction row for portal users. That legacy junction is what Directus
    // row-level filters key off to grant org-wide read access. A portal user
    // must only see their scoped client + child clients — the
    // `client_portal_users` row is the sole source of truth for their access.

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

    // Branded invite email — see invite-member.post.ts for rationale.
    try {
      const [org, inviter] = await Promise.all([
        directus.request(
          readItem('organizations' as any, organizationId, { fields: ['id', 'name'] as any }),
        ).catch(() => null) as Promise<any>,
        directus.request(
          readUser(currentUserId, { fields: ['id', 'first_name', 'last_name', 'email'] as any }),
        ).catch(() => null) as Promise<any>,
      ]);
      const inviterName = inviter
        ? `${inviter.first_name || ''} ${inviter.last_name || ''}`.trim() || inviter.email || null
        : null;
      await sendOrgInviteEmail({
        to: email,
        inviterName,
        inviterEmail: inviter?.email || null,
        orgId: organizationId,
        orgName: org?.name || 'Earnest',
        membershipId: portalRow.id,
        roleLabel: 'Client Portal',
        clientName: clientRecord[0].name,
        isNewUser,
      });
    } catch (emailErr: any) {
      console.warn('Invite email send failed (non-fatal):', emailErr?.message || emailErr);
    }

    return {
      success: true,
      message: isNewUser
        ? `Invitation sent to ${email}. They will receive an email to set up their account.`
        : `${email} has been invited as a client user for ${clientRecord[0].name}.`,
      membership: {
        id: portalRow.id,
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
