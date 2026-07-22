// server/api/ai/director/minutes/[id]/share.post.ts
/**
 * Share a decision record with teammates for review. Fans out a notification
 * (bell + push + email per prefs) linking straight to the read-only recap, and
 * flips the record's status to 'shared'. Only a member of the record's org may
 * share it. Mirrors the live-session invite fan-out (sessions/[id]/invite).
 *
 * Auth: session + membership of the record's org.
 * Body: { userIds: string[], note?: string }
 */
import { requireOrgMembership } from '~~/server/utils/marketing-perms';
import { loadMinutes, markMinutesShared } from '~~/server/utils/director-minutes';
import { emitNotification } from '~~/server/utils/notify-event';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  const actorName = [(session as any).user?.first_name, (session as any).user?.last_name].filter(Boolean).join(' ').trim() || 'A colleague';
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

  const id = getRouterParam(event, 'id');
  if (!id) throw createError({ statusCode: 400, message: 'Minutes id is required' });

  const body = (await readBody(event).catch(() => ({}))) as { userIds?: string[]; note?: string };
  const userIds = Array.from(new Set((body.userIds || []).map((u) => String(u)).filter(Boolean)))
    .filter((u) => u !== String(userId)); // don't notify yourself
  if (!userIds.length) throw createError({ statusCode: 400, message: 'No teammates to share with' });

  const minutes = await loadMinutes(id);
  if (!minutes) throw createError({ statusCode: 404, message: 'Decision record not found' });

  await requireOrgMembership(event, String(minutes.organizationId));

  const label = minutes.title || (minutes.subject ? minutes.subject : 'a working session');
  const note = (body.note || '').toString().trim();
  await emitNotification({
    category: 'meetings',
    type: 'director_minutes_share',
    collection: 'director_minutes',
    itemId: String(id),
    orgId: String(minutes.organizationId),
    actorId: String(userId),
    actorName,
    recipientIds: userIds,
    subject: `${actorName} shared meeting minutes for review`,
    message: note
      ? `${actorName} shared the Boardroom recap on ${label} for your review: “${note}”`
      : `${actorName} shared the Boardroom recap on ${label}. Review what was decided.`,
    link: `/boardroom/minutes/${id}`,
  }).catch(() => {});

  await markMinutesShared(id);

  return { ok: true, shared: userIds.length };
});
