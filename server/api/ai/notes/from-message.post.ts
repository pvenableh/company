// server/api/ai/notes/from-message.post.ts
/**
 * Convenience endpoint: save a chat message as an AI note.
 * Verifies session ownership before creating.
 *
 * Body:
 *   sessionId:      string (required)
 *   messageContent: string (required)
 *   messageId?:     string
 *   organizationId: string (required)
 *   title?:         string
 *   tagIds?:        string[]
 */

import { readItem, createItem, createItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;

  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const body = await readBody(event);
  const { sessionId, messageContent, messageId, organizationId, title, tagIds } = body;

  if (!messageContent?.trim()) {
    throw createError({ statusCode: 400, message: 'Message content is required' });
  }
  if (!organizationId) {
    throw createError({ statusCode: 400, message: 'Organization ID is required' });
  }

  const directus = await getUserDirectus(event);

  try {
    // Verify session ownership if sessionId provided
    if (sessionId) {
      const chatSession = await directus.request(
        readItem('ai_chat_sessions', sessionId, { fields: ['id', 'user'] }),
      );
      if ((chatSession as any)?.user !== userId) {
        throw createError({ statusCode: 403, message: 'Access denied to this chat session' });
      }
    }

    // Auto-generate title and excerpt
    const plainText = messageContent.replace(/[#*_~`>\[\]()!|-]/g, '').trim();
    const autoTitle = title?.trim() || plainText.substring(0, 80) + (plainText.length > 80 ? '...' : '');
    const excerpt = plainText.substring(0, 200) + (plainText.length > 200 ? '...' : '');

    const note = await directus.request(
      createItem('ai_notes', {
        title: autoTitle,
        content: messageContent.trim(),
        excerpt,
        organization: organizationId,
        user: userId,
        source_session: sessionId || null,
        source_message_id: messageId || null,
        status: 'active',
        is_pinned: false,
      }, {
        fields: ['id', 'title', 'excerpt', 'status', 'is_pinned', 'date_created'],
      }),
    );

    // Attach tags
    if (tagIds?.length > 0 && (note as any)?.id) {
      const junctionRecords = tagIds.map((tagId: string, idx: number) => ({
        ai_notes_id: (note as any).id,
        ai_tags_id: tagId,
        sort: idx,
      }));

      await directus.request(
        createItems('ai_notes_ai_tags', junctionRecords),
      ).catch((err: any) => {
        console.warn('[ai/notes/from-message] Failed to create tag junctions:', err.message);
      });
    }

    return { note };
  } catch (error: any) {
    if (error.statusCode === 403) throw error;
    console.error('[ai/notes/from-message] Error:', error);
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to save note from message',
    });
  }
});
