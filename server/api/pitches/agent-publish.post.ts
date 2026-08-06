/**
 * Agent pitch-publish — lets Claude Code / Earnest AI publish a pitch page into
 * Earnest WITHOUT a browser session, authenticated by a machine secret.
 *
 * Auth: `Authorization: Bearer <PITCH_AGENT_SECRET>`, timing-safe compared, fail
 * CLOSED if the secret is unset (mirrors server/api/notifications/trigger.post.ts).
 * The secret is global, so the caller names the target `organization` in the body;
 * keep the secret only in the agent's environment. The pitch is always published
 * as a DRAFT (a human reviews /p/<token> before sharing), and it's attributed to
 * the org's owner. Reuses the same publishPitch() pipeline as the UI paths.
 *
 * Body: { organization, html, title, client_name?, links?{lead,client,contact},
 *         password?, expires_at? }
 */
import { timingSafeEqual } from 'node:crypto';
import { readItems } from '@directus/sdk';
import { getServerDirectus } from '~~/server/utils/directus';
import { requireActiveOrg } from '~~/server/utils/org-permissions';
import { publishPitch } from '~~/server/utils/pitch-publish';

function secretsMatch(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

/** The org's active owner user id — publishPitch stamps it as user_created. */
async function resolveOwnerUserId(organization: string): Promise<string | null> {
  try {
    const rows = (await getServerDirectus().request(readItems('org_memberships' as any, {
      filter: { organization: { _eq: organization }, status: { _eq: 'active' }, role: { slug: { _eq: 'owner' } } },
      fields: ['user'], limit: 1,
    } as any))) as any[];
    const u = rows?.[0]?.user;
    return (typeof u === 'object' ? u?.id : u) || null;
  } catch { return null; }
}

export default defineEventHandler(async (event) => {
  const secret = (useRuntimeConfig() as any).pitchAgentSecret as string;
  const auth = getHeader(event, 'authorization') || '';
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!secret || !provided || !secretsMatch(provided, secret)) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const body = await readBody<{
    organization?: string; html?: string; title?: string; client_name?: string | null;
    links?: { lead?: number | null; client?: string | null; contact?: string | null };
    password?: string | null; expires_at?: string | null;
  }>(event);

  const organization = String(body?.organization || '');
  if (!organization) throw createError({ statusCode: 400, message: 'organization is required' });
  if (!body?.html || !body.html.trim()) throw createError({ statusCode: 400, message: 'html is required' });
  const title = String(body?.title || '').trim();
  if (!title) throw createError({ statusCode: 400, message: 'title is required' });

  await requireActiveOrg(organization); // 410 if archived

  const userId = await resolveOwnerUserId(organization);

  const result = await publishPitch({
    organization,
    userId: userId || '',
    title,
    html: body.html,
    links: body.links,
    client_name: body.client_name ?? null,
    password: body.password ?? null,
    expires_at: body.expires_at ?? null,
    publish: false, // always draft — human reviews before sharing
  });

  return { id: result.id, token: result.token, url: result.url, status: 'draft', fonts: result.fonts };
});
