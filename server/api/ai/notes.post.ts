// server/api/ai/notes.post.ts
/**
 * Create a new AI note.
 *
 * Body:
 *   title?:            string
 *   content:           string (required, markdown)
 *   organizationId:    string (required)
 *   sourceSession?:    string — chat session ID
 *   sourceMessageId?:  string — message ID reference
 *   tagIds?:           string[] — tag IDs to attach
 *
 * Returns: { note: {...} }
 */

import { createItem, createItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;

  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const body = await readBody(event);
  const { title, content, organizationId, sourceSession, sourceMessageId, tagIds } = body;

  if (!content?.trim()) {
    throw createError({ statusCode: 400, message: 'Content is required' });
  }

  if (!organizationId) {
    throw createError({ statusCode: 400, message: 'Organization ID is required' });
  }

  const directus = await getUserDirectus(event);

  try {
    // Auto-generate title and excerpt from content
    const plainText = content.replace(/[#*_~`>\[\]()!|-]/g, '').trim();
    const autoTitle = title?.trim() || plainText.substring(0, 80) + (plainText.length > 80 ? '...' : '');
    const excerpt = plainText.substring(0, 200) + (plainText.length > 200 ? '...' : '');

    // Create the note
    const note = await directus.request(
      createItem('ai_notes', {
        title: autoTitle,
        content: content.trim(),
        excerpt,
        organization: organizationId,
        user: userId,
        source_session: sourceSession || null,
        source_message_id: sourceMessageId || null,
        status: 'active',
        is_pinned: false,
      }, {
        fields: ['id', 'title', 'excerpt', 'status', 'is_pinned', 'date_created'],
      }),
    );

    // Attach tags via junction if provided
    if (tagIds?.length > 0 && (note as any)?.id) {
      const junctionRecords = tagIds.map((tagId: string, idx: number) => ({
        ai_notes_id: (note as any).id,
        ai_tags_id: tagId,
        sort: idx,
      }));

      await directus.request(
        createItems('ai_notes_ai_tags', junctionRecords),
      ).catch((err: any) => {
        console.warn('[ai/notes.post] Failed to create tag junctions:', err.message);
      });
    }

    return { note };
  } catch (error: any) {
    console.error('[ai/notes.post] Error:', error);
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to create AI note',
    });
  }
});
