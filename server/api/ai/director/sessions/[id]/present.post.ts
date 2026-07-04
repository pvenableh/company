// server/api/ai/director/sessions/[id]/present.post.ts
/**
 * Drive the shared meeting screen + host settings. Any combination of:
 *   - takePresenter: become the presenter (attendees following track you)
 *   - subject / viewMode / slide: move the SHARED screen (only honoured for the
 *     presenter) so followers see exactly what's projected — same advisor, same
 *     view, same slide
 *   - follow: toggle whether attendees follow the presenter
 *   - viewOnly: (host only) lock participation — only the presenter can decide
 *
 * Auth: session + membership of the session's org.
 * Body: { subject?, viewMode?, slide?, takePresenter?, follow?, viewOnly? }
 */
import { requireOrgMembership } from '~~/server/utils/marketing-perms';
import { loadSession, setPresenter, setSharedView, setViewOnly, recordActivity } from '~~/server/utils/director-sessions';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  const actorName = [(session as any).user?.first_name, (session as any).user?.last_name].filter(Boolean).join(' ').trim() || null;
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

  const id = getRouterParam(event, 'id');
  if (!id) throw createError({ statusCode: 400, message: 'Session id is required' });

  const body = await readBody(event).catch(() => ({})) as {
    subject?: string | null; viewMode?: 'outline' | 'slides'; slide?: number;
    takePresenter?: boolean; follow?: boolean; viewOnly?: boolean;
  };

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

  // Only the presenter moves the shared screen.
  if (String(presenterId) === String(userId)) {
    const view: { subject?: string | null; viewMode?: 'outline' | 'slides'; slide?: number } = {};
    if (body.subject !== undefined) view.subject = body.subject;
    if (body.viewMode !== undefined) view.viewMode = body.viewMode;
    if (typeof body.slide === 'number') view.slide = body.slide;
    if (Object.keys(view).length) await setSharedView(id, view);
  }

  // view_only is a host-only control.
  if (typeof body.viewOnly === 'boolean') {
    if (sess.hostId && String(sess.hostId) !== String(userId)) {
      throw createError({ statusCode: 403, message: 'Only the host can lock participation' });
    }
    await setViewOnly(id, body.viewOnly);
    await recordActivity(id, { type: 'settings', actorId: userId, actorName, label: body.viewOnly ? 'view-only on' : 'view-only off' });
  }

  return { ok: true, presenterId };
});
