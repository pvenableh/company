// server/utils/director-briefings.ts
/**
 * Persistence for the Director's Office "thinking".
 *
 * A briefing is one saved plan for a subject/scope: the narrative rationale,
 * the metric snapshots (finance / opportunity / client rating), and a `plan_id`
 * that links to the proposed steps (rows in `ai_actions` where
 * `session_id === plan_id`). The office loads the latest briefing for a section
 * instead of re-calling Claude; a Refresh/Re-draft writes a new row.
 *
 * Backed by the `director_briefings` collection
 * (scripts/setup-director-briefings-collection.ts). All access is via the
 * server (admin) client — no row-level perms (same pattern as
 * marketing_campaigns). Fire-and-forget: a missing collection must NEVER break
 * the office, so save swallows errors and load returns null. Until the
 * collection is set up, the office simply falls back to drafting fresh.
 */

import { createItem, readItems } from '@directus/sdk';

export interface DirectorBriefingScope {
  scopeType: 'org' | 'entity';
  entityType?: string | null;
  entityId?: string | null;
  subject?: string | null;
  topic?: string | null;
}

/**
 * Deterministic lookup key for "the latest briefing for this section". Both the
 * writer (plan.post) and the reader (briefing.get) derive it the same way so a
 * saved briefing is found again on reopen. Topic is normalised (trimmed, cased)
 * so trivial differences don't fragment the cache.
 */
export function directorBriefingCacheKey(scope: DirectorBriefingScope): string {
  const subject = (scope.subject || '').trim().toLowerCase();
  const topic = (scope.topic || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const base = scope.scopeType === 'entity' && scope.entityType && scope.entityId
    ? `entity:${scope.entityType}:${scope.entityId}`
    : 'org';
  return `${base}::${subject}::${topic}`;
}

export interface SaveDirectorBriefingParams extends DirectorBriefingScope {
  organizationId: string;
  userId?: string | null;
  planId: string;
  intro?: string | null;
  finance?: any;
  opportunity?: any;
  clientRating?: any;
  agenda?: any;
  stepCount?: number;
}

/**
 * Persist a freshly drafted briefing. Returns the row id, or null if saving
 * failed (never propagates — the plan the user is looking at must not depend on
 * it succeeding).
 */
export async function saveDirectorBriefing(params: SaveDirectorBriefingParams): Promise<string | number | null> {
  try {
    const directus = getTypedDirectus();
    const created = await directus.request(
      createItem('director_briefings' as any, {
        organization: params.organizationId,
        user: params.userId || null,
        scope_type: params.scopeType,
        entity_type: params.entityType ?? null,
        entity_id: params.entityId ?? null,
        subject: params.subject ?? null,
        topic: params.topic ?? null,
        cache_key: directorBriefingCacheKey(params),
        plan_id: params.planId,
        intro: params.intro ?? null,
        finance: params.finance ?? null,
        opportunity: params.opportunity ?? null,
        client_rating: params.clientRating ?? null,
        agenda: params.agenda ?? null,
        step_count: params.stepCount ?? 0,
      }),
    ) as any;
    return created?.id ?? null;
  } catch (err: any) {
    console.warn('[director-briefings] save failed (store inert until collection is set up):', err?.message);
    return null;
  }
}

export interface LoadedDirectorBriefing {
  id: string | number;
  planId: string | null;
  intro: string;
  finance: any;
  opportunity: any;
  clientRating: any;
  agenda: any;
  stepCount: number;
  savedAt: string | null;
}

/**
 * Fetch the most recently saved briefing for a section, or null if none exists
 * (or the collection isn't set up yet).
 */
export async function loadLatestDirectorBriefing(
  organizationId: string,
  scope: DirectorBriefingScope,
): Promise<LoadedDirectorBriefing | null> {
  try {
    const directus = getTypedDirectus();
    const rows = await directus.request(
      readItems('director_briefings' as any, {
        filter: {
          _and: [
            { organization: { _eq: organizationId } },
            { cache_key: { _eq: directorBriefingCacheKey(scope) } },
          ],
        } as any,
        fields: ['id', 'plan_id', 'intro', 'finance', 'opportunity', 'client_rating', 'agenda', 'step_count', 'date_created'],
        sort: ['-date_created'],
        limit: 1,
      }),
    ) as any[];
    const row = rows?.[0];
    if (!row) return null;
    return {
      id: row.id,
      planId: row.plan_id ?? null,
      intro: row.intro || '',
      finance: row.finance ?? null,
      opportunity: row.opportunity ?? null,
      clientRating: row.client_rating ?? null,
      agenda: row.agenda ?? null,
      stepCount: Number(row.step_count) || 0,
      savedAt: row.date_created ?? null,
    };
  } catch (err: any) {
    console.warn('[director-briefings] load failed (store inert until collection is set up):', err?.message);
    return null;
  }
}
