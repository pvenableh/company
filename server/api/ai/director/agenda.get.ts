// server/api/ai/director/agenda.get.ts
/**
 * The Director's Office "board packet" — a prioritized, subject-grouped agenda
 * of what needs attention across the org (or a single entity).
 *
 * Reuses the ai-notices generators via `collectDirectorAgenda`; each notice may
 * carry a pre-validated `proposedAction` the office surfaces as a one-click step.
 * Read-only — proposing/executing happens through /api/ai/director/plan and the
 * ai_actions approve endpoints.
 *
 * Auth: session + org membership, then reads via the admin client (same pattern
 * as actions.get.ts / notices/check.ts — no client-side Directus perms needed).
 *
 * Query:
 *   organizationId (required)
 *   entityType?    — plural collection ('projects'|'clients'|'leads'|'proposals'|
 *                    'invoices'|'tickets'); paired with entityId for a focused meeting
 *   entityId?      — record id (paired with entityType)
 */
import { requireOrgMembership } from '~~/server/utils/marketing-perms';
import { collectDirectorAgenda } from '~~/server/utils/ai-notices';

const FOCUSABLE = new Set(['projects', 'clients', 'leads', 'proposals', 'invoices', 'tickets']);

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

  const query = getQuery(event);
  const organizationId = (query.organizationId || '').toString();
  if (!organizationId) throw createError({ statusCode: 400, message: 'organizationId is required' });

  const entityType = (query.entityType || '').toString().trim();
  const entityId = (query.entityId || '').toString().trim();
  if ((entityType && !entityId) || (entityId && !entityType)) {
    throw createError({ statusCode: 400, message: 'entityType and entityId must be provided together' });
  }
  if (entityType && !FOCUSABLE.has(entityType)) {
    throw createError({ statusCode: 400, message: `Cannot convene a focused meeting on "${entityType}"` });
  }

  await requireOrgMembership(event, organizationId);

  const directus = getServerDirectus();
  try {
    const agenda = await collectDirectorAgenda(
      directus,
      organizationId,
      new Date(),
      entityType && entityId ? { entityType, entityId } : undefined,
    );
    return agenda;
  } catch (error: any) {
    console.error('[ai/director/agenda] Error:', error?.message);
    throw createError({ statusCode: 500, message: 'Failed to build the Director agenda' });
  }
});
