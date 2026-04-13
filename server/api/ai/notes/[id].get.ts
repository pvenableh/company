// server/api/ai/notes/[id].get.ts
/**
 * Get a single AI note with full content and tags.
 * Verifies ownership before returning.
 */

import { readItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;

  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const noteId = getRouterParam(event, 'id');
  if (!noteId) {
    throw createError({ statusCode: 400, message: 'Note ID is required' });
  }

  const directus = await getUserDirectus(event);

  try {
    const note = await directus.request(
      readItem('ai_notes', noteId, {
        fields: [
          'id', 'title', 'content', 'excerpt', 'status', 'is_pinned',
          'source_session', 'source_message_id',
          'organization', 'user', 'date_created', 'date_updated',
          'tags.id', 'tags.ai_tags_id.id', 'tags.ai_tags_id.name',
          'tags.ai_tags_id.color', 'tags.ai_tags_id.type',
          'tags.ai_tags_id.entity_type', 'tags.ai_tags_id.entity_id',
        ],
      }),
    );

    // Verify ownership
    if ((note as any)?.user !== userId) {
      throw createError({ statusCode: 403, message: 'Access denied' });
    }

    return { note };
  } catch (error: any) {
    if (error.statusCode === 403) throw error;
    console.error('[ai/notes/[id]] Error:', error);
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to fetch AI note',
    });
  }
});
