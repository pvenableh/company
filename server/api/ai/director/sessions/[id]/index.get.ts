// server/api/ai/director/sessions/[id]/index.get.ts
/**
 * Full state of one live session — the source of truth an attendee re-syncs to
 * on the `revision` clock: the session, everyone at the table, and the proposed
 * steps (read from admin-only ai_actions so they're consistent for everyone).
 *
 * Auth: session + membership of the session's org.
 */
import { requireOrgMembership } from '~~/server/utils/marketing-perms';
import { loadSession, loadParticipants, loadSessionSteps, loadQa } from '~~/server/utils/director-sessions';

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const id = getRouterParam(event, 'id');
  if (!id) throw createError({ statusCode: 400, message: 'Session id is required' });

  const sess = await loadSession(id);
  if (!sess) throw createError({ statusCode: 404, message: 'Session not found' });

  await requireOrgMembership(event, String(sess.organizationId));

  const [participants, steps, qa] = await Promise.all([
    loadParticipants(id),
    loadSessionSteps(sess.planId, String(sess.organizationId)),
    loadQa(id),
  ]);

  return { session: sess, participants, steps, qa };
});
