/**
 * Delete (archive) a marketing campaign.
 */
import { updateItem, deleteItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, message: 'Campaign ID is required' });
  }

  const existing = await getMarketingCampaign(id);
  await requireOrgMembership(event, existing.organization || '');

  const query = getQuery(event);
  const hard = query.hard === 'true';

  const directus = getTypedDirectus();
  try {
    if (hard) {
      await directus.request(deleteItem('marketing_campaigns', id));
    } else {
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
