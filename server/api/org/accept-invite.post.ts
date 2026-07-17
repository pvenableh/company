// server/api/org/accept-invite.post.ts
/**
 * Accept an organization invitation.
 *
 * Body: { membershipId, password? }
 *   - `membershipId` may resolve in either `org_memberships` (staff) OR
 *     `client_portal_users` (portal user). The id is checked against both.
 *
 * If the user is new (came via Directus invite), password is required and
 * will be used to accept the Directus invite first.
 *
 * Flow:
 * 1. Resolve the row in either table; validate it's pending
 * 2. If password provided and user status is 'invited', accept Directus invite
 * 3. Set status to 'active' with accepted_at timestamp on the same table
 * 4. Auto-login the user and return session
 */

import { readItems, updateItem, updateUser } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { membershipId, password, directusToken } = body;

    if (!membershipId) {
      throw createError({
        statusCode: 400,
        message: 'membershipId is required',
      });
    }

    const directus = getServerDirectus();

    // Look up the row in both tables. The id only lives in one of them.
    let collection: 'org_memberships' | 'client_portal_users' = 'org_memberships';
    let rows = await directus.request(
      readItems('org_memberships', {
        filter: { id: { _eq: membershipId } },
        fields: [
          'id',
          'status',
          'organization.id',
          'organization.name',
          'user.id',
          'user.email',
          'user.first_name',
          'user.last_name',
          'user.status',
          'role.id',
          'role.name',
          'role.slug',
        ],
        limit: 1,
      })
    ) as any[];

    if (!rows.length) {
      collection = 'client_portal_users';
      rows = await directus.request(
        readItems('client_portal_users', {
          filter: { id: { _eq: membershipId } },
          fields: [
            'id',
            'status',
            'organization.id',
            'organization.name',
            'user.id',
            'user.email',
            'user.first_name',
            'user.last_name',
            'user.status',
            'client.id',
            'client.name',
          ],
          limit: 1,
        } as any)
      ) as any[];
    }

    if (!rows.length) {
      throw createError({
        statusCode: 404,
        message: 'Invitation not found',
      });
    }

    const membership = rows[0];

    if (membership.status !== 'pending') {
      throw createError({
        statusCode: 400,
        message: membership.status === 'active'
          ? 'This invitation has already been accepted'
          : 'This invitation is no longer valid',
      });
    }

    const userEmail = membership.user?.email;
    const userStatus = membership.user?.status;

    // If user is in "invited" state and we have password + directus token,
    // accept the Directus invitation first
    if (userStatus === 'invited' && directusToken && password) {
      try {
        const { acceptUserInvite } = await import('@directus/sdk');
        const publicClient = getPublicDirectus();
        await publicClient.request(acceptUserInvite(directusToken, password));
        // Off: the app sends branded notification emails, so Directus's native
        // notification email would be a raw duplicate. acceptUserInvite can't
        // carry the flag, so set it on the now-active user.
        const invitedUserId = membership.user?.id;
        if (invitedUserId) {
          await directus.request(updateUser(invitedUserId, { email_notifications: false } as any)).catch(() => {});
        }
      } catch (acceptErr: any) {
        console.error('Directus invite accept error:', acceptErr);
        throw createError({
          statusCode: 400,
          message: 'Failed to accept invitation. The invite link may have expired.',
        });
      }
    } else if (userStatus === 'invited' && password && !directusToken) {
      // We sent the user our own branded invite email (Directus SMTP isn't
      // wired in every environment), so the Directus token from
      // `acceptUserInvite` never reaches them. Set the password directly via
      // the admin client and flip the user to `active` so they can sign in.
      try {
        const userId = membership.user?.id;
        if (!userId) throw new Error('Membership row has no user id');
        await directus.request(
          // email_notifications off — branded app emails already cover this
          // recipient; Directus's native one would be a raw duplicate.
          updateUser(userId, { password, status: 'active', email_notifications: false } as any),
        );
      } catch (setPwErr: any) {
        console.error('Admin-set password failed:', setPwErr);
        throw createError({
          statusCode: 500,
          message: 'Failed to set your password. Please try again or request a new invitation.',
        });
      }
    }

    // Activate the row in whichever table it lives
    await directus.request(
      updateItem(collection, membershipId, {
        status: 'active',
        accepted_at: new Date().toISOString(),
      } as any)
    );

    // Try to auto-login the user
    let loginResult = null;

    if (userEmail && password) {
      try {
        const tokens = await directusLogin(userEmail, password);
        const userData = await directusGetMe(tokens.access_token, [
          '*',
          'role.id',
          'role.name',
          'avatar.id',
        ]);

        await createUserSession(
          event,
          {
            id: userData.id,
            email: userData.email,
            first_name: userData.first_name,
            last_name: userData.last_name,
            avatar: typeof userData.avatar === 'object' ? userData.avatar?.id : userData.avatar,
            role: userData.role,
          },
          tokens
        );

        loginResult = {
          loggedIn: true,
          user: {
            id: userData.id,
            email: userData.email,
            first_name: userData.first_name,
            last_name: userData.last_name,
          },
        };
      } catch (loginErr: any) {
        // Login failed — user can still log in manually
        console.warn('Auto-login after invite accept failed:', loginErr?.message);
      }
    }

    return {
      success: true,
      message: 'You have joined the organization successfully',
      organization: {
        id: membership.organization?.id,
        name: membership.organization?.name,
      },
      role: collection === 'client_portal_users'
        ? { name: 'Client Portal', slug: 'client' }
        : { name: membership.role?.name, slug: membership.role?.slug },
      login: loginResult,
    };
  } catch (error: any) {
    console.error('Accept invite error:', error);

    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to accept invitation',
    });
  }
});
