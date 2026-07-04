// server/api/ai/director/sessions/[id]/invite.post.ts
/**
 * Invite org members (admins + members) to a live session's table. Seats each
 * as an 'invited' participant and fans out a notification (bell + push + email
 * per prefs) linking straight to the meeting. Only the host / an existing
 * active participant may invite.
 *
 * Auth: session + membership of the session's org.
 * Body: { userIds: string[] }
 */
import { requireOrgMembership } from '~~/server/utils/marketing-perms';
import { loadSession, inviteParticipants, recordActivity } from '~~/server/utils/director-sessions';
import { emitNotification } from '~~/server/utils/notify-event';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  const actorName = [(session as any).user?.first_name, (session as any).user?.last_name].filter(Boolean).join(' ').trim() || 'A colleague';
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

  const id = getRouterParam(event, 'id');
  if (!id) throw createError({ statusCode: 400, message: 'Session id is required' });

  const body = await readBody(event).catch(() => ({})) as { userIds?: string[] };
  const userIds = Array.from(new Set((body.userIds || []).map((u) => String(u)).filter(Boolean)))
    .filter((u) => u !== userId); // don't invite yourself
  if (!userIds.length) throw createError({ statusCode: 400, message: 'No users to invite' });

  const sess = await loadSession(id);
  if (!sess) throw createError({ statusCode: 404, message: 'Session not found' });
  if (sess.status !== 'live') throw createError({ statusCode: 409, message: 'This meeting has ended' });

  await requireOrgMembership(event, String(sess.organizationId));

  await inviteParticipants(id, String(sess.organizationId), userIds);
  await recordActivity(id, { type: 'invite', actorId: userId, actorName, label: `invited ${userIds.length}` });

  const label = sess.title || (sess.subject ? sess.subject : 'a working session');
  await emitNotification({
    category: 'meetings',
    type: 'director_session_invite',
    collection: 'director_sessions',
    itemId: String(id),
    orgId: String(sess.organizationId),
    actorId: userId,
    actorName,
    recipientIds: userIds,
    subject: `${actorName} invited you to the Director's Office`,
    message: `${actorName} is convening a live meeting on ${label}. Join the table to review and approve the plan together.`,
    link: `/director?session=${id}`,
  }).catch(() => {});

  return { ok: true, invited: userIds.length };
});
