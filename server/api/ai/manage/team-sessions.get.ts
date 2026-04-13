/**
 * List all AI chat sessions across the organization — Admin only.
 *
 * Query params:
 *   organizationId: string (required)
 *   limit?:         number (default 25, max 100)
 *   page?:          number (default 1)
 *   userId?:        string — filter by specific member
 *
 * Returns: { sessions: [...], members: [...], meta: { page, limit, total } }
 */
import { readItems, aggregate } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const organizationId = query.organizationId as string;
  if (!organizationId) {
    throw createError({ statusCode: 400, message: 'organizationId is required' });
  }

  await requireOrgPermission(event, organizationId, 'ai_usage', 'read');

  const limit = Math.min(Math.max(Number(query.limit) || 25, 1), 100);
  const page = Math.max(Number(query.page) || 1, 1);
  const filterUserId = query.userId as string | undefined;

  const directus = getTypedDirectus();

  // Get all active org member IDs
  const memberships = await directus.request(
    readItems('org_memberships', {
      filter: {
        _and: [
          { organization: { _eq: organizationId } },
          { status: { _eq: 'active' } },
        ],
      },
      fields: ['user.id', 'user.first_name', 'user.last_name', 'user.avatar', 'role.name'],
      limit: -1,
    }),
  ) as any[];

  const memberMap = new Map<string, { id: string; name: string; avatar: string | null; role: string }>();
  for (const m of memberships) {
    const uid = m.user?.id;
    if (uid) {
      memberMap.set(uid, {
        id: uid,
        name: [m.user?.first_name, m.user?.last_name].filter(Boolean).join(' ') || 'Unknown',
        avatar: m.user?.avatar || null,
        role: m.role?.name || 'Member',
      });
    }
  }

  const userIds = filterUserId ? [filterUserId] : Array.from(memberMap.keys());
  if (userIds.length === 0) {
    return { sessions: [], members: [], meta: { page, limit, total: 0, totalPages: 0 } };
  }

  const filter = {
    _and: [
      { user: { _in: userIds } },
      { status: { _eq: 'active' } },
    ],
  };

  const sessions = await directus.request(
    readItems('ai_chat_sessions', {
      filter,
      fields: ['id', 'title', 'status', 'user', 'date_created', 'date_updated'],
      sort: ['-date_updated'],
      limit,
      offset: (page - 1) * limit,
    }),
  ) as any[];

  // Attach member info to each session
  const enriched = sessions.map((s: any) => {
    const uid = typeof s.user === 'object' ? s.user.id : s.user;
    const member = memberMap.get(uid);
    return {
      ...s,
      user_id: uid,
      user_name: member?.name || 'Unknown',
      user_avatar: member?.avatar || null,
      user_role: member?.role || 'Member',
    };
  });

  let total = 0;
  try {
    const countResult = await directus.request(
      aggregate('ai_chat_sessions', {
        aggregate: { count: ['id'] },
        query: { filter },
      }),
    );
    total = Number((countResult as any)?.[0]?.count?.id) || 0;
  } catch {
    total = sessions.length;
  }

  return {
    sessions: enriched,
    members: Array.from(memberMap.values()),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
});
