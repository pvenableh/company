// server/api/ai/notes.get.ts
/**
 * List user's AI notes with pagination, tag filtering, and search.
 *
 * Query params:
 *   limit?:          number (default 25, max 100)
 *   page?:           number (default 1)
 *   status?:         'active' | 'archived' (default 'active')
 *   search?:         string — searches title and content
 *   tags?:           string — comma-separated tag IDs
 *   pinned?:         'true' — only pinned notes
 *   organizationId?: string
 *
 * Returns: { notes: [...], meta: { page, limit, total } }
 */

import { readItems, aggregate } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;

  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const query = getQuery(event);
  const limit = Math.min(Math.max(Number(query.limit) || 25, 1), 100);
  const page = Math.max(Number(query.page) || 1, 1);
  const status = query.status === 'archived' ? 'archived' : 'active';
  const search = (query.search as string)?.trim() || '';
  const tagIds = (query.tags as string)?.split(',').filter(Boolean) || [];
  const pinned = query.pinned === 'true';
  const organizationId = query.organizationId as string;

  const directus = await getUserDirectus(event);

  try {
    const filterConditions: any[] = [
      { user: { _eq: userId } },
      { status: { _eq: status } },
    ];

    if (organizationId) {
      filterConditions.push({ organization: { _eq: organizationId } });
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

    if (pinned) {
      filterConditions.push({ is_pinned: { _eq: true } });
    }

    const filter = { _and: filterConditions };

    const notes = await directus.request(
      readItems('ai_notes', {
        filter,
        fields: [
          'id', 'title', 'excerpt', 'status', 'is_pinned',
          'source_session', 'date_created', 'date_updated',
          'tags.id', 'tags.ai_tags_id.id', 'tags.ai_tags_id.name',
          'tags.ai_tags_id.color', 'tags.ai_tags_id.type',
          'tags.ai_tags_id.entity_type',
        ],
        sort: ['-is_pinned', '-date_updated'],
        limit,
        offset: (page - 1) * limit,
      }),
    );

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
      total = (notes as any[]).length;
    }

    return {
      notes,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  } catch (error: any) {
    console.error('[ai/notes] Error:', error);
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to fetch AI notes',
    });
  }
});
