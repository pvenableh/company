// server/api/portal/tickets.post.ts
/**
 * POST /api/portal/tickets
 *
 * Lets a client portal user open a new ticket inside their portal scope.
 * The route forces `organization` + `client` from the resolved portal
 * context so the caller can't open a ticket against a client outside their
 * scope, and falls back to the user's own root client when none is
 * supplied.
 *
 * Body: { title: string, description?: string, priority?: 'low'|'normal'|'high'|'urgent' }
 */

import { createItem } from '@directus/sdk';
import { requirePortalContext } from '~~/server/utils/portal-auth';

export default defineEventHandler(async (event) => {
  const ctx = await requirePortalContext(event);
  const body = await readBody(event);

  const title = (body?.title ?? '').toString().trim();
  if (!title) {
    throw createError({ statusCode: 400, message: 'title is required' });
  }

  const description = body?.description ? body.description.toString().trim() : undefined;
  const priority = ['low', 'normal', 'high', 'urgent'].includes(body?.priority)
    ? body.priority
    : 'normal';

  const directus = getServerDirectus();

  const created = await directus.request(
    createItem('tickets', {
      title,
      description,
      priority,
      status: 'Pending',
      organization: ctx.organizationId,
      client: ctx.clientId,
      user_created: ctx.userId,
    } as any),
  );

  return created;
});
