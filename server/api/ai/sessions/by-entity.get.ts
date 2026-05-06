// server/api/ai/sessions/by-entity.get.ts
/**
 * Find the most recent active chat session for a specific entity.
 *
 * Query params:
 *   entityType: 'client' | 'project' | 'invoice'
 *   entityId: string
 *
 * Returns: { session, messages } or { session: null } if none found.
 */

import { readItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;

  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const query = getQuery(event);
  const { entityType, entityId } = query;

  if (!entityType || !entityId) {
    throw createError({ statusCode: 400, message: 'entityType and entityId are required' });
  }

  const directus = await getUserDirectus(event);

  try {
    // Fetch recent active sessions for this user that have context set.
    // Directus doesn't support deep JSON path filtering on the context field,
    // so we fetch recent sessions with context and filter in-memory.
    const sessions = await directus.request(
      readItems('ai_chat_sessions', {
        filter: {
          _and: [
            { user: { _eq: userId } },
            { status: { _eq: 'active' } },
            { context: { _nnull: true } },
          ],
        },
        fields: ['id', 'title', 'status', 'context', 'date_created', 'date_updated'],
        sort: ['-date_updated'],
        limit: 20,
      }),
    ) as any[];

    // Filter in-memory for matching entity
    const match = sessions.find((s: any) => {
      const ctx = s.context;
      return ctx && ctx.entityType === entityType && ctx.entityId === entityId;
    });

    if (!match) {
      return { session: null, messages: [] };
    }

    // Fetch messages for this session + which ones the user has already
    // bookmarked as notes (so the sidebar can restore the saved-state badge
    // instead of showing the bookmark icon as if nothing was saved).
    const [messages, savedNotes] = await Promise.all([
      directus.request(
        readItems('ai_chat_messages', {
          filter: { session: { _eq: match.id } },
          fields: ['id', 'role', 'content', 'date_created'],
          sort: ['date_created'],
          limit: 50,
        }),
      ),
      directus.request(
        readItems('ai_notes', {
          filter: {
            _and: [
              { user: { _eq: userId } },
              { source_session: { _eq: match.id } },
              { status: { _eq: 'active' } },
              { source_message_id: { _nnull: true } },
            ],
          },
          fields: ['source_message_id'],
          limit: 200,
        }),
      ).catch(() => []) as Promise<any[]>,
    ]);

    const savedMessageIds = (savedNotes as any[])
      .map((n) => n.source_message_id)
      .filter(Boolean);

    return { session: match, messages, savedMessageIds };
  } catch (error: any) {
    console.error('[ai/sessions/by-entity] Error:', error);
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to find entity session',
    });
  }
});
