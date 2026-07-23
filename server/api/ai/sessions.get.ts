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

    // Fetch sessions with pagination. `context` is returned so the client can
    // scope the history list to the entity a surface is focused on (project /
    // client / etc.). Sort by `-date_created` at the DB (always populated —
    // `date_updated` is NULL until a session is edited, and a NULLs-last DESC
    // sort would otherwise bury freshly-created sessions below older edited
    // ones); we then re-sort in memory by the coalesced "last active" time so
    // the list reads most-recently-active first.
    const sessions = await directus.request(
      readItems('ai_chat_sessions', {
        filter,
        fields: ['id', 'title', 'status', 'context', 'date_created', 'date_updated'],
        sort: ['-date_created'],
        limit,
        offset: (page - 1) * limit,
      }),
    ) as any[];

    sessions.sort((a, b) => {
      const ta = new Date(a.date_updated || a.date_created).getTime();
      const tb = new Date(b.date_updated || b.date_created).getTime();
      return tb - ta;
    });

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
