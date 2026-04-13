// server/api/ai/notes/[id].patch.ts
/**
 * Update an AI note (title, content, status, is_pinned, tags).
 *
 * Body (all optional):
 *   title?:    string
 *   content?:  string
 *   status?:   'active' | 'archived'
 *   is_pinned?: boolean
 *   tagIds?:   string[] — replaces all tags
 */

import { readItem, updateItem, readItems, deleteItems, createItems } from '@directus/sdk';

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

  const body = await readBody(event);
  const directus = await getUserDirectus(event);

  try {
    // Verify ownership
    const existing = await directus.request(
      readItem('ai_notes', noteId, { fields: ['id', 'user'] }),
    );

    if ((existing as any)?.user !== userId) {
      throw createError({ statusCode: 403, message: 'Access denied' });
    }

    // Build update payload
    const updates: Record<string, any> = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.content !== undefined) {
      updates.content = body.content;
      const plainText = body.content.replace(/[#*_~`>\[\]()!|-]/g, '').trim();
      updates.excerpt = plainText.substring(0, 200) + (plainText.length > 200 ? '...' : '');
    }
    if (body.status !== undefined) updates.status = body.status;
    if (body.is_pinned !== undefined) updates.is_pinned = body.is_pinned;

    // Update the note
    const note = await directus.request(
      updateItem('ai_notes', noteId, updates, {
        fields: ['id', 'title', 'excerpt', 'status', 'is_pinned', 'date_updated'],
      }),
    );

    // Replace tags if provided
    if (body.tagIds !== undefined) {
      // Delete existing junctions
      const existingJunctions = await directus.request(
        readItems('ai_notes_ai_tags', {
          filter: { ai_notes_id: { _eq: noteId } },
          fields: ['id'],
        }),
      ) as Array<{ id: number }>;

      if (existingJunctions.length > 0) {
        await directus.request(
          deleteItems('ai_notes_ai_tags', existingJunctions.map(j => j.id)),
        ).catch(() => {});
      }

      // Create new junctions
      if (body.tagIds.length > 0) {
        const junctionRecords = body.tagIds.map((tagId: string, idx: number) => ({
          ai_notes_id: noteId,
          ai_tags_id: tagId,
          sort: idx,
        }));

        await directus.request(
          createItems('ai_notes_ai_tags', junctionRecords),
        ).catch((err: any) => {
          console.warn('[ai/notes/[id].patch] Failed to update tag junctions:', err.message);
        });
      }
    }

    return { note };
  } catch (error: any) {
    if (error.statusCode === 403) throw error;
    console.error('[ai/notes/[id].patch] Error:', error);
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to update AI note',
    });
  }
});
