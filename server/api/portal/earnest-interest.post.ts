// server/api/portal/earnest-interest.post.ts
/**
 * POST /api/portal/earnest-interest
 *
 * A portal user expresses interest in starting their own Earnest workspace, or
 * refers a colleague. Logged as an `upsell_events` row (the same willingness-to-
 * pay sink the rest of the app uses) so the Earnest team can follow up.
 *
 * Body: { kind: 'own_workspace' | 'referral', note?: string }
 */
import { createItem } from '@directus/sdk';
import { requirePortalContext } from '~~/server/utils/portal-auth';

const KINDS = new Set(['own_workspace', 'referral']);

export default defineEventHandler(async (event) => {
  const ctx = await requirePortalContext(event);
  const body = await readBody(event);

  const kind = String(body?.kind ?? 'own_workspace');
  if (!KINDS.has(kind)) throw createError({ statusCode: 400, message: 'Unknown kind' });
  const note = typeof body?.note === 'string' ? body.note.slice(0, 200) : null;

  const directus = getServerDirectus();
  await directus.request(
    createItem('upsell_events', {
      feature: `portal_${kind}`,
      user: ctx.userId,
      organization: ctx.organizationId,
      source: note ? `client_portal:${note}` : 'client_portal',
    } as any),
  );

  return { ok: true };
});
