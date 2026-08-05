/**
 * Update a pitch page's gating (staff, org-scoped). Supports:
 *   - status: 'published' | 'revoked' | 'draft'  (revoke kills the link)
 *   - expires_at: ISO string | null              (change/clear expiry)
 *   - password: string | null                    (set/clear/change; null clears)
 *
 * Verifies the pitch belongs to the caller's org before touching it. Gated
 * behind the `proposals` feature.
 */
import { readItem, updateItem } from '@directus/sdk';
import { requireOrgPermission } from '~~/server/utils/org-permissions';
import { hashPitchPassword } from '~~/server/utils/pitch-access';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  if (!id) throw createError({ statusCode: 400, message: 'id required' });

  const body = await readBody<{
    status?: string; expires_at?: string | null; password?: string | null;
  }>(event);

  const directus = getServerDirectus();
  const existing = (await directus.request(
    readItem('pitch_pages', id, { fields: ['id', 'organization'] }),
  )) as any;
  if (!existing) throw createError({ statusCode: 404, message: 'Pitch not found' });

  await requireOrgPermission(event, existing.organization, 'proposals', 'update');

  const patch: Record<string, any> = {};
  if (body.status && ['published', 'revoked', 'draft'].includes(body.status)) {
    patch.status = body.status;
  }
  if (body.expires_at !== undefined) {
    patch.expires_at = body.expires_at ? new Date(body.expires_at).toISOString() : null;
  }
  if (body.password !== undefined) {
    patch.password_hash = body.password ? hashPitchPassword(body.password) : null;
  }

  if (!Object.keys(patch).length) throw createError({ statusCode: 400, message: 'Nothing to update' });

  await directus.request(updateItem('pitch_pages', id, patch as any));
  return { ok: true };
});
