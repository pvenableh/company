/**
 * List the files linked to a project (projects_files junction).
 *
 * The `projects_files` junction has no user-level read permission (per the
 * Directus 11 create-perm pattern — see attach-file.post.ts). Reads are
 * proxied through this admin-token endpoint after verifying the caller has
 * `projects.read` access in the project's org.
 */
import { readItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const projectId = String(getRouterParam(event, 'id') || '');
  if (!projectId) {
    throw createError({ statusCode: 400, message: 'project id is required' });
  }

  const directus = getTypedDirectus();

  const projects = (await directus.request(
    readItems('projects', {
      filter: { id: { _eq: projectId } },
      fields: ['id', 'organization'],
      limit: 1,
    }),
  )) as any[];
  const project = projects?.[0];
  if (!project) {
    throw createError({ statusCode: 404, message: 'Project not found' });
  }

  await requireOrgPermission(event, String(project.organization), 'projects', 'read');

  const files = await directus.request(
    readItems('projects_files', {
      fields: [
        'id',
        'directus_files_id.id',
        'directus_files_id.title',
        'directus_files_id.filename_download',
        'directus_files_id.type',
        'directus_files_id.filesize',
        'directus_files_id.uploaded_on',
        // Classification + organization (surfaced by the merged Files & Docs
        // tab): native file tags/categories, description, and folder.
        'directus_files_id.tags',
        'directus_files_id.categories',
        'directus_files_id.description',
        'directus_files_id.folder.id',
        'directus_files_id.folder.name',
      ],
      filter: { projects_id: { _eq: projectId } },
      sort: ['-directus_files_id.uploaded_on'],
      limit: -1,
    }),
  );

  return files;
});
