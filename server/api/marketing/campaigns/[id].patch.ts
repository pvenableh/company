/**
 * Update a marketing campaign (status, title, dates, plan_data).
 */
import { updateItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, message: 'Campaign ID is required' });
  }

  const existing = await getMarketingCampaign(id);
  await requireOrgMembership(event, existing.organization || '');

  const body = await readBody(event);

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

  const directus = getTypedDirectus();
  try {
    return await directus.request(updateItem('marketing_campaigns', id, updates));
  } catch (error: any) {
    console.error('[campaigns/update] Error:', error.message);
    throw createError({ statusCode: 500, message: 'Failed to update campaign' });
  }
});
