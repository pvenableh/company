/**
 * List marketing campaigns for the user's organization.
 *
 * Query params:
 *   organizationId: string (required)
 *   status: string (optional filter)
 *   type: 'campaign' | 'dashboard' (optional filter)
 */
import { readItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const query = getQuery(event);
  const organizationId = query.organizationId as string;
  if (!organizationId) {
    throw createError({ statusCode: 400, message: 'organizationId is required' });
  }

  const directus = await getUserDirectus(event);

  const filter: any = {
    organization: { _eq: organizationId },
  };
  if (query.status && query.status !== 'all') {
    filter.status = { _eq: query.status };
  }
  if (query.type) {
    filter.type = { _eq: query.type };
  }

  try {
    const campaigns = await directus.request(
      readItems('marketing_campaigns', {
        filter,
        fields: ['id', 'title', 'goal', 'status', 'type', 'start_date', 'end_date', 'date_created', 'date_updated', 'user_created'],
        sort: ['-date_created'],
        limit: 50,
      }),
    );

    return { campaigns };
  } catch (error: any) {
    console.error('[campaigns/list] Error:', error.message);
    throw createError({ statusCode: 500, message: 'Failed to fetch campaigns' });
  }
});
