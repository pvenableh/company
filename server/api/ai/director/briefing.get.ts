// server/api/ai/director/briefing.get.ts
/**
 * Load the latest SAVED Director's Office briefing for a section, if one exists.
 *
 * The office calls this before drafting: on a hit it restores Earnest's saved
 * thinking (rationale + metric snapshots + the plan_id whose steps live in
 * ai_actions) with ZERO token spend, instead of re-calling Claude. On a miss
 * (or when the collection isn't set up yet) it returns { found: false } and the
 * office falls back to POST /api/ai/director/plan.
 *
 * Auth: session + org membership; reads via the admin client (same pattern as
 * agenda.get.ts / actions.get.ts).
 *
 * Query:
 *   organizationId (required)
 *   subject?       — agenda subject key
 *   topic?         — free-text steer (part of the lookup key)
 *   entityType? + entityId?  — focused one-entity meeting
 */
import { requireOrgMembership } from '~~/server/utils/marketing-perms';
import { loadLatestDirectorBriefing, type DirectorBriefingScope } from '~~/server/utils/director-briefings';

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

  await requireOrgMembership(event, organizationId);

  const scope: DirectorBriefingScope = {
    scopeType: entityType && entityId ? 'entity' : 'org',
    entityType: entityType || null,
    entityId: entityId || null,
    subject: (query.subject || '').toString().trim() || null,
    topic: (query.topic || '').toString().trim() || null,
  };

  const briefing = await loadLatestDirectorBriefing(organizationId, scope);
  if (!briefing) return { found: false };

  return {
    found: true,
    planId: briefing.planId,
    intro: briefing.intro,
    finance: briefing.finance,
    opportunity: briefing.opportunity,
    clientRating: briefing.clientRating,
    stepCount: briefing.stepCount,
    savedAt: briefing.savedAt,
  };
});
