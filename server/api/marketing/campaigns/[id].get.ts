/**
 * Get a single marketing campaign with full plan data.
 */
import { readItem } from '@directus/sdk';

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

  const directus = await getUserDirectus(event);

  try {
    const campaign = await directus.request(
      readItem('marketing_campaigns', id, {
        fields: ['*'],
      }),
    );

    return campaign;
  } catch (error: any) {
    console.error('[campaigns/get] Error:', error.message);
    throw createError({ statusCode: 404, message: 'Campaign not found' });
  }
});
