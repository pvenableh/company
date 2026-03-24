/**
 * Toggle AI access for a member — Admin only.
 *
 * Body: { organizationId, userId, enabled: boolean }
 */
import { readItems, createItem, updateItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const adminId = (session as any).user?.id;
  if (!adminId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const body = await readBody(event);
  const { organizationId, userId, enabled } = body;

  if (!organizationId || !userId || typeof enabled !== 'boolean') {
    throw createError({ statusCode: 400, message: 'organizationId, userId, and enabled (boolean) are required' });
  }

  const directus = getTypedDirectus();

  // Verify caller is org admin/owner
  const memberships = await directus.request(
    readItems('org_memberships', {
      filter: {
        _and: [
          { user: { _eq: adminId } },
          { organization: { _eq: organizationId } },
          { status: { _eq: 'active' } },
        ],
      },
      fields: ['role.slug'],
      limit: 1,
    }),
  ) as any[];

  const callerRole = memberships?.[0]?.role?.slug;
  if (!callerRole || !['owner', 'admin'].includes(callerRole)) {
    throw createError({ statusCode: 403, message: 'Only organization owners and admins can manage member AI access' });
  }

  // Find or create ai_preferences for the target user
  const existing = await directus.request(
    readItems('ai_preferences', {
      filter: {
        _and: [
          { user: { _eq: userId } },
        ],
      },
      fields: ['id'],
      limit: 1,
    }),
  ) as any[];

  if (existing?.length) {
    await directus.request(
      updateItem('ai_preferences', existing[0].id, {
        ai_enabled: enabled,
      }),
    );
  } else {
    await directus.request(
      createItem('ai_preferences', {
        user: userId,
        ai_enabled: enabled,
      }),
    );
  }

  return { success: true, userId, enabled };
});
