// server/api/ai/tags.post.ts
/**
 * Create a new AI tag.
 *
 * Body:
 *   name:            string (required)
 *   organizationId:  string (required)
 *   color?:          string (hex)
 *   type?:           'category' | 'entity' (default 'category')
 *   entity_type?:    'client' | 'contact' | 'project'
 *   entity_id?:      string
 *
 * Returns: { tag: {...} }
 */

import { readItems, createItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;

  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const body = await readBody(event);
  const { name, organizationId, color, type, entity_type, entity_id } = body;

  if (!name?.trim()) {
    throw createError({ statusCode: 400, message: 'Tag name is required' });
  }
  if (!organizationId) {
    throw createError({ statusCode: 400, message: 'Organization ID is required' });
  }

  const directus = await getUserDirectus(event);

  try {
    // Generate slug
    const slug = name.trim().toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');

    // Check for duplicate slug within org
    const existing = await directus.request(
      readItems('ai_tags', {
        filter: {
          _and: [
            { organization: { _eq: organizationId } },
            { slug: { _eq: slug } },
          ],
        },
        fields: ['id'],
        limit: 1,
      }),
    );

    if ((existing as any[]).length > 0) {
      // Return existing tag instead of erroring
      return { tag: (existing as any[])[0], existed: true };
    }

    const tag = await directus.request(
      createItem('ai_tags', {
        name: name.trim(),
        slug,
        color: color || '#6366f1',
        type: type || 'category',
        entity_type: entity_type || null,
        entity_id: entity_id || null,
        organization: organizationId,
      }, {
        fields: ['id', 'name', 'slug', 'color', 'type', 'entity_type', 'entity_id', 'date_created'],
      }),
    );

    return { tag };
  } catch (error: any) {
    console.error('[ai/tags.post] Error:', error);
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to create AI tag',
    });
  }
});
