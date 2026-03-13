// server/api/ai/sessions.get.ts
/**
 * List user's AI chat sessions.
 *
 * Query params:
 *   limit?:  number (default 25, max 100)
 *   page?:   number (default 1)
 *   status?: 'active' | 'archived' (default 'active')
 *
 * Returns: { sessions: [...], meta: { page, limit, total } }
 */

import { readItems, aggregate } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;

  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const query = getQuery(event);
  const limit = Math.min(Math.max(Number(query.limit) || 25, 1), 100);
  const page = Math.max(Number(query.page) || 1, 1);
  const status = query.status === 'archived' ? 'archived' : 'active';

  const directus = await getUserDirectus(event);

  try {
    const filter = {
      _and: [
        { user: { _eq: userId } },
        { status: { _eq: status } },
      ],
    };

    // Fetch sessions with pagination
    const sessions = await directus.request(
      readItems('ai_chat_sessions', {
        filter,
        fields: ['id', 'title', 'status', 'date_created', 'date_updated'],
        sort: ['-date_updated'],
        limit,
        offset: (page - 1) * limit,
      }),
    );

    // Get total count for pagination
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
      total = (sessions as any[]).length;
    }

    return {
      sessions,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (error: any) {
    console.error('[ai/sessions] Error:', error);
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to fetch AI chat sessions',
    });
  }
});
