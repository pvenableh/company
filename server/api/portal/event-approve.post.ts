// server/api/portal/event-approve.post.ts
/**
 * POST /api/portal/event-approve
 *
 * Lets a client portal user approve a single project_event ("Approve" CTA
 * on the project detail slide-over). Verifies the event belongs to a
 * project owned by a client in the user's portal scope before flipping
 * `approval=Approved`.
 *
 * Body: { eventId: string }
 */

import { readItem, updateItem } from '@directus/sdk';
import { requirePortalContext } from '~~/server/utils/portal-auth';

export default defineEventHandler(async (event) => {
  const ctx = await requirePortalContext(event);
  const body = await readBody(event);
  const eventId = body?.eventId as string | undefined;

  if (!eventId) {
    throw createError({ statusCode: 400, message: 'eventId is required' });
  }

  const directus = getServerDirectus();

  const row = (await directus.request(
    readItem('project_events', eventId, {
      fields: ['id', 'project.id', 'project.organization', 'project.client'],
    }),
  )) as any;

  const projectOrg = typeof row?.project?.organization === 'object'
    ? row.project.organization?.id
    : row?.project?.organization;
  const projectClient = typeof row?.project?.client === 'object'
    ? row.project.client?.id
    : row?.project?.client;

  if (!projectOrg || projectOrg !== ctx.organizationId) {
    throw createError({ statusCode: 404, message: 'Event not found' });
  }
  if (!projectClient || !ctx.scopedClientIds.includes(projectClient)) {
    throw createError({ statusCode: 404, message: 'Event not found' });
  }

  const updated = await directus.request(
    updateItem('project_events', eventId, {
      approval: 'Approved',
      approved_by: ctx.userId,
      approved_at: new Date().toISOString(),
    }),
  );

  return updated;
});
