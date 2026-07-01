// server/utils/ai-action-decide.ts
/**
 * Shared approve/reject logic for a single ai_actions row.
 *
 * The one-off endpoints (approve.post.ts / reject.post.ts) and the bulk endpoint
 * (bulk.post.ts) all funnel through here so the guard/dispatch/audit path can
 * never drift between them. It:
 *   1. Loads the row (admin client).
 *   2. Resolves + org-verifies the caller via the `verifyOrg` callback (kept as a
 *      callback so this util needn't import the request `event` — the endpoints
 *      pass `(orgId) => requireOrgMembership(event, orgId)`).
 *   3. Guards status==='pending' (a non-pending row is a 409 — no double-execute).
 *   4. approve → dispatch the registered executor (missing executor = 400, executor
 *      throw = row `failed` + 500); reject → status:'rejected'.
 *
 * FAILURES THROW `createError` (404 / 400 / 409 / 500) exactly as the single
 * endpoints did — the single endpoints let it propagate; the bulk endpoint wraps
 * each call and folds a thrown error into that row's per-item result so one bad id
 * never fails the batch.
 */
import { readItem } from '@directus/sdk';
import { updateAiAction } from '~~/server/utils/ai-actions';
import { getExecutor } from '~~/server/utils/ai-action-executors';

export interface DecideResult {
  id: string;
  status: 'executed' | 'rejected';
  result?: Record<string, any>;
  approved_at: string;
  executed_at?: string;
}

export async function decideAiAction(opts: {
  id: string;
  decision: 'approve' | 'reject';
  userId: string;
  /** Throws (403/404) if the caller may not act on `orgId`. Resolved value is
   *  ignored — requireOrgMembership returns membership info we don't need here. */
  verifyOrg: (orgId: string) => Promise<unknown>;
}): Promise<DecideResult> {
  const { id, decision, userId, verifyOrg } = opts;

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

  await verifyOrg(String(organizationId));

  if (action.status !== 'pending') {
    throw createError({ statusCode: 409, message: `Action is already ${action.status}` });
  }

  const now = new Date().toISOString();

  // ── Reject ──────────────────────────────────────────────────────────────────
  if (decision === 'reject') {
    await updateAiAction(id, { status: 'rejected', approvedBy: userId, approvedAt: now });
    return { id, status: 'rejected', approved_at: now };
  }

  // ── Approve → execute ─────────────────────────────────────────────────────────
  const executor = getExecutor(action.action_type);
  if (!executor) {
    throw createError({ statusCode: 400, message: `No executor registered for action type "${action.action_type}"` });
  }

  let result: Record<string, any>;
  try {
    result = await executor({ action, userId, organizationId: String(organizationId) });
  } catch (err: any) {
    const message = err?.message || 'Execution failed';
    await updateAiAction(id, { status: 'failed', error: message, approvedBy: userId, approvedAt: now });
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
}
