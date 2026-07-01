// server/api/ai/actions/[id]/reject.post.ts
/**
 * Reject a pending AI action. Sets status:'rejected' + approvedBy/approvedAt.
 * Nothing is executed. Thin wrapper over the shared `decideAiAction` helper
 * (server/utils/ai-action-decide.ts) — same admin-client + requireOrgMembership
 * auth + pending-guard as the approve route (shared so they can't drift).
 */
import { requireOrgMembership } from '~~/server/utils/marketing-perms';
import { decideAiAction } from '~~/server/utils/ai-action-decide';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

  const id = getRouterParam(event, 'id');
  if (!id) throw createError({ statusCode: 400, message: 'Action id is required' });

  return decideAiAction({
    id,
    decision: 'reject',
    userId,
    verifyOrg: (orgId) => requireOrgMembership(event, orgId),
  });
});
