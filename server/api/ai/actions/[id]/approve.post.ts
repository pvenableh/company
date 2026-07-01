// server/api/ai/actions/[id]/approve.post.ts
/**
 * Approve a pending AI action and execute it.
 *
 * Flow:
 *  1. Load the ai_actions row (admin client) and verify the caller is an active
 *     member of its organization — same admin-client + requireOrgMembership
 *     pattern as server/api/ai/generate-documents.post.ts (client-side Directus
 *     perms on ai_actions are intentionally NOT relied upon).
 *  2. Reject anything not currently `pending` (idempotent-guard: prevents
 *     double-execution of an already-approved/executed row).
 *  3. Dispatch through the executor registry by action_type. A missing executor
 *     is a clear 400 — never a 500.
 *  4. On success → status:'executed' + result + approvedBy/approvedAt/executedAt.
 *     On executor failure → status:'failed' + error (and surface a 500).
 */
import { readItem } from '@directus/sdk';
import { requireOrgMembership } from '~~/server/utils/marketing-perms';
import { updateAiAction } from '~~/server/utils/ai-actions';
import { getExecutor } from '~~/server/utils/ai-action-executors';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

  const id = getRouterParam(event, 'id');
  if (!id) throw createError({ statusCode: 400, message: 'Action id is required' });

  const directus = getTypedDirectus();

  const action = await directus
    .request(readItem('ai_actions' as any, id, {
      fields: ['id', 'organization', 'action_type', 'status', 'title', 'payload', 'preview', 'entity_type', 'entity_id'],
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

  const executor = getExecutor(action.action_type);
  if (!executor) {
    throw createError({ statusCode: 400, message: `No executor registered for action type "${action.action_type}"` });
  }

  const now = new Date().toISOString();

  let result: Record<string, any>;
  try {
    result = await executor({ action, userId, organizationId: String(organizationId) });
  } catch (err: any) {
    const message = err?.message || 'Execution failed';
    await updateAiAction(id, {
      status: 'failed',
      error: message,
      approvedBy: userId,
      approvedAt: now,
    });
    throw createError({ statusCode: 500, message: `Action execution failed: ${message}` });
  }

  await updateAiAction(id, {
    status: 'executed',
    result,
    error: null,
    approvedBy: userId,
    approvedAt: now,
    executedAt: now,
  });

  return { id, status: 'executed', result, approved_at: now, executed_at: now };
});
