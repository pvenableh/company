// server/api/ai/director/sessions/[id]/end.post.ts
/**
 * End a live session (status -> 'ended'). Only the host may end it. The saved
 * briefing + ai_actions remain as history; only the live table closes.
 *
 * Auth: session + membership of the session's org.
 */
import { requireOrgMembership } from '~~/server/utils/marketing-perms';
import { loadSession, endDirectorSession, recordActivity } from '~~/server/utils/director-sessions';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  const actorName = [(session as any).user?.first_name, (session as any).user?.last_name].filter(Boolean).join(' ').trim() || null;
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

  const id = getRouterParam(event, 'id');
  if (!id) throw createError({ statusCode: 400, message: 'Session id is required' });

  const sess = await loadSession(id);
  if (!sess) return { ok: true };
  await requireOrgMembership(event, String(sess.organizationId));

  if (sess.hostId && String(sess.hostId) !== String(userId)) {
    throw createError({ statusCode: 403, message: 'Only the host can end this meeting' });
  }

  await recordActivity(id, { type: 'end', actorId: userId, actorName });
  await endDirectorSession(id);
  return { ok: true };
});
