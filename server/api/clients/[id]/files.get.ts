/**
 * List files rolled up from ALL of a client's projects (read-only).
 *
 * There is no client-level file store (no `clients_files` junction). The
 * client's "Files & Docs" tab is a lens: it aggregates the `projects_files`
 * rows of every project belonging to the client, tagging each with the
 * project it lives on. Files are managed on their project — this endpoint is
 * read-only.
 *
 * Mirrors `server/api/projects/[id]/files.get.ts`: the junction has no
 * user-level read permission, so the read is proxied through the admin token
 * after verifying the caller has `projects.read` in the client's org.
 */
import { readItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const clientId = String(getRouterParam(event, 'id') || '');
  if (!clientId) {
    throw createError({ statusCode: 400, message: 'client id is required' });
  }

  const directus = getTypedDirectus();

  // Resolve the client's org (admin read — membership is enforced next).
  const clients = (await directus.request(
    readItems('clients', {
      filter: { id: { _eq: clientId } },
      fields: ['id', 'organization'],
      limit: 1,
    }),
  )) as any[];
  const client = clients?.[0];
  if (!client) {
    throw createError({ statusCode: 404, message: 'Client not found' });
  }

  await requireOrgPermission(event, String(client.organization), 'projects', 'read');

  // Every project belonging to this client.
  const projects = (await directus.request(
    readItems('projects', {
      filter: { client: { _eq: clientId } },
      fields: ['id'],
      limit: -1,
    }),
  )) as any[];
  const projectIds = projects.map((p) => p.id).filter(Boolean);
  if (!projectIds.length) return [];

  // All files attached to those projects, tagged with their project.
  const files = await directus.request(
    readItems('projects_files', {
      fields: [
        'id',
        'projects_id.id',
        'projects_id.title',
        'directus_files_id.id',
        'directus_files_id.title',
        'directus_files_id.filename_download',
        'directus_files_id.type',
        'directus_files_id.filesize',
        'directus_files_id.uploaded_on',
        'directus_files_id.tags',
        'directus_files_id.categories',
        'directus_files_id.description',
        'directus_files_id.folder.id',
        'directus_files_id.folder.name',
      ],
      filter: { projects_id: { _in: projectIds } },
      sort: ['-directus_files_id.uploaded_on'],
      limit: -1,
    }),
  );

  return files;
});
