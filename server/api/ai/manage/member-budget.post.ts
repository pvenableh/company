/**
 * Set per-member monthly token budget — Admin only.
 *
 * Body: { organizationId, userId, budget: number | null }
 * Pass null to remove the budget (unlimited).
 */
import { readItems, createItem, updateItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const adminId = (session as any).user?.id;
  if (!adminId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const body = await readBody(event);
  const { organizationId, userId, budget } = body;

  if (!organizationId || !userId) {
    throw createError({ statusCode: 400, message: 'organizationId and userId are required' });
  }
  if (budget !== null && (typeof budget !== 'number' || budget < 0)) {
    throw createError({ statusCode: 400, message: 'budget must be a positive number or null' });
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
    throw createError({ statusCode: 403, message: 'Only organization owners and admins can set member budgets' });
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
        token_budget_monthly: budget,
      }),
    );
  } else {
    await directus.request(
      createItem('ai_preferences', {
        user: userId,
        token_budget_monthly: budget,
      }),
    );
  }

  return { success: true, userId, budget };
});
