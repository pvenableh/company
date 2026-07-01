// server/api/ai/actions/[id]/approve.post.ts
/**
 * Approve a pending AI action and execute it.
 *
 * Thin wrapper over the shared `decideAiAction` helper (server/utils/ai-action-
 * decide.ts) so this endpoint and the bulk endpoint (bulk.post.ts) can't drift:
 *   1. Load the ai_actions row (admin client) and verify the caller is an active
 *      member of its organization (client-side Directus perms on ai_actions are
 *      intentionally NOT relied upon).
 *   2. Reject anything not currently `pending` (409 — no double-execution).
 *   3. Dispatch through the executor registry by action_type (missing executor →
 *      400; executor throw → row `failed` + 500).
 *   4. On success → status:'executed' + result + approvedBy/approvedAt/executedAt.
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
    decision: 'approve',
    userId,
    verifyOrg: (orgId) => requireOrgMembership(event, orgId),
  });
});
