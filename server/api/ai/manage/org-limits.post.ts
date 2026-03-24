/**
 * Update organization-level AI token limits — Admin only.
 *
 * Body: { organizationId, monthlyLimit?: number | null, balance?: number | null }
 */
import { readItems, updateItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const adminId = (session as any).user?.id;
  if (!adminId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const body = await readBody(event);
  const { organizationId, monthlyLimit, balance } = body;

  if (!organizationId) {
    throw createError({ statusCode: 400, message: 'organizationId is required' });
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
    throw createError({ statusCode: 403, message: 'Only organization owners and admins can update AI limits' });
  }

  const updates: Record<string, any> = {};
  if (monthlyLimit !== undefined) {
    updates.ai_token_limit_monthly = monthlyLimit;
  }
  if (balance !== undefined) {
    updates.ai_token_balance = balance;
  }

  if (Object.keys(updates).length === 0) {
    throw createError({ statusCode: 400, message: 'At least one of monthlyLimit or balance must be provided' });
  }

  await directus.request(updateItem('organizations', organizationId, updates));

  return { success: true, ...updates };
});
