/**
 * Org file-storage usage — powers the Files meter and the billing display.
 * `?recompute=1` re-sums the org's folder tree (authoritative, self-heals the
 * cached counter after uploads/deletes); otherwise returns the fast cached value.
 * Any active member can read their org's usage (gated on `dashboard` read).
 */
import { requireOrgPermission } from '~~/server/utils/org-permissions';
import { getOrgStorage, recomputeOrgStorage } from '~~/server/utils/storage-enforcement';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  if (!id) throw createError({ statusCode: 400, message: 'org id required' });

  await requireOrgPermission(event, id, 'dashboard', 'read');

  if (String(getQuery(event).recompute || '') === '1') {
    await recomputeOrgStorage(id);
  }

  const s = await getOrgStorage(id);
  return {
    usedBytes: s.usedBytes,
    limitBytes: s.limitBytes,
    remainingBytes: s.remainingBytes,
    plan: s.plan,
  };
});
