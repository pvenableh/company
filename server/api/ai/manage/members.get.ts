/**
 * Get all org members with their AI access status, budgets, and usage — Admin only.
 *
 * Query: organizationId (required)
 */
import { readItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const organizationId = query.organizationId as string;
  if (!organizationId) {
    throw createError({ statusCode: 400, message: 'organizationId is required' });
  }

  // Reuse shared permission check — owner/admin bypass is built in
  await requireOrgPermission(event, organizationId, 'ai_usage', 'read');

  const directus = getTypedDirectus();

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

  // Get AI preferences — wrapped in try/catch for resilience
  let prefsMap = new Map<string, any>();
  if (userIds.length > 0) {
    try {
      const prefs = await directus.request(
        readItems('ai_preferences', {
          filter: {
            _and: [
              { user: { _in: userIds } },
              { organization: { _eq: organizationId } },
            ],
          },
          fields: ['user', 'ai_enabled', 'token_budget_monthly', 'low_usage_mode'],
          limit: -1,
        }),
      ) as any[];

      for (const p of prefs || []) {
        const uid = typeof p.user === 'object' ? p.user.id : p.user;
        prefsMap.set(uid, p);
      }
    } catch (err: any) {
      console.warn('[ai/manage/members] Could not fetch ai_preferences:', err.message);
    }
  }

  // Get usage for current month — wrapped in try/catch for resilience
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  let usageMap = new Map<string, number>();
  if (userIds.length > 0) {
    try {
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
    } catch (err: any) {
      console.warn('[ai/manage/members] Could not fetch ai_usage_logs:', err.message);
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
