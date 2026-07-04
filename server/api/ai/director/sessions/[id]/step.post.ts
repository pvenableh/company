// server/api/ai/director/sessions/[id]/step.post.ts
/**
 * Approve or skip a proposed step FROM WITHIN a live session. Wraps the shared
 * decideAiAction (so it can't drift from the solo approve/reject endpoints) and
 * then records the decision as session activity — bumping the session revision
 * so every attendee's deck re-syncs and shows who approved what, live.
 *
 * Propose-only is preserved: this is the same per-step human approval, just
 * attributed and broadcast to the whole table.
 *
 * Auth: session + membership of the session's org.
 * Body: { actionId: string, decision: 'approve' | 'reject' }
 */
import { requireOrgMembership } from '~~/server/utils/marketing-perms';
import { decideAiAction } from '~~/server/utils/ai-action-decide';
import { loadSession, recordActivity } from '~~/server/utils/director-sessions';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  const actorName = [(session as any).user?.first_name, (session as any).user?.last_name].filter(Boolean).join(' ').trim() || null;
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

  const id = getRouterParam(event, 'id');
  if (!id) throw createError({ statusCode: 400, message: 'Session id is required' });

  const body = await readBody(event).catch(() => ({})) as { actionId?: string; decision?: string };
  const actionId = (body.actionId || '').toString();
  const decision = body.decision === 'reject' ? 'reject' : 'approve';
  if (!actionId) throw createError({ statusCode: 400, message: 'actionId is required' });

  const sess = await loadSession(id);
  if (!sess) throw createError({ statusCode: 404, message: 'Session not found' });
  await requireOrgMembership(event, String(sess.organizationId));

  // View-only meetings: only the presenter (or host) may approve/skip.
  if (sess.viewOnly && String(sess.presenterId) !== String(userId) && String(sess.hostId) !== String(userId)) {
    throw createError({ statusCode: 403, message: 'This meeting is view-only — only the presenter can decide.' });
  }

  const result = await decideAiAction({
    id: actionId,
    decision,
    userId,
    verifyOrg: (orgId) => requireOrgMembership(event, orgId),
  });

  await recordActivity(id, {
    type: decision === 'reject' ? 'skip' : 'approve',
    actorId: userId,
    actorName,
    stepId: actionId,
    status: result.status,
  });

  return result;
});
