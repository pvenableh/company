// server/api/org/invite-details.post.ts
/**
 * Fetch details of a pending org invitation.
 * Used by the accept-org-invite page to display org name, role, brand, etc.
 *
 * Body: { membershipId }
 *
 * This is a public endpoint (no auth required) so invited users can view the
 * invitation — and now see it BRANDED as the inviting organization — before
 * accepting.
 *
 * The `membershipId` in the invite link is the row id of EITHER an
 * `org_memberships` row (staff invite) OR a `client_portal_users` row (client
 * portal invite). Both are minted with `status: 'pending'` and the same link
 * shape (`server/utils/invite-email.ts`). This endpoint therefore checks both
 * collections — previously it only queried `org_memberships`, so every client
 * portal invite 404'd here even though `accept-invite` handled both. The org
 * brand fields (logo / brand_color / whitelabel) are returned so the accept
 * page can render the agency's identity, matching the already-branded email.
 */

import { readItems } from '@directus/sdk';

// Org brand + identity fields surfaced to the (unauthenticated) accept page.
const ORG_FIELDS = [
  'organization.id',
  'organization.name',
  'organization.icon',
  'organization.logo',
  'organization.brand_color',
  'organization.whitelabel',
];

const USER_FIELDS = [
  'user.id',
  'user.email',
  'user.first_name',
  'user.last_name',
  'user.status',
];

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

    const directus = getServerDirectus();

    // 1. Staff invite — org_memberships (carries a real role relation).
    const memberships = (await directus.request(
      readItems('org_memberships', {
        filter: { id: { _eq: membershipId } },
        fields: [
          'id',
          'status',
          'invited_at',
          ...ORG_FIELDS,
          ...USER_FIELDS,
          'role.id',
          'role.name',
          'role.slug',
          'client.id',
          'client.name',
        ],
        limit: 1,
      }),
    )) as any[];

    if (memberships.length) {
      return { success: true, kind: 'member', membership: memberships[0] };
    }

    // 2. Client portal invite — client_portal_users (no role relation; the
    //    role is implicitly "Client Portal"). Normalize into the same shape the
    //    accept page consumes so it doesn't need to branch on invite kind.
    const portalUsers = (await directus.request(
      readItems('client_portal_users', {
        filter: { id: { _eq: membershipId } },
        fields: [
          'id',
          'status',
          'invited_at',
          ...ORG_FIELDS,
          ...USER_FIELDS,
          'client.id',
          'client.name',
        ],
        limit: 1,
      }),
    )) as any[];

    if (portalUsers.length) {
      const row = portalUsers[0];
      return {
        success: true,
        kind: 'portal',
        membership: {
          ...row,
          // Synthesized role so the page's existing role display works.
          role: { id: null, name: 'Client Portal', slug: 'client' },
        },
      };
    }

    throw createError({
      statusCode: 404,
      message: 'Invitation not found',
    });
  } catch (error: any) {
    console.error('Invite details error:', error);

    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to load invitation details',
    });
  }
});
