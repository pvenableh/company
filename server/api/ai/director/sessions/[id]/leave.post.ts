// server/api/ai/director/sessions/[id]/leave.post.ts
/**
 * Leave a live session (marks the participant 'left'). If the host leaves the
 * meeting keeps running for the remaining attendees — ending it is a separate,
 * explicit action (end.post.ts).
 */
import { requireOrgMembership } from '~~/server/utils/marketing-perms';
import { loadSession, setParticipantLeft, recordActivity } from '~~/server/utils/director-sessions';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  const userName = [(session as any).user?.first_name, (session as any).user?.last_name].filter(Boolean).join(' ').trim() || null;
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

  const id = getRouterParam(event, 'id');
  if (!id) throw createError({ statusCode: 400, message: 'Session id is required' });

  const sess = await loadSession(id);
  if (!sess) return { ok: true }; // already gone — nothing to leave
  await requireOrgMembership(event, String(sess.organizationId));

  await setParticipantLeft(id, userId);
  await recordActivity(id, { type: 'leave', actorId: userId, actorName: userName });
  return { ok: true };
});
