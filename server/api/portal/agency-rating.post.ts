// server/api/portal/agency-rating.post.ts
/**
 * POST /api/portal/agency-rating
 *
 * Private feedback: a portal user rates the agency serving them. Stored in
 * `agency_ratings` (org staff/admins read; never public, never cross-org) with
 * org/client/user forced from the verified portal context, so the caller can't
 * spoof scope. Also drops a bell notification on the org owner so the feedback
 * is actually seen.
 *
 * Body: { rating: 1..5, comment?: string }
 */
import { createItem, readItems, createNotification } from '@directus/sdk';
import { requirePortalContext } from '~~/server/utils/portal-auth';

export default defineEventHandler(async (event) => {
  const ctx = await requirePortalContext(event);
  const body = await readBody(event);

  const rating = Number(body?.rating);
  const comment = typeof body?.comment === 'string' ? body.comment.trim().slice(0, 2000) : null;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw createError({ statusCode: 400, message: 'rating must be an integer 1–5' });
  }

  const directus = getServerDirectus();

  await directus.request(
    createItem('agency_ratings', {
      organization: ctx.organizationId,
      client: ctx.clientId,
      user: ctx.userId,
      rating,
      comment,
      status: 'published',
    } as any),
  );

  // Fire-and-forget: let the org's owners/admins know feedback arrived so it's
  // actually seen. Fan out to the org's active owner/admin memberships, minus
  // the rater themselves. (The server token can't read organizations.owner, so
  // memberships are the source of truth here.)
  try {
    const admins = (await directus.request(readItems('org_memberships', {
      filter: {
        organization: { _eq: ctx.organizationId },
        status: { _eq: 'active' },
        role: { slug: { _in: ['owner', 'admin'] } },
      },
      fields: ['user'],
      limit: 100,
    }))) as Array<{ user: string | { id: string } | null }>;

    const recipients = [...new Set(
      admins
        .map((a) => (typeof a.user === 'object' ? a.user?.id : a.user))
        .filter((id): id is string => !!id && id !== ctx.userId),
    )];

    const message = `A client rated your agency ${rating}/5${comment ? ` — “${comment.slice(0, 120)}”` : ''}.`;
    await Promise.all(recipients.map((recipient) => directus.request(
      createNotification({ recipient, subject: 'New client feedback', message, collection: 'agency_ratings', status: 'inbox' } as any),
    )));
  } catch (err) { console.error('[agency-rating] notify fanout failed:', err); }

  return { ok: true };
});
