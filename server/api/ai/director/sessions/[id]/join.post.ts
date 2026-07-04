// server/api/ai/director/sessions/[id]/join.post.ts
/**
 * Take a seat at a live session. Any active org member may join.
 * Flips an 'invited'/'left' participant row back to 'active' (or seats a new
 * one) and records a join activity so the table updates for everyone.
 */
import { requireOrgMembership } from '~~/server/utils/marketing-perms';
import { loadSession, upsertParticipant, recordActivity, loadParticipants, loadSessionSteps, loadQa } from '~~/server/utils/director-sessions';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  const userName = [(session as any).user?.first_name, (session as any).user?.last_name].filter(Boolean).join(' ').trim() || null;
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

  const id = getRouterParam(event, 'id');
  if (!id) throw createError({ statusCode: 400, message: 'Session id is required' });

  const sess = await loadSession(id);
  if (!sess) throw createError({ statusCode: 404, message: 'Session not found' });
  if (sess.status !== 'live') throw createError({ statusCode: 409, message: 'This meeting has ended' });

  await requireOrgMembership(event, String(sess.organizationId));

  await upsertParticipant({ sessionId: id, organizationId: String(sess.organizationId), userId, status: 'active' });
  await recordActivity(id, { type: 'join', actorId: userId, actorName: userName });

  const [participants, steps, qa] = await Promise.all([
    loadParticipants(id),
    loadSessionSteps(sess.planId, String(sess.organizationId)),
    loadQa(id),
  ]);
  return { session: sess, participants, steps, qa };
});
