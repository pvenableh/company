// server/api/ai/actions/[id]/undo.post.ts
/**
 * Reverse an already-executed `update_field` action (one-click undo).
 *
 * The forward executor captured the field's `previous` value, so undo just
 * writes it back — via `undoUpdateField` (server/utils/ai-action-executors.ts),
 * which re-checks the allow-list, org ownership, and that the field still holds
 * the value we set (aborts rather than clobber a later edit).
 *
 * Same admin-client + requireOrgMembership auth as approve/reject (client-side
 * ai_actions perms intentionally NOT relied upon). On success the row keeps
 * status:'executed' but its `result` is stamped `undone/undoneAt/undoneBy` so the
 * audit trail shows the reversal and the UI can disable a second undo.
 *
 * Only `update_field` is reversible today — other executed types 400.
 */
import { readItem } from '@directus/sdk';
import { requireOrgMembership } from '~~/server/utils/marketing-perms';
import { updateAiAction } from '~~/server/utils/ai-actions';
import { undoUpdateField } from '~~/server/utils/ai-action-executors';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

  const id = getRouterParam(event, 'id');
  if (!id) throw createError({ statusCode: 400, message: 'Action id is required' });

  const directus = getTypedDirectus();
  const action = await directus
    .request(readItem('ai_actions' as any, id, {
      fields: ['id', 'organization', 'action_type', 'status', 'result'],
    }))
    .catch(() => null) as any;
  if (!action) throw createError({ statusCode: 404, message: 'Action not found' });

  const organizationId = typeof action.organization === 'object'
    ? action.organization?.id
    : action.organization;
  if (!organizationId) throw createError({ statusCode: 400, message: 'Action has no organization' });

  await requireOrgMembership(event, String(organizationId));

  if (action.action_type !== 'update_field') {
    throw createError({ statusCode: 400, message: 'Only update_field actions can be undone' });
  }

  let revert: Record<string, any>;
  try {
    revert = await undoUpdateField(action, String(organizationId));
  } catch (err: any) {
    // A guard trip (already undone / changed since / cross-org) is a 400, not a 500.
    throw createError({ statusCode: 400, message: err?.message || 'Undo failed' });
  }

  const now = new Date().toISOString();
  await updateAiAction(id, {
    result: { ...(action.result || {}), undone: true, undoneAt: now, undoneBy: userId },
  });

  return { id, undone: true, revert, undone_at: now };
});
