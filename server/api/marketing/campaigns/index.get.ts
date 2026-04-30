/**
 * List marketing campaigns for the user's organization.
 *
 * Query params:
 *   organizationId: string (required)
 *   status: string (optional filter)
 *   type: 'campaign' | 'dashboard' (optional filter)
 *
 * Reads via the server token because `marketing_campaigns` has no row-level
 * Directus perms granted to org roles. We gate access by verifying the
 * caller has an active membership in `organizationId` first, which is the
 * same trust boundary the user-token path would have provided once perms
 * are wired up.
 */
import { readItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const organizationId = query.organizationId as string;
  await requireOrgMembership(event, organizationId);

  const directus = getTypedDirectus();
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
        fields: ['id', 'title', 'goal', 'status', 'type', 'plan_data', 'start_date', 'end_date', 'date_created', 'date_updated', 'user_created'],
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
