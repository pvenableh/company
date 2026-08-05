/**
 * On-demand total size of a folder (its whole subtree). Network-heavy against
 * the remote Directus, so the UI only calls this when a folder is expanded /
 * explicitly asked — never eagerly for a whole listing.
 */
import { requireOrgPermission } from '~~/server/utils/org-permissions';
import { sumFolderSubtree } from '~~/server/utils/storage-enforcement';

export default defineEventHandler(async (event) => {
  const body = await readBody<{ organization?: string; folderId?: string }>(event);
  if (!body?.organization || !body?.folderId) {
    throw createError({ statusCode: 400, message: 'organization and folderId are required' });
  }
  await requireOrgPermission(event, body.organization, 'dashboard', 'read');
  const bytes = await sumFolderSubtree(body.folderId);
  return { bytes };
});
