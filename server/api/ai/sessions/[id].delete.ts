// server/api/ai/sessions/[id].delete.ts
/**
 * Delete (archive) an AI chat session.
 *
 * Path params:
 *   id: string — Session UUID
 *
 * Soft-deletes by setting status to 'archived'.
 * Returns: { success: true, sessionId }
 */

import { readItem, updateItem } from '@directus/sdk';

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

  const directus = await getUserDirectus(event);

  try {
    // Fetch the session to verify ownership
    const chatSession = await directus.request(
      readItem('ai_chat_sessions', sessionId, {
        fields: ['id', 'user'],
      }),
    );

    // Verify ownership
    if ((chatSession as any).user !== userId) {
      throw createError({ statusCode: 403, message: 'Access denied' });
    }

    // Soft-delete by archiving
    await directus.request(
      updateItem('ai_chat_sessions', sessionId, {
        status: 'archived',
      }),
    );

    return {
      success: true,
      sessionId,
    };
  } catch (error: any) {
    if (error.statusCode) throw error;
    console.error('[ai/sessions/delete] Error:', error);
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to delete AI chat session',
    });
  }
});
