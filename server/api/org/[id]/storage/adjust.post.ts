/**
 * Fast storage-counter adjustment (no full recompute). Used by the Files UI to
 * decrement the cached usage when a file is deleted — keeping the meter instant
 * instead of triggering the network-heavy recomputeOrgStorage on every delete.
 * Clamped to non-negative server-side; drift is corrected by the periodic
 * recompute (`?recompute=1` on the storage GET).
 */
import { requireOrgPermission } from '~~/server/utils/org-permissions';
import { addOrgStorageUsage, getOrgStorage } from '~~/server/utils/storage-enforcement';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  if (!id) throw createError({ statusCode: 400, message: 'org id required' });

  await requireOrgPermission(event, id, 'dashboard', 'read');

  const body = await readBody<{ deltaBytes?: number }>(event);
  const delta = Number(body?.deltaBytes);
  if (!Number.isFinite(delta) || delta === 0) {
    throw createError({ statusCode: 400, message: 'deltaBytes (non-zero number) required' });
  }

  await addOrgStorageUsage(id, delta);
  return await getOrgStorage(id);
});
