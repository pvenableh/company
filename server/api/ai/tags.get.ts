// server/api/ai/tags.get.ts
/**
 * List AI tags for an organization.
 *
 * Query params:
 *   organizationId: string (required)
 *   type?:          'category' | 'entity'
 *   search?:        string
 *
 * Returns: { tags: [...] }
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
  const type = query.type as string;
  const search = (query.search as string)?.trim() || '';

  if (!organizationId) {
    throw createError({ statusCode: 400, message: 'Organization ID is required' });
  }

  const directus = await getUserDirectus(event);

  try {
    const filterConditions: any[] = [
      { organization: { _eq: organizationId } },
    ];

    if (type === 'category' || type === 'entity') {
      filterConditions.push({ type: { _eq: type } });
    }

    if (search) {
      filterConditions.push({ name: { _icontains: search } });
    }

    const tags = await directus.request(
      readItems('ai_tags', {
        filter: { _and: filterConditions },
        fields: ['id', 'name', 'slug', 'color', 'type', 'entity_type', 'entity_id', 'date_created'],
        sort: ['type', 'name'],
        limit: 200,
      }),
    );

    return { tags };
  } catch (error: any) {
    console.error('[ai/tags] Error:', error);
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to fetch AI tags',
    });
  }
});
