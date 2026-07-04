// server/api/ai/actions/[id]/assignees.post.ts
/**
 * Set who a pending `create_tasks` action will assign to, BEFORE it's approved.
 *
 * The Director's Office lets you pick an assignee on an AI-proposed task slide.
 * Rather than pass an override through the approve path (which also runs in live
 * sessions), we patch the stored row's payload + preview here — so whichever
 * approve path runs (solo or the live session/step endpoint) executes the same
 * updated payload, and the outline/slides both show the new assignees.
 *
 * Auth: session + membership of the action's org. Only a still-`pending`
 * `create_tasks` row can be re-assigned.
 *
 * Body: { userIds: string[] }  // directus_users ids ([] clears the assignment)
 */
import { readItem, updateItem, readUsers } from '@directus/sdk';
import { requireOrgMembership } from '~~/server/utils/marketing-perms';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

  const id = getRouterParam(event, 'id');
  if (!id) throw createError({ statusCode: 400, message: 'Action id is required' });

  const body = (await readBody(event).catch(() => ({}))) as { userIds?: string[] };
  const userIds = Array.isArray(body.userIds) ? body.userIds.filter(Boolean).map(String) : [];

  const directus = getTypedDirectus();
  const action = (await directus.request(readItem('ai_actions' as any, id, {
    fields: ['id', 'organization', 'action_type', 'status', 'payload', 'preview'],
  })).catch(() => null)) as any;
  if (!action) throw createError({ statusCode: 404, message: 'Action not found' });

  const organizationId = typeof action.organization === 'object' ? action.organization?.id : action.organization;
  if (!organizationId) throw createError({ statusCode: 400, message: 'Action has no organization' });
  await requireOrgMembership(event, String(organizationId));

  if (action.status !== 'pending') throw createError({ statusCode: 409, message: `Action is already ${action.status}` });
  if (action.action_type !== 'create_tasks') {
    throw createError({ statusCode: 400, message: 'Only task actions can be re-assigned' });
  }

  const tasks = Array.isArray(action?.payload?.tasks) ? action.payload.tasks : [];
  if (!tasks.length) throw createError({ statusCode: 400, message: 'This action has no tasks to assign' });

  // Resolve display names for the preview chip (org-scoped so a stray id can't
  // leak another org's member name).
  let names: string[] = [];
  if (userIds.length) {
    const rows = (await directus.request(readUsers({
      filter: {
        _and: [
          { id: { _in: userIds } },
          { organizations: { organizations_id: { _eq: organizationId } } },
        ],
      } as any,
      fields: ['id', 'first_name', 'last_name', 'email'] as any,
      limit: -1,
    })).catch(() => [])) as any[];
    const byId = new Map(rows.map((r) => [String(r.id), r]));
    // Keep only ids that actually belong to the org.
    const valid = userIds.filter((uid) => byId.has(uid));
    names = valid.map((uid) => {
      const r = byId.get(uid);
      return `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.email || 'Teammate';
    });
    // Narrow the assignment to the validated ids.
    userIds.length = 0;
    userIds.push(...valid);
  }

  const payload = { ...action.payload, tasks: tasks.map((t: any) => ({ ...t, assigned_to: userIds })) };
  const preview = { ...(action.preview || {}), assignees: names };

  await directus.request(updateItem('ai_actions' as any, id, { payload, preview }));

  return { id, userIds, assignees: names };
});
