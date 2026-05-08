// server/api/portal/set-active-scope.post.ts
/**
 * POST /api/portal/set-active-scope
 *
 * Sets the `portal_active_scope` cookie to the given clientId after verifying
 * the requesting user actually holds an active `client_portal_users` row for
 * that client. Powers the portal header's multi-root client switcher.
 *
 * Body: { clientId: string }
 */

import { readItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const clientId = typeof body?.clientId === 'string' ? body.clientId : '';

  if (!clientId) {
    throw createError({ statusCode: 400, message: 'clientId is required' });
  }

  const session = await getUserSession(event);
  const userId = session?.user?.id;
  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const directus = getServerDirectus();
  const rows = await directus.request(
    readItems('client_portal_users', {
      filter: {
        user: { _eq: userId },
        client: { _eq: clientId },
        status: { _eq: 'active' },
      },
      fields: ['id'],
      limit: 1,
    } as any)
  ) as any[];

  if (!rows.length) {
    throw createError({
      statusCode: 403,
      message: 'You do not have an active portal membership for this client',
    });
  }

  setCookie(event, 'portal_active_scope', clientId, {
    path: '/',
    sameSite: 'lax',
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 30,
  });

  return { success: true, clientId };
});
