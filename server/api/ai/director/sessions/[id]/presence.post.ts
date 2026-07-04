// server/api/ai/director/sessions/[id]/presence.post.ts
/**
 * Presence heartbeat for a live session — bumps last_seen and records which
 * slide the attendee is viewing (drives the "who's looking at what" dots).
 * Called on a short interval while the office is open. Best-effort + cheap.
 *
 * Auth: session + membership of the session's org. Body: { currentSlide? }
 */
import { requireOrgMembership } from '~~/server/utils/marketing-perms';
import { loadSession, touchParticipant } from '~~/server/utils/director-sessions';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

  const id = getRouterParam(event, 'id');
  if (!id) throw createError({ statusCode: 400, message: 'Session id is required' });

  const body = await readBody(event).catch(() => ({})) as { currentSlide?: number };

  const sess = await loadSession(id);
  if (!sess) return { ok: false };
  await requireOrgMembership(event, String(sess.organizationId));

  await touchParticipant(id, userId, typeof body.currentSlide === 'number' ? body.currentSlide : undefined);
  return { ok: true };
});
