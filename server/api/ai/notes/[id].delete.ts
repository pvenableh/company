// server/api/ai/notes/[id].delete.ts
/**
 * Delete an AI note. Cascades to junction records.
 */

import { readItem, deleteItem } from '@directus/sdk';

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
    // Verify ownership
    const existing = await directus.request(
      readItem('ai_notes', noteId, { fields: ['id', 'user'] }),
    );

    if ((existing as any)?.user !== userId) {
      throw createError({ statusCode: 403, message: 'Access denied' });
    }

    await directus.request(deleteItem('ai_notes', noteId));

    return { success: true, noteId };
  } catch (error: any) {
    if (error.statusCode === 403) throw error;
    console.error('[ai/notes/[id].delete] Error:', error);
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to delete AI note',
    });
  }
});
