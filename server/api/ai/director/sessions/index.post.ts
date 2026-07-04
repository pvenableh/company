// server/api/ai/director/sessions/index.post.ts
/**
 * Convene a LIVE Director's Office meeting.
 *
 * Creates a `director_sessions` row (status 'live') and seats the caller as the
 * host, so other org members can be invited to the same table in realtime.
 * Propose-only philosophy is unchanged — steps still require per-step approval.
 *
 * Auth: session + org membership. Body:
 *   organizationId (required)
 *   scopeType? ('org'|'entity'), entityType?, entityId?, subject?, topic?
 *   planId?  — link to an already-drafted plan/briefing (optional)
 *   title?   — human label for the join list
 */
import { requireOrgMembership } from '~~/server/utils/marketing-perms';
import { createDirectorSession } from '~~/server/utils/director-sessions';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

  const body = await readBody(event).catch(() => ({})) as {
    organizationId?: string; scopeType?: string; entityType?: string; entityId?: string;
    subject?: string; topic?: string; planId?: string; title?: string;
  };
  const organizationId = (body.organizationId || '').toString();
  if (!organizationId) throw createError({ statusCode: 400, message: 'organizationId is required' });

  await requireOrgMembership(event, organizationId);

  const scopeType = body.scopeType === 'entity' ? 'entity' : 'org';
  const id = await createDirectorSession({
    organizationId,
    hostId: userId,
    title: body.title?.toString().trim() || null,
    scopeType,
    entityType: body.entityType?.toString().trim() || null,
    entityId: body.entityId?.toString().trim() || null,
    subject: body.subject?.toString().trim() || null,
    topic: body.topic?.toString().trim() || null,
    planId: body.planId?.toString().trim() || null,
  });

  if (id == null) {
    // Live layer not set up (collection missing) — signal graceful fallback.
    throw createError({ statusCode: 503, message: 'The live meeting layer is not available yet.' });
  }

  return { sessionId: id };
});
