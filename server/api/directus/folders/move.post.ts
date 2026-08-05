/**
 * Move a file or folder into a target folder (drag-and-drop). Files just get a
 * new `folder`; folders get a new `parent` — but only after verifying the target
 * isn't the folder itself or one of its own descendants (which would orphan a
 * cycle out of the tree). targetFolderId null = move to the org root.
 */
import { readFolders, updateFile, updateFolder } from '@directus/sdk';
import { requireOrgPermission } from '~~/server/utils/org-permissions';

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    organization?: string; kind?: 'file' | 'folder'; id?: string; targetFolderId?: string | null;
  }>(event);
  const { organization, kind, id } = body || {};
  const targetFolderId = body?.targetFolderId ?? null;

  if (!organization || !kind || !id) {
    throw createError({ statusCode: 400, message: 'organization, kind, and id are required' });
  }
  await requireOrgPermission(event, organization, 'dashboard', 'read');

  const directus = getServerDirectus();

  if (kind === 'file') {
    await directus.request(updateFile(id, { folder: targetFolderId } as any));
    return { ok: true };
  }

  // Folder move — reject no-op and cycle-creating targets.
  if (targetFolderId === id) {
    throw createError({ statusCode: 400, message: "A folder can't be moved into itself." });
  }
  if (targetFolderId) {
    // Walk the target's ancestry; if we hit `id`, target is a descendant.
    let cursor: string | null = targetFolderId;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor)) {
      if (cursor === id) {
        throw createError({ statusCode: 400, message: "A folder can't be moved into one of its own subfolders." });
      }
      seen.add(cursor);
      const rows = (await directus.request(
        readFolders({ filter: { id: { _eq: cursor } }, fields: ['parent'], limit: 1 }),
      )) as any[];
      cursor = rows?.[0]?.parent ?? null;
    }
  }

  await directus.request(updateFolder(id, { parent: targetFolderId } as any));
  return { ok: true };
});
