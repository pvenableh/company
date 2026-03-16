// server/api/org/accept-invite.post.ts
/**
 * Accept an organization invitation.
 *
 * Body: { membershipId, password? }
 *
 * If the user is new (came via Directus invite), password is required
 * and will be used to accept the Directus invite first.
 *
 * Flow:
 * 1. Validate the membership exists and is pending
 * 2. If password provided and user status is 'invited', accept Directus invite
 * 3. Set membership status to 'active' with accepted_at timestamp
 * 4. Auto-login the user and return session
 */

import { readItems, updateItem, readUsers } from '@directus/sdk';

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

    // Fetch the membership with related data
    const memberships = await directus.request(
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

    const membership = memberships[0];

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
      } catch (acceptErr: any) {
        console.error('Directus invite accept error:', acceptErr);
        throw createError({
          statusCode: 400,
          message: 'Failed to accept invitation. The invite link may have expired.',
        });
      }
    }

    // Activate the org membership
    await directus.request(
      updateItem('org_memberships', membershipId, {
        status: 'active',
        accepted_at: new Date().toISOString(),
      })
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
      role: {
        name: membership.role?.name,
        slug: membership.role?.slug,
      },
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
