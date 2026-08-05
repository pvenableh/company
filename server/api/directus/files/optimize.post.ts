/**
 * Optimize a single existing file on demand. Fetches the current bytes, runs the
 * optimizer in the chosen format ('auto' = email-safe JPEG/PNG, or 'webp' =
 * smaller but not email-safe), and — only if it actually shrinks — replaces the
 * file's binary in place (same file id, so every /assets/<id> link, embed and
 * copied URL keeps working). The org storage counter is adjusted by the delta.
 */
import { readFiles } from '@directus/sdk';
import { requireOrgPermission } from '~~/server/utils/org-permissions';
import { isOptimizableImage, optimizeImageBuffer, type OptimizeFormat } from '~~/server/utils/image-optimize';
import { addOrgStorageUsage } from '~~/server/utils/storage-enforcement';

export default defineEventHandler(async (event) => {
  const body = await readBody<{ organization?: string; fileId?: string; format?: OptimizeFormat }>(event);
  const { organization, fileId } = body || {};
  const format: OptimizeFormat = body?.format === 'webp' ? 'webp' : 'auto';
  if (!organization || !fileId) {
    throw createError({ statusCode: 400, message: 'organization and fileId are required' });
  }
  await requireOrgPermission(event, organization, 'dashboard', 'read');

  const config = useRuntimeConfig();
  const url = config.directus?.url || config.public.directusUrl;
  const token = (config.directus as any)?.serverToken;
  const directus = getServerDirectus();

  // File metadata (current size + type + name).
  const rows = (await directus.request(
    readFiles({ filter: { id: { _eq: fileId } }, fields: ['id', 'type', 'filesize', 'filename_download'], limit: 1 }),
  )) as any[];
  const file = rows?.[0];
  if (!file) throw createError({ statusCode: 404, message: 'File not found' });
  if (!isOptimizableImage(file.type)) {
    throw createError({ statusCode: 400, message: 'This file type cannot be optimized.' });
  }

  const before = Number(file.filesize) || 0;

  // Pull the current bytes with the admin token.
  const assetRes = await fetch(`${url}/assets/${fileId}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!assetRes.ok) throw createError({ statusCode: 502, message: 'Could not read the file.' });
  const original = Buffer.from(await assetRes.arrayBuffer());

  const result = await optimizeImageBuffer(original, file.type, file.filename_download || 'image', { format });
  if (!result.optimized) {
    return { optimized: false, before, after: before, type: file.type };
  }

  // Replace the binary in place (PATCH /files/{id} with multipart).
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(result.bytes)], { type: result.type }), result.filename);
  const patchRes = await fetch(`${url}/files/${fileId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!patchRes.ok) {
    console.error('[files/optimize] replace failed:', patchRes.status, await patchRes.text());
    throw createError({ statusCode: 502, message: 'Could not save the optimized file.' });
  }

  const after = result.bytes.length;
  await addOrgStorageUsage(organization, after - before); // negative delta frees space

  return { optimized: true, before, after, type: result.type, format };
});
