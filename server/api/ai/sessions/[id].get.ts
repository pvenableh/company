// server/api/ai/sessions/[id].get.ts
/**
 * Get a single AI chat session with its messages.
 *
 * Path params:
 *   id: string — Session UUID
 *
 * Query params:
 *   messageLimit?: number (default 50, max 200)
 *
 * Returns: { session: {...}, messages: [...] }
 */

import { readItem, readItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;

  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const sessionId = getRouterParam(event, 'id');
  if (!sessionId) {
    throw createError({ statusCode: 400, message: 'Session ID is required' });
  }

  const query = getQuery(event);
  const messageLimit = Math.min(Math.max(Number(query.messageLimit) || 50, 1), 200);

  const directus = await getUserDirectus(event);

  try {
    // Fetch the session
    const chatSession = await directus.request(
      readItem('ai_chat_sessions', sessionId, {
        fields: ['id', 'title', 'status', 'user', 'date_created', 'date_updated'],
      }),
    );

    // Verify ownership
    if ((chatSession as any).user !== userId) {
      throw createError({ statusCode: 403, message: 'Access denied' });
    }

    // Fetch messages for this session
    const messages = await directus.request(
      readItems('ai_chat_messages', {
        filter: { session: { _eq: sessionId } },
        fields: ['id', 'role', 'content', 'date_created'],
        sort: ['date_created'],
        limit: messageLimit,
      }),
    );

    return {
      session: chatSession,
      messages,
    };
  } catch (error: any) {
    if (error.statusCode) throw error;
    console.error('[ai/sessions/id] Error:', error);
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to fetch AI chat session',
    });
  }
});
