// server/api/portal/enter-preview.post.ts
/**
 * Enter read-only "preview as client" mode.
 *
 * A staff owner/admin/manager of the org that owns the client can preview that
 * client's portal exactly as the client sees it. This validates the caller's
 * membership, then sets the `portal_preview_as` cookie so every subsequent
 * /api/portal/* call inherits the client scope (via requirePortalContext →
 * tryResolvePreviewContext) even as the query string drops on internal nav.
 *
 * The cookie is non-httpOnly on purpose: the client-side portal middleware
 * reads it to allow staff onto /portal, and the server re-verifies membership
 * on every call, so a tampered value simply yields a 403. Preview is strictly
 * read-only — portal write endpoints reject it via assertNotPreview().
 */
import { readItem, readItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  const userId = (session as any)?.user?.id as string | undefined;
  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const body = await readBody(event).catch(() => ({}));
  const clientId = body?.clientId as string | undefined;
  if (!clientId) {
    throw createError({ statusCode: 400, message: 'clientId is required' });
  }

  const directus = getServerDirectus();

  const client = (await directus
    .request(readItem('clients', clientId, { fields: ['id', 'organization', 'name'] }))
    .catch(() => null)) as any;
  const organizationId = client && (typeof client.organization === 'object' ? client.organization?.id : client.organization);
  if (!organizationId) {
    throw createError({ statusCode: 404, message: 'Client not found' });
  }

  const memberships = (await directus.request(
    readItems('org_memberships', {
      filter: {
        _and: [
          { user: { _eq: userId } },
          { organization: { _eq: organizationId } },
          { status: { _eq: 'active' } },
        ],
      },
      fields: ['id', 'role.slug'],
      limit: 1,
    }),
  )) as any[];
  const role = memberships?.[0]?.role?.slug;
  if (role !== 'owner' && role !== 'admin' && role !== 'manager') {
    throw createError({
      statusCode: 403,
      message: 'You do not have permission to preview this client’s portal.',
    });
  }

  setCookie(event, 'portal_preview_as', clientId, {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60, // 1 hour; cleared when the admin leaves /portal
  });

  return { success: true, clientId, clientName: client?.name ?? null };
});
