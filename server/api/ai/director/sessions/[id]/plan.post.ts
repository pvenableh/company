// server/api/ai/director/sessions/[id]/plan.post.ts
/**
 * Link a (freshly drafted or re-drafted) plan to a live session. When the host
 * drafts a plan in-room, the plan.post endpoint mints a planId; this attaches
 * it to the session and bumps the revision so every attendee re-fetches the new
 * steps and lands on the same briefing.
 *
 * Auth: session + membership of the session's org. Body: { planId, title? }
 */
import { requireOrgMembership } from '~~/server/utils/marketing-perms';
import { loadSession, setSessionPlan, recordActivity } from '~~/server/utils/director-sessions';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  const actorName = [(session as any).user?.first_name, (session as any).user?.last_name].filter(Boolean).join(' ').trim() || null;
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

  const id = getRouterParam(event, 'id');
  if (!id) throw createError({ statusCode: 400, message: 'Session id is required' });

  const body = await readBody(event).catch(() => ({})) as { planId?: string; title?: string };
  const planId = (body.planId || '').toString().trim();
  if (!planId) throw createError({ statusCode: 400, message: 'planId is required' });

  const sess = await loadSession(id);
  if (!sess) throw createError({ statusCode: 404, message: 'Session not found' });
  await requireOrgMembership(event, String(sess.organizationId));

  await setSessionPlan(id, planId, body.title?.toString().trim() || null);
  await recordActivity(id, { type: 'draft', actorId: userId, actorName, label: body.title || sess.subject || 'new plan' });

  return { ok: true };
});
