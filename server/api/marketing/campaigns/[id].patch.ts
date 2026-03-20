/**
 * Update a marketing campaign (status, title, dates, plan_data).
 */
import { updateItem } from '@directus/sdk';

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

  const body = await readBody(event);
  const directus = await getUserDirectus(event);

  // Only allow updating specific fields
  const updates: Record<string, any> = {};
  if (body.title !== undefined) updates.title = body.title;
  if (body.goal !== undefined) updates.goal = body.goal;
  if (body.status !== undefined) updates.status = body.status;
  if (body.plan_data !== undefined) updates.plan_data = body.plan_data;
  if (body.start_date !== undefined) updates.start_date = body.start_date;
  if (body.end_date !== undefined) updates.end_date = body.end_date;

  if (Object.keys(updates).length === 0) {
    throw createError({ statusCode: 400, message: 'No fields to update' });
  }

  try {
    const campaign = await directus.request(
      updateItem('marketing_campaigns', id, updates),
    );

    return campaign;
  } catch (error: any) {
    console.error('[campaigns/update] Error:', error.message);
    throw createError({ statusCode: 500, message: 'Failed to update campaign' });
  }
});
