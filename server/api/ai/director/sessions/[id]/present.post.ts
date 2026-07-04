// server/api/ai/director/sessions/[id]/present.post.ts
/**
 * Drive the shared deck. Three things, any combination:
 *   - takePresenter: become the presenter (attendees following will track you)
 *   - slide: move the shared deck to this slide (only honoured for the presenter)
 *   - follow: toggle whether attendees follow the presenter at all
 *
 * Auth: session + membership of the session's org.
 * Body: { slide?: number, takePresenter?: boolean, follow?: boolean }
 */
import { requireOrgMembership } from '~~/server/utils/marketing-perms';
import { loadSession, setPresenter, setPresenterSlide, recordActivity } from '~~/server/utils/director-sessions';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  const actorName = [(session as any).user?.first_name, (session as any).user?.last_name].filter(Boolean).join(' ').trim() || null;
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

  const id = getRouterParam(event, 'id');
  if (!id) throw createError({ statusCode: 400, message: 'Session id is required' });

  const body = await readBody(event).catch(() => ({})) as { slide?: number; takePresenter?: boolean; follow?: boolean };

  const sess = await loadSession(id);
  if (!sess) throw createError({ statusCode: 404, message: 'Session not found' });
  await requireOrgMembership(event, String(sess.organizationId));

  let presenterId = sess.presenterId;

  if (body.takePresenter) {
    await setPresenter(id, userId, typeof body.follow === 'boolean' ? body.follow : undefined);
    presenterId = userId;
    await recordActivity(id, { type: 'present', actorId: userId, actorName, label: 'took the deck' });
  } else if (typeof body.follow === 'boolean') {
    await setPresenter(id, presenterId, body.follow);
  }

  if (typeof body.slide === 'number' && presenterId === userId) {
    await setPresenterSlide(id, body.slide);
  }

  return { ok: true, presenterId };
});
