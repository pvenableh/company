/**
 * Delete (archive) a marketing campaign.
 */
import { updateItem, deleteItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, message: 'Campaign ID is required' });
  }

  const query = getQuery(event);
  const hard = query.hard === 'true';

  const directus = await getUserDirectus(event);

  try {
    if (hard) {
      await directus.request(deleteItem('marketing_campaigns', id));
    } else {
      // Soft delete — set status to archived
      await directus.request(
        updateItem('marketing_campaigns', id, { status: 'archived' }),
      );
    }

    return { success: true };
  } catch (error: any) {
    console.error('[campaigns/delete] Error:', error.message);
    throw createError({ statusCode: 500, message: 'Failed to delete campaign' });
  }
});
