// server/api/ai/director/capture.post.ts
/**
 * Capture an action item mid-meeting — create a task OR ticket right from the
 * Director's Office deck and assign it to teammates on the spot.
 *
 * Unlike the AI's proposed steps (which flow through the ai_actions approval
 * queue), this is a human directly minting a real item during the working
 * session, so it's created immediately. It mirrors the two proven patterns:
 *   - tasks: nested `assigned_to` m2m + org-verified links (createTasksExecutor).
 *   - tickets: create then insert tickets_directus_users junction rows
 *     + assignment notifications (Tickets/Create.vue).
 *
 * All writes use the admin server client; org membership is verified first, and
 * any project/client link is org-verified (dropped fail-soft on a mismatch).
 *
 * Body: {
 *   organizationId: string,
 *   type: 'task' | 'ticket',
 *   title: string,
 *   priority?: 'low' | 'medium' | 'high' | 'urgent',
 *   description?: string,
 *   assignTo?: string[],   // directus_users ids
 *   projectId?: string,
 *   clientId?: string,
 * }
 */
import { createItem, readItem } from '@directus/sdk';
import { requireOrgMembership } from '~~/server/utils/marketing-perms';
import { emitNotification } from '~~/server/utils/notify-event';

function resolveId(value: any): string | null {
  if (value == null) return null;
  if (typeof value === 'object') return value.id != null ? String(value.id) : null;
  return String(value);
}

async function loadOrgId(directus: any, collection: string, id: string, orgField: string): Promise<string | null> {
  try {
    const row = (await directus.request(readItem(collection, id, { fields: ['id', orgField] }))) as any;
    return row ? resolveId(row[orgField]) : null;
  } catch {
    return null;
  }
}

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });
  const actorName = [(session as any).user?.first_name, (session as any).user?.last_name]
    .filter(Boolean).join(' ').trim() || 'A teammate';

  const body = (await readBody(event).catch(() => ({}))) as Record<string, any>;
  const organizationId = (body.organizationId ?? '').toString();
  const type = body.type === 'ticket' ? 'ticket' : 'task';
  const title = (body.title ?? '').toString().trim();
  const description = body.description != null ? String(body.description) : null;
  const priority = ['low', 'medium', 'high', 'urgent'].includes(body.priority) ? body.priority : 'medium';
  const assignTo = Array.isArray(body.assignTo) ? body.assignTo.filter(Boolean).map(String) : [];

  if (!organizationId) throw createError({ statusCode: 400, message: 'organizationId is required' });
  if (!title) throw createError({ statusCode: 400, message: 'title is required' });

  await requireOrgMembership(event, organizationId);

  const directus = getServerDirectus();

  // Org-verify any project/client link (fail-soft — drop a cross-org link, keep going).
  let projectId: string | null = null;
  let clientId: string | null = null;
  if (body.projectId) {
    const orgId = await loadOrgId(directus, 'projects', String(body.projectId), 'organization');
    if (orgId === organizationId) projectId = String(body.projectId);
  }
  if (body.clientId) {
    const orgId = await loadOrgId(directus, 'clients', String(body.clientId), 'organization');
    if (orgId === organizationId) clientId = String(body.clientId);
  }

  let itemId: string;

  if (type === 'task') {
    const fields: Record<string, any> = {
      title,
      organization_id: organizationId,
      status: 'new',
      priority,
    };
    if (description) fields.description = description;
    if (projectId) fields.project_id = projectId;
    if (clientId) fields.client_id = clientId;
    if (assignTo.length) fields.assigned_to = assignTo.map((uid) => ({ directus_users_id: uid }));
    const row = (await directus.request(createItem('tasks' as any, fields, { fields: ['id'] as any }))) as any;
    itemId = String(row.id);
  } else {
    const fields: Record<string, any> = {
      title,
      organization: organizationId,
      status: 'Pending',
      priority,
    };
    if (description) fields.description = description;
    if (projectId) fields.project = projectId;
    if (clientId) fields.client = clientId;
    const row = (await directus.request(createItem('tickets' as any, fields, { fields: ['id'] as any }))) as any;
    itemId = String(row.id);
    // Ticket assignees ride a separate junction (mirrors Tickets/Create.vue).
    for (const uid of assignTo) {
      await directus.request(createItem('tickets_directus_users' as any, { tickets_id: itemId, directus_users_id: uid }))
        .catch((err: any) => console.error('[director/capture] ticket assignment failed for', uid, err));
    }
  }

  // Notify the assignees (never the person who created it).
  const recipients = assignTo.filter((id) => id !== String(userId));
  if (recipients.length) {
    const noun = type === 'ticket' ? 'ticket' : 'task';
    const link = type === 'ticket' ? `/tickets/${itemId}` : null;
    await emitNotification({
      category: type === 'ticket' ? 'tickets' : 'tasks',
      type: type === 'ticket' ? 'tickets' : 'tasks',
      collection: type === 'ticket' ? 'tickets' : 'tasks',
      itemId,
      orgId: organizationId,
      actorId: String(userId),
      actorName,
      recipientIds: recipients,
      subject: `You've been assigned a ${noun}`,
      message: `<strong>${actorName}</strong> assigned you a ${noun} in the Boardroom:<br><strong>${title}</strong>`,
      link,
    }).catch((err) => console.error('[director/capture] notify failed', err));
  }

  return { id: itemId, type, title, assignedCount: assignTo.length };
});
