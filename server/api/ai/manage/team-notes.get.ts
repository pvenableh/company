/**
 * List all AI notes across the organization — Admin only.
 *
 * Query params:
 *   organizationId: string (required)
 *   limit?:         number (default 25, max 100)
 *   page?:          number (default 1)
 *   userId?:        string — filter by specific member
 *   search?:        string
 *   tags?:          string — comma-separated tag IDs
 *
 * Returns: { notes: [...], meta: { page, limit, total } }
 */
import { readItems, aggregate } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const organizationId = query.organizationId as string;
  if (!organizationId) {
    throw createError({ statusCode: 400, message: 'organizationId is required' });
  }

  await requireOrgPermission(event, organizationId, 'ai_usage', 'read');

  const limit = Math.min(Math.max(Number(query.limit) || 25, 1), 100);
  const page = Math.max(Number(query.page) || 1, 1);
  const filterUserId = query.userId as string | undefined;
  const search = (query.search as string)?.trim() || '';
  const tagIds = (query.tags as string)?.split(',').filter(Boolean) || [];

  const directus = getTypedDirectus();

  const filterConditions: any[] = [
    { organization: { _eq: organizationId } },
    { status: { _eq: 'active' } },
  ];

  if (filterUserId) {
    filterConditions.push({ user: { _eq: filterUserId } });
  }

  if (search) {
    filterConditions.push({
      _or: [
        { title: { _icontains: search } },
        { content: { _icontains: search } },
      ],
    });
  }

  if (tagIds.length > 0) {
    filterConditions.push({
      tags: { ai_tags_id: { _in: tagIds } },
    });
  }

  const filter = { _and: filterConditions };

  const notes = await directus.request(
    readItems('ai_notes', {
      filter,
      fields: [
        'id', 'title', 'excerpt', 'status', 'is_pinned',
        'date_created', 'date_updated',
        'user.id', 'user.first_name', 'user.last_name', 'user.avatar',
        'tags.id', 'tags.ai_tags_id.id', 'tags.ai_tags_id.name',
        'tags.ai_tags_id.color', 'tags.ai_tags_id.type',
      ],
      sort: ['-is_pinned', '-date_updated'],
      limit,
      offset: (page - 1) * limit,
    }),
  ) as any[];

  let total = 0;
  try {
    const countResult = await directus.request(
      aggregate('ai_notes', {
        aggregate: { count: ['id'] },
        query: { filter },
      }),
    );
    total = Number((countResult as any)?.[0]?.count?.id) || 0;
  } catch {
    total = notes.length;
  }

  return {
    notes,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
});
