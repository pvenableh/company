// server/api/ai/tags/[id].delete.ts
/**
 * Delete an AI tag. Junction records cascade on delete.
 */

import { readItem, deleteItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;

  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const tagId = getRouterParam(event, 'id');
  if (!tagId) {
    throw createError({ statusCode: 400, message: 'Tag ID is required' });
  }

  const directus = await getUserDirectus(event);

  try {
    // Verify the tag exists and belongs to the user's org
    const tag = await directus.request(
      readItem('ai_tags', tagId, { fields: ['id', 'user_created'] }),
    );

    if (!tag) {
      throw createError({ statusCode: 404, message: 'Tag not found' });
    }

    await directus.request(deleteItem('ai_tags', tagId));

    return { success: true, tagId };
  } catch (error: any) {
    if (error.statusCode === 404) throw error;
    console.error('[ai/tags/[id].delete] Error:', error);
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to delete AI tag',
    });
  }
});
