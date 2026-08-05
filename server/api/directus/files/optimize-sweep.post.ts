/**
 * Email-safe library optimize — ONE BATCH per call. Walks the org's optimizable
 * images (stable id-order pagination) and re-encodes each to email-safe JPEG/PNG
 * (never WebP — a bulk pass can't know which files land in an email, so it must
 * be safe), replacing in place and freeing the reclaimed bytes from the meter.
 *
 * Pagination is by `offset` on an id sort: replacing a file's binary keeps its
 * id (and sort position), so each file is visited exactly once per run without
 * needing a persisted "optimized" marker. The client calls this repeatedly with
 * the returned `nextOffset`, showing progress, until `done`.
 */
import { readFiles, readItem } from '@directus/sdk';
import { requireOrgPermission } from '~~/server/utils/org-permissions';
import { optimizeImageBuffer } from '~~/server/utils/image-optimize';
import { addOrgStorageUsage, getFolderSubtreeIds } from '~~/server/utils/storage-enforcement';

const OPTIMIZABLE_TYPES = ['image/jpeg', 'image/png', 'image/tiff', 'image/avif', 'image/webp'];

export default defineEventHandler(async (event) => {
  const body = await readBody<{ organization?: string; offset?: number; limit?: number }>(event);
  const organization = body?.organization;
  const offset = Math.max(0, Number(body?.offset) || 0);
  const limit = Math.min(Math.max(Number(body?.limit) || 5, 1), 10);
  if (!organization) throw createError({ statusCode: 400, message: 'organization is required' });
  await requireOrgPermission(event, organization, 'dashboard', 'read');

  const config = useRuntimeConfig();
  const url = config.directus?.url || config.public.directusUrl;
  const token = (config.directus as any)?.serverToken;
  const directus = getServerDirectus();

  const org = (await directus.request(readItem('organizations', organization, { fields: ['folder'] }))) as any;
  const rootFolder = org?.folder;
  if (!rootFolder) return { processed: 0, reclaimedBytes: 0, nextOffset: offset, done: true };

  const subtree = await getFolderSubtreeIds(rootFolder);

  const batch = (await directus.request(
    readFiles({
      filter: { _and: [{ folder: { _in: subtree } }, { type: { _in: OPTIMIZABLE_TYPES } }] },
      fields: ['id', 'type', 'filesize', 'filename_download'],
      sort: ['id'], // stable ordering so offset paginates every file exactly once
      limit,
      offset,
    }),
  )) as any[];

  let reclaimedBytes = 0;
  let processed = 0;

  for (const file of batch || []) {
    processed++;
    const before = Number(file.filesize) || 0;
    try {
      const assetRes = await fetch(`${url}/assets/${file.id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!assetRes.ok) continue;
      const original = Buffer.from(await assetRes.arrayBuffer());
      const result = await optimizeImageBuffer(original, file.type, file.filename_download || 'image'); // 'auto' = email-safe
      if (!result.optimized) continue;
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(result.bytes)], { type: result.type }), result.filename);
      const patch = await fetch(`${url}/files/${file.id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` }, body: form });
      if (patch.ok) reclaimedBytes += before - result.bytes.length;
    } catch (err) {
      console.error('[optimize-sweep] failed for', file.id, (err as Error).message);
    }
  }

  if (reclaimedBytes) await addOrgStorageUsage(organization, -reclaimedBytes);

  // A short batch means we've reached the end of the list.
  return { processed, reclaimedBytes, nextOffset: offset + processed, done: processed < limit };
});
