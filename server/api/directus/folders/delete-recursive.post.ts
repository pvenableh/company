/**
 * Delete a folder, in one of two user-authorized modes:
 *   - mode 'contents' (destructive): the folder, every descendant folder, and
 *     all files within them are deleted; the freed bytes come off the org meter.
 *   - mode 'keep' (safe): the folder's direct children (files + subfolders) are
 *     moved to the org's root folder, then the now-empty folder is removed.
 *     Nothing is deleted, so storage is unchanged.
 * Either way we avoid Directus's default deleteFolder(), which would orphan the
 * contained files (folder -> null) out of the org's tree and its storage meter.
 */
import { deleteFiles, deleteFolder, deleteFolders, readFiles, readFolders, readItem, updateFile, updateFolder } from '@directus/sdk';
import { requireOrgPermission } from '~~/server/utils/org-permissions';
import { addOrgStorageUsage } from '~~/server/utils/storage-enforcement';

export default defineEventHandler(async (event) => {
  const body = await readBody<{ organization?: string; folderId?: string; mode?: 'contents' | 'keep' }>(event);
  const organization = body?.organization;
  const folderId = body?.folderId;
  const mode = body?.mode === 'keep' ? 'keep' : 'contents';
  if (!organization || !folderId) {
    throw createError({ statusCode: 400, message: 'organization and folderId are required' });
  }

  await requireOrgPermission(event, organization, 'dashboard', 'read');

  const directus = getServerDirectus();

  // ── Mode 'keep': move direct children to the org root, then drop the folder ──
  if (mode === 'keep') {
    const org = (await directus.request(
      readItem('organizations', organization, { fields: ['folder'] }),
    )) as any;
    const rootFolder = org?.folder ?? null;

    const [childFolders, childFiles] = await Promise.all([
      directus.request(readFolders({ filter: { parent: { _eq: folderId } }, fields: ['id'], limit: -1 })) as Promise<any[]>,
      directus.request(readFiles({ filter: { folder: { _eq: folderId } }, fields: ['id'], limit: -1 })) as Promise<any[]>,
    ]);

    for (const f of childFolders || []) await directus.request(updateFolder(f.id, { parent: rootFolder } as any));
    for (const f of childFiles || []) await directus.request(updateFile(f.id, { folder: rootFolder } as any));
    await directus.request(deleteFolder(folderId));

    return {
      mode: 'keep',
      movedFolders: (childFolders || []).length,
      movedFiles: (childFiles || []).length,
    };
  }

  // ── Mode 'contents': recursive delete ───────────────────────────────────────
  // 1. Collect the folder + all descendants (level-order BFS).
  const folderIds: string[] = [folderId];
  let frontier: string[] = [folderId];
  while (frontier.length) {
    const children = (await directus.request(
      readFolders({ filter: { parent: { _in: frontier } }, fields: ['id'], limit: -1 }),
    )) as any[];
    const ids = (children || []).map((c) => c.id).filter(Boolean);
    if (!ids.length) break;
    folderIds.push(...ids);
    frontier = ids;
  }

  // 2. Gather every file in those folders (ids + sizes for the storage delta).
  const fileIds: string[] = [];
  let freedBytes = 0;
  for (let i = 0; i < folderIds.length; i += 50) {
    const chunk = folderIds.slice(i, i + 50);
    const files = (await directus.request(
      readFiles({ filter: { folder: { _in: chunk } }, fields: ['id', 'filesize'], limit: -1 }),
    )) as any[];
    for (const f of files || []) {
      fileIds.push(f.id);
      freedBytes += Number(f.filesize) || 0;
    }
  }

  // 3. Delete files first, then folders deepest-first (reverse of BFS order).
  for (let i = 0; i < fileIds.length; i += 100) {
    await directus.request(deleteFiles(fileIds.slice(i, i + 100)));
  }
  const deepestFirst = [...folderIds].reverse();
  for (let i = 0; i < deepestFirst.length; i += 100) {
    await directus.request(deleteFolders(deepestFirst.slice(i, i + 100)));
  }

  // 4. Free the bytes from the org's storage meter.
  if (freedBytes) await addOrgStorageUsage(organization, -freedBytes);

  return {
    deletedFolders: folderIds.length,
    deletedFiles: fileIds.length,
    freedBytes,
  };
});
