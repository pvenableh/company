/**
 * Create a new marketing campaign.
 */
import { createItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  if (!body.title?.trim()) {
    throw createError({ statusCode: 400, message: 'title is required' });
  }
  await requireOrgMembership(event, body.organization || '');

  const directus = getTypedDirectus();
  try {
    return await directus.request(
      createItem('marketing_campaigns', {
        title: body.title,
        goal: body.goal || null,
        status: body.status || 'draft',
        type: body.type || 'campaign',
        plan_data: body.plan_data || null,
        organization: body.organization,
        start_date: body.start_date || null,
        end_date: body.end_date || null,
      }),
    );
  } catch (error: any) {
    console.error('[campaigns/create] Error:', error.message);
    throw createError({ statusCode: 500, message: 'Failed to create campaign' });
  }
});
