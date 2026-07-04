// server/api/ai/director/sessions/[id]/qa.post.ts
/**
 * Persist a shared "Ask Earnest" exchange to a live session so every attendee
 * sees the same thread. The client calls the existing /api/ai/director/ask to
 * get the answer (authenticated, grounded), then posts BOTH turns here; the
 * two rows push to all attendees via realtime.
 *
 * Auth: session + membership of the session's org.
 * Body: { question: string, answer: string }
 */
import { requireOrgMembership } from '~~/server/utils/marketing-perms';
import { loadSession, postQaTurn, recordActivity } from '~~/server/utils/director-sessions';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  const actorName = [(session as any).user?.first_name, (session as any).user?.last_name].filter(Boolean).join(' ').trim() || null;
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

  const id = getRouterParam(event, 'id');
  if (!id) throw createError({ statusCode: 400, message: 'Session id is required' });

  const body = await readBody(event).catch(() => ({})) as { question?: string; answer?: string };
  const question = (body.question || '').toString().trim();
  const answer = (body.answer || '').toString().trim();
  if (!question) throw createError({ statusCode: 400, message: 'A question is required' });

  const sess = await loadSession(id);
  if (!sess) throw createError({ statusCode: 404, message: 'Session not found' });
  await requireOrgMembership(event, String(sess.organizationId));

  await postQaTurn(id, String(sess.organizationId), 'user', question, userId);
  if (answer) await postQaTurn(id, String(sess.organizationId), 'assistant', answer, null);
  await recordActivity(id, { type: 'qa', actorId: userId, actorName, label: question.slice(0, 60) });

  return { ok: true };
});
