/**
 * Get all org members with their AI access status, budgets, and usage — Admin only.
 *
 * Query: organizationId (required)
 */
import { readItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const adminId = (session as any).user?.id;
  if (!adminId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const query = getQuery(event);
  const organizationId = query.organizationId as string;
  if (!organizationId) {
    throw createError({ statusCode: 400, message: 'organizationId is required' });
  }

  const directus = getTypedDirectus();

  // Verify caller is org admin/owner
  const callerMembership = await directus.request(
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

  const callerRole = callerMembership?.[0]?.role?.slug;
  if (!callerRole || !['owner', 'admin'].includes(callerRole)) {
    throw createError({ statusCode: 403, message: 'Only organization owners and admins can view member AI settings' });
  }

  // Get all active members
  const memberships = await directus.request(
    readItems('org_memberships', {
      filter: {
        _and: [
          { organization: { _eq: organizationId } },
          { status: { _eq: 'active' } },
        ],
      },
      fields: ['user.id', 'user.first_name', 'user.last_name', 'user.email', 'user.avatar', 'role.slug', 'role.name'],
      limit: -1,
    }),
  ) as any[];

  const userIds = memberships.map((m: any) => m.user?.id).filter(Boolean);

  // Get AI preferences for all members
  let prefsMap = new Map<string, any>();
  if (userIds.length > 0) {
    const prefs = await directus.request(
      readItems('ai_preferences', {
        filter: { user: { _in: userIds } },
        fields: ['user', 'ai_enabled', 'token_budget_monthly', 'low_usage_mode'],
        limit: -1,
      }),
    ) as any[];

    for (const p of prefs || []) {
      const uid = typeof p.user === 'object' ? p.user.id : p.user;
      prefsMap.set(uid, p);
    }
  }

  // Get usage for current month
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  let usageMap = new Map<string, number>();
  if (userIds.length > 0) {
    const usageLogs = await directus.request(
      readItems('ai_usage_logs', {
        filter: {
          _and: [
            { user: { _in: userIds } },
            { organization: { _eq: organizationId } },
            { date_created: { _gte: monthStart.toISOString() } },
          ],
        },
        fields: ['user', 'total_tokens'],
        limit: -1,
      }),
    ) as any[];

    for (const log of usageLogs || []) {
      const uid = typeof log.user === 'object' ? log.user.id : log.user;
      usageMap.set(uid, (usageMap.get(uid) || 0) + (Number(log.total_tokens) || 0));
    }
  }

  // Combine into response
  const members = memberships.map((m: any) => {
    const uid = m.user?.id;
    const pref = prefsMap.get(uid);
    return {
      id: uid,
      name: [m.user?.first_name, m.user?.last_name].filter(Boolean).join(' ') || m.user?.email || 'Unknown',
      email: m.user?.email,
      avatar: m.user?.avatar,
      role: m.role?.name || m.role?.slug || 'member',
      aiEnabled: pref?.ai_enabled !== false, // Default to enabled
      tokenBudget: pref?.token_budget_monthly ?? null,
      lowUsageMode: pref?.low_usage_mode === true,
      tokensUsedThisMonth: usageMap.get(uid) || 0,
    };
  });

  return { members };
});
