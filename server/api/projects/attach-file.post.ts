/**
 * Link an already-uploaded Directus file to a project (projects_files junction).
 *
 * The `projects_files` junction has no user-level create permission (per the
 * Directus 11 create-perm pattern — junction writes go through admin-token
 * server endpoints, not the user session). This endpoint verifies the caller
 * has `projects.update` access in the project's org, then creates the junction
 * row with the admin token.
 *
 * Body: { projectId: string, fileId: string }
 */
import { readItems, createItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const projectId = String(body?.projectId || '');
  const fileId = String(body?.fileId || '');
  if (!projectId || !fileId) {
    throw createError({ statusCode: 400, message: 'projectId and fileId are required' });
  }

  const directus = getTypedDirectus();

  // Resolve the project's org (admin read — membership is enforced next).
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

  // Gate: caller must be able to update projects in this org.
  await requireOrgPermission(event, String(project.organization), 'projects', 'update');

  const link = (await directus.request(
    createItem('projects_files', {
      projects_id: projectId,
      directus_files_id: fileId,
    }),
  )) as any;

  return { id: link?.id, projects_id: projectId, directus_files_id: fileId };
});
