// server/api/ai/actions/[id]/reject.post.ts
/**
 * Reject a pending AI action. Sets status:'rejected' + approvedBy/approvedAt.
 * Nothing is executed. Same admin-client + requireOrgMembership auth as the
 * approve route (client-side ai_actions perms intentionally NOT relied upon).
 */
import { readItem } from '@directus/sdk';
import { requireOrgMembership } from '~~/server/utils/marketing-perms';
import { updateAiAction } from '~~/server/utils/ai-actions';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

  const id = getRouterParam(event, 'id');
  if (!id) throw createError({ statusCode: 400, message: 'Action id is required' });

  const directus = getTypedDirectus();

  const action = await directus
    .request(readItem('ai_actions' as any, id, {
      fields: ['id', 'organization', 'status'],
    }))
    .catch(() => null) as any;
  if (!action) throw createError({ statusCode: 404, message: 'Action not found' });

  const organizationId = typeof action.organization === 'object'
    ? action.organization?.id
    : action.organization;
  if (!organizationId) throw createError({ statusCode: 400, message: 'Action has no organization' });

  await requireOrgMembership(event, String(organizationId));

  if (action.status !== 'pending') {
    throw createError({ statusCode: 409, message: `Action is already ${action.status}` });
  }

  const now = new Date().toISOString();
  await updateAiAction(id, {
    status: 'rejected',
    approvedBy: userId,
    approvedAt: now,
  });

  return { id, status: 'rejected', approved_at: now };
});
