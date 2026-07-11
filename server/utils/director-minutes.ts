// server/utils/director-minutes.ts
/**
 * Server-side helpers for `director_minutes` — the durable decision record of a
 * Director's Office meeting (see scripts/setup-director-minutes-collection.ts).
 *
 * One row snapshots a finished meeting: the scope, the briefing on screen, every
 * proposed step + how it was decided, the action items captured, the Q&A thread,
 * a rollup, and an AI summary. It powers the read-only recap page and the
 * share-for-review notification.
 *
 * All access is via the server (admin) client and wrapped — a missing collection
 * (setup script not yet run) must NEVER break the office, so writes return null
 * and reads return empty/null. The recap layer is simply inert until
 * scripts/setup-director-minutes-collection.ts is run.
 */

import { createItem, updateItem, readItem, readItems } from '@directus/sdk';

const MINUTES = 'director_minutes' as any;

export type MinutesStatus = 'recorded' | 'shared';

export interface MinutesStep {
  id: string;
  action_type: string;
  title: string;
  preview?: any;
  status: 'pending' | 'executing' | 'executed' | 'rejected' | 'failed';
}

export interface MinutesCaptured {
  type: 'task' | 'ticket';
  title: string;
  priority?: string;
  assignees?: string[];
}

export interface MinutesQaTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface MinutesStats {
  done: number;
  skipped: number;
  failed: number;
  open: number;
  total: number;
  captured: number;
}

export interface SaveMinutesParams {
  organizationId: string;
  authorId: string;
  sessionId?: string | number | null;
  title?: string | null;
  scopeType: 'org' | 'entity' | 'mine';
  entityType?: string | null;
  entityId?: string | null;
  subject?: string | null;
  topic?: string | null;
  planId?: string | null;
  summary?: string | null;
  intro?: string | null;
  points?: string[] | null;
  finance?: any | null;
  opportunity?: any | null;
  clientRating?: any | null;
  steps?: MinutesStep[] | null;
  captured?: MinutesCaptured[] | null;
  qa?: MinutesQaTurn[] | null;
  stats?: MinutesStats | null;
}

/** Persist a meeting's minutes. Returns the new row id, or null if the
 *  collection isn't set up yet (graceful degrade). */
export async function saveMinutes(params: SaveMinutesParams): Promise<string | number | null> {
  try {
    const directus = getTypedDirectus();
    const created = await directus.request(
      createItem(MINUTES, {
        organization: params.organizationId,
        author: params.authorId,
        session: params.sessionId ?? null,
        title: params.title ?? null,
        scope_type: params.scopeType,
        entity_type: params.entityType ?? null,
        entity_id: params.entityId ?? null,
        subject: params.subject ?? null,
        topic: params.topic ?? null,
        plan_id: params.planId ?? null,
        summary: params.summary ?? null,
        intro: params.intro ?? null,
        points: params.points ?? null,
        finance: params.finance ?? null,
        opportunity: params.opportunity ?? null,
        client_rating: params.clientRating ?? null,
        steps: params.steps ?? null,
        captured: params.captured ?? null,
        qa: params.qa ?? null,
        stats: params.stats ?? null,
        status: 'recorded',
      }),
    ) as any;
    return created?.id ?? null;
  } catch (err: any) {
    console.warn('[director-minutes] save failed (recap layer inert until collection is set up):', err?.message);
    return null;
  }
}

export async function markMinutesShared(minutesId: string | number): Promise<void> {
  try {
    const directus = getTypedDirectus();
    await directus.request(updateItem(MINUTES, minutesId, { status: 'shared' }));
  } catch (err: any) {
    console.warn('[director-minutes] markShared failed:', err?.message);
  }
}

export interface LoadedMinutes {
  id: string | number;
  organizationId: string | null;
  authorId: string | null;
  authorName: string | null;
  sessionId: string | number | null;
  title: string | null;
  scopeType: 'org' | 'entity' | 'mine';
  entityType: string | null;
  entityId: string | null;
  subject: string | null;
  topic: string | null;
  planId: string | null;
  summary: string | null;
  intro: string | null;
  points: string[] | null;
  finance: any | null;
  opportunity: any | null;
  clientRating: any | null;
  steps: MinutesStep[];
  captured: MinutesCaptured[];
  qa: MinutesQaTurn[];
  stats: MinutesStats | null;
  status: MinutesStatus;
  dateCreated: string | null;
}

const idOf = (v: any) => (v && typeof v === 'object' ? v.id : v) ?? null;
function userName(u: any): string | null {
  if (!u || typeof u !== 'object') return null;
  return [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || null;
}

function mapMinutes(r: any): LoadedMinutes {
  return {
    id: r.id,
    organizationId: idOf(r.organization),
    authorId: idOf(r.author),
    authorName: userName(r.author),
    sessionId: idOf(r.session),
    title: r.title ?? null,
    scopeType: (r.scope_type === 'entity' ? 'entity' : r.scope_type === 'mine' ? 'mine' : 'org') as 'org' | 'entity' | 'mine',
    entityType: r.entity_type ?? null,
    entityId: r.entity_id ?? null,
    subject: r.subject ?? null,
    topic: r.topic ?? null,
    planId: r.plan_id ?? null,
    summary: r.summary ?? null,
    intro: r.intro ?? null,
    points: Array.isArray(r.points) ? r.points : null,
    finance: r.finance ?? null,
    opportunity: r.opportunity ?? null,
    clientRating: r.client_rating ?? null,
    steps: Array.isArray(r.steps) ? r.steps : [],
    captured: Array.isArray(r.captured) ? r.captured : [],
    qa: Array.isArray(r.qa) ? r.qa : [],
    stats: r.stats ?? null,
    status: (r.status === 'shared' ? 'shared' : 'recorded') as MinutesStatus,
    dateCreated: r.date_created ?? null,
  };
}

const MINUTES_FIELDS = [
  'id', 'organization', 'author.id', 'author.first_name', 'author.last_name',
  'session', 'title', 'scope_type', 'entity_type', 'entity_id', 'subject', 'topic',
  'plan_id', 'summary', 'intro', 'points', 'finance', 'opportunity', 'client_rating',
  'steps', 'captured', 'qa', 'stats', 'status', 'date_created',
];

export async function loadMinutes(minutesId: string | number): Promise<LoadedMinutes | null> {
  try {
    const directus = getTypedDirectus();
    const row = await directus.request(readItem(MINUTES, minutesId, { fields: MINUTES_FIELDS })) as any;
    return row ? mapMinutes(row) : null;
  } catch (err: any) {
    return null;
  }
}

export interface MinutesListRow {
  id: string | number;
  title: string | null;
  scopeType: 'org' | 'entity' | 'mine';
  entityType: string | null;
  entityId: string | null;
  subject: string | null;
  topic: string | null;
  summary: string | null;
  authorName: string | null;
  status: MinutesStatus;
  stats: MinutesStats | null;
  dateCreated: string | null;
}

/** Recorded minutes for an org, newest first (the "decision records" list). */
export async function listMinutes(organizationId: string, limit = 40): Promise<MinutesListRow[]> {
  try {
    const directus = getTypedDirectus();
    const rows = await directus.request(readItems(MINUTES, {
      filter: { organization: { _eq: organizationId } } as any,
      fields: [
        'id', 'title', 'scope_type', 'entity_type', 'entity_id', 'subject', 'topic',
        'summary', 'status', 'stats', 'date_created',
        'author.first_name', 'author.last_name',
      ],
      sort: ['-date_created'],
      limit,
    })) as any[];
    return (rows || []).map((r) => ({
      id: r.id,
      title: r.title ?? null,
      scopeType: (r.scope_type === 'entity' ? 'entity' : r.scope_type === 'mine' ? 'mine' : 'org') as 'org' | 'entity' | 'mine',
      entityType: r.entity_type ?? null,
      entityId: r.entity_id ?? null,
      subject: r.subject ?? null,
      topic: r.topic ?? null,
      summary: r.summary ?? null,
      authorName: userName(r.author),
      status: (r.status === 'shared' ? 'shared' : 'recorded') as MinutesStatus,
      stats: r.stats ?? null,
      dateCreated: r.date_created ?? null,
    }));
  } catch (err: any) {
    return [];
  }
}
