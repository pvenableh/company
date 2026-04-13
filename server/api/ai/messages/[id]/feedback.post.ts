// server/api/ai/messages/[id]/feedback.post.ts
/**
 * Save feedback (thumbs up/down + optional correction) on an AI message.
 *
 * Path params:
 *   id: string — Message ID
 *
 * Body:
 *   rating: 'positive' | 'negative' (required)
 *   correction?: string (optional, typically provided with negative rating)
 *
 * Returns: { ok: true }
 */

import { readItem, updateItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;

  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const messageId = getRouterParam(event, 'id');
  if (!messageId) {
    throw createError({ statusCode: 400, message: 'Message ID is required' });
  }

  const body = await readBody(event);
  const { rating, correction } = body;

  if (!rating || !['positive', 'negative'].includes(rating)) {
    throw createError({ statusCode: 400, message: 'rating must be "positive" or "negative"' });
  }

  const directus = await getUserDirectus(event);

  try {
    // Verify ownership: message must belong to a session owned by this user
    const message = await directus.request(
      readItem('ai_chat_messages', messageId, {
        fields: ['id', 'session.user'],
      }),
    ) as any;

    if (!message) {
      throw createError({ statusCode: 404, message: 'Message not found' });
    }

    const sessionOwner = typeof message.session === 'object'
      ? message.session?.user
      : null;

    if (sessionOwner !== userId) {
      throw createError({ statusCode: 403, message: 'Access denied' });
    }

    // Save feedback as JSON field on the message
    const feedback: Record<string, any> = { rating };
    if (correction?.trim()) {
      feedback.correction = correction.trim().substring(0, 1000);
    }

    await directus.request(
      updateItem('ai_chat_messages', messageId, { feedback }),
    );

    return { ok: true };
  } catch (error: any) {
    if (error.statusCode) throw error;
    console.error('[ai/messages/feedback] Error:', error);
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to save feedback',
    });
  }
});
