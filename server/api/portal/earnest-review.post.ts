// server/api/portal/earnest-review.post.ts
/**
 * POST /api/portal/earnest-review
 *
 * A portal user rates/reviews the Earnest platform itself. Stored in the shared
 * `earnest_reviews` collection (a marketing/testimonial signal). `is_public`
 * lets the client opt in to public display; otherwise it's private feedback.
 * Attributed to the real user via the `user` field (set on the admin token).
 *
 * Body: { rating: 1..5, quote: string, isPublic?: boolean,
 *         displayName?: string, displayCompany?: string }
 */
import { createItem } from '@directus/sdk';
import { requirePortalContext } from '~~/server/utils/portal-auth';

export default defineEventHandler(async (event) => {
  const ctx = await requirePortalContext(event);
  const body = await readBody(event);

  const rating = Number(body?.rating);
  const quote = typeof body?.quote === 'string' ? body.quote.trim().slice(0, 2000) : '';
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw createError({ statusCode: 400, message: 'rating must be an integer 1–5' });
  }
  if (!quote) throw createError({ statusCode: 400, message: 'quote is required' });

  const isPublic = !!body?.isPublic;
  const directus = getServerDirectus();

  await directus.request(
    createItem('earnest_reviews', {
      user: ctx.userId,
      rating,
      quote,
      is_public: isPublic,
      display_name: typeof body?.displayName === 'string' ? body.displayName.slice(0, 120) : null,
      display_company: typeof body?.displayCompany === 'string' ? body.displayCompany.slice(0, 120) : null,
      source: 'client_portal',
      // Public reviews wait for moderation before they can surface anywhere;
      // private feedback is stored as-is for the Earnest team.
      status: isPublic ? 'pending' : 'published',
    } as any),
  );

  return { ok: true };
});
