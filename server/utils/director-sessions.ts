// server/utils/director-sessions.ts
/**
 * Server-side helpers for the LIVE, multiplayer Director's Office.
 *
 * A `director_sessions` row is one live meeting. Attendees live in
 * `director_participants`; the shared "Ask Earnest" thread lives in
 * `director_qa`. The proposed steps still live in `ai_actions`
 * (session_id == the session's plan_id) — this module reads them back so the
 * live-session state endpoint can hand every attendee the same step list.
 *
 * REALTIME MODEL: clients open a Directus realtime subscription (their own
 * token, org-scoped read perm) to get pushed create/update events on these
 * three collections. But `ai_actions` stays admin-only, so a step
 * approve/skip can't push directly. Instead `recordActivity()` bumps the
 * session's `revision` + writes `last_activity`; the session-row update event
 * tells every attendee to re-fetch the steps. `revision` is the sync clock.
 *
 * All access is via the server (admin) client and every call is wrapped —
 * a missing collection (setup script not yet run) must NEVER break the office,
 * so writes swallow errors and reads return empty. The whole live layer is
 * simply inert until scripts/setup-director-sessions-collection.ts is run.
 *
 * Backed by scripts/setup-director-sessions-collection.ts.
 */

import { createItem, updateItem, readItem, readItems } from '@directus/sdk';

const SESSIONS = 'director_sessions' as any;
const PARTICIPANTS = 'director_participants' as any;
const QA = 'director_qa' as any;

export type SessionStatus = 'live' | 'ended';
export type ParticipantRole = 'host' | 'member';
export type ParticipantStatus = 'invited' | 'active' | 'left';

export interface SessionActivity {
  actorId?: string | null;
  actorName?: string | null;
  type: string; // 'approve' | 'skip' | 'draft' | 'present' | 'join' | 'invite' | ...
  stepId?: string | null;
  status?: string | null;
  label?: string | null;
  at: string;
}

const USER_FIELDS = ['id', 'first_name', 'last_name', 'avatar'];

// ─── Create / lifecycle ───────────────────────────────────────────────────────

export interface CreateSessionParams {
  organizationId: string;
  hostId: string;
  title?: string | null;
  scopeType: 'org' | 'entity';
  entityType?: string | null;
  entityId?: string | null;
  subject?: string | null;
  topic?: string | null;
  planId?: string | null;
}

/** Convene a live session and seat the host. Returns the session id or null. */
export async function createDirectorSession(params: CreateSessionParams): Promise<string | number | null> {
  try {
    const directus = getTypedDirectus();
    const created = await directus.request(
      createItem(SESSIONS, {
        organization: params.organizationId,
        host: params.hostId,
        presenter: params.hostId,
        title: params.title ?? null,
        status: 'live',
        scope_type: params.scopeType,
        entity_type: params.entityType ?? null,
        entity_id: params.entityId ?? null,
        subject: params.subject ?? null,
        topic: params.topic ?? null,
        plan_id: params.planId ?? null,
        current_slide: 0,
        follow_presenter: true,
        revision: 0,
        last_activity: null,
      }),
    ) as any;
    const id = created?.id ?? null;
    if (id != null) {
      await upsertParticipant({
        sessionId: id, organizationId: params.organizationId,
        userId: params.hostId, role: 'host', status: 'active',
      });
    }
    return id;
  } catch (err: any) {
    console.warn('[director-sessions] create failed (live layer inert until collection is set up):', err?.message);
    return null;
  }
}

/** Attach a plan to a session after it's drafted (host draft happens in-session). */
export async function setSessionPlan(sessionId: string | number, planId: string, title?: string | null): Promise<void> {
  try {
    const directus = getTypedDirectus();
    await directus.request(updateItem(SESSIONS, sessionId, {
      plan_id: planId,
      ...(title ? { title } : {}),
      current_slide: 0,
    }));
  } catch (err: any) {
    console.warn('[director-sessions] setSessionPlan failed:', err?.message);
  }
}

export async function endDirectorSession(sessionId: string | number): Promise<void> {
  try {
    const directus = getTypedDirectus();
    await directus.request(updateItem(SESSIONS, sessionId, { status: 'ended' }));
  } catch (err: any) {
    console.warn('[director-sessions] end failed:', err?.message);
  }
}

// ─── Participants ─────────────────────────────────────────────────────────────

export interface UpsertParticipantParams {
  sessionId: string | number;
  organizationId: string;
  userId: string;
  role?: ParticipantRole;
  status?: ParticipantStatus;
}

/**
 * Add or update a participant. One row per (session, user): a re-join flips a
 * prior 'left'/'invited' row back to 'active' rather than stacking rows.
 */
export async function upsertParticipant(params: UpsertParticipantParams): Promise<void> {
  try {
    const directus = getTypedDirectus();
    const existing = await directus.request(readItems(PARTICIPANTS, {
      filter: { _and: [{ session: { _eq: params.sessionId } }, { user: { _eq: params.userId } }] } as any,
      fields: ['id', 'role', 'status'],
      limit: 1,
    })) as any[];
    const now = new Date().toISOString();
    if (existing?.[0]) {
      // Never demote a host back to member on re-join.
      const nextRole = existing[0].role === 'host' ? 'host' : (params.role ?? existing[0].role ?? 'member');
      await directus.request(updateItem(PARTICIPANTS, existing[0].id, {
        role: nextRole,
        status: params.status ?? 'active',
        last_seen: now,
      }));
    } else {
      await directus.request(createItem(PARTICIPANTS, {
        session: params.sessionId,
        organization: params.organizationId,
        user: params.userId,
        role: params.role ?? 'member',
        status: params.status ?? 'active',
        current_slide: 0,
        last_seen: now,
      }));
    }
  } catch (err: any) {
    console.warn('[director-sessions] upsertParticipant failed:', err?.message);
  }
}

/** Invite several users at once (status 'invited' — they haven't joined yet). */
export async function inviteParticipants(sessionId: string | number, organizationId: string, userIds: string[]): Promise<void> {
  for (const userId of userIds) {
    // Don't override someone already active/host.
    await upsertParticipant({ sessionId, organizationId, userId, role: 'member', status: 'invited' });
  }
}

export async function setParticipantLeft(sessionId: string | number, userId: string): Promise<void> {
  try {
    const directus = getTypedDirectus();
    const existing = await directus.request(readItems(PARTICIPANTS, {
      filter: { _and: [{ session: { _eq: sessionId } }, { user: { _eq: userId } }] } as any,
      fields: ['id'], limit: 1,
    })) as any[];
    if (existing?.[0]) {
      await directus.request(updateItem(PARTICIPANTS, existing[0].id, { status: 'left', last_seen: new Date().toISOString() }));
    }
  } catch (err: any) {
    console.warn('[director-sessions] setParticipantLeft failed:', err?.message);
  }
}

/** Presence heartbeat — bump last_seen + which slide this attendee is viewing. */
export async function touchParticipant(sessionId: string | number, userId: string, currentSlide?: number): Promise<void> {
  try {
    const directus = getTypedDirectus();
    const existing = await directus.request(readItems(PARTICIPANTS, {
      filter: { _and: [{ session: { _eq: sessionId } }, { user: { _eq: userId } }] } as any,
      fields: ['id'], limit: 1,
    })) as any[];
    if (existing?.[0]) {
      await directus.request(updateItem(PARTICIPANTS, existing[0].id, {
        status: 'active',
        last_seen: new Date().toISOString(),
        ...(typeof currentSlide === 'number' ? { current_slide: currentSlide } : {}),
      }));
    }
  } catch (err: any) {
    // Presence is best-effort; never log-spam.
  }
}

// ─── Presenter / shared slide ─────────────────────────────────────────────────

export async function setPresenterSlide(sessionId: string | number, slide: number): Promise<void> {
  try {
    const directus = getTypedDirectus();
    await directus.request(updateItem(SESSIONS, sessionId, { current_slide: Math.max(0, Math.floor(slide)) }));
  } catch (err: any) {
    console.warn('[director-sessions] setPresenterSlide failed:', err?.message);
  }
}

export async function setPresenter(sessionId: string | number, presenterId: string | null, followPresenter?: boolean): Promise<void> {
  try {
    const directus = getTypedDirectus();
    await directus.request(updateItem(SESSIONS, sessionId, {
      presenter: presenterId,
      ...(typeof followPresenter === 'boolean' ? { follow_presenter: followPresenter } : {}),
    }));
  } catch (err: any) {
    console.warn('[director-sessions] setPresenter failed:', err?.message);
  }
}

// ─── Shared Q&A ───────────────────────────────────────────────────────────────

export async function postQaTurn(
  sessionId: string | number,
  organizationId: string,
  role: 'user' | 'assistant',
  text: string,
  userId?: string | null,
): Promise<void> {
  try {
    const directus = getTypedDirectus();
    await directus.request(createItem(QA, {
      session: sessionId,
      organization: organizationId,
      user: userId ?? null,
      role,
      text,
    }));
  } catch (err: any) {
    console.warn('[director-sessions] postQaTurn failed:', err?.message);
  }
}

// ─── Activity / revision (the sync clock for step changes) ─────────────────────

/**
 * Bump the session revision and stamp the last activity. Every attendee is
 * subscribed to the session row, so this update pushes them to re-fetch the
 * steps (which live in admin-only ai_actions and can't push on their own).
 */
export async function recordActivity(sessionId: string | number, activity: Omit<SessionActivity, 'at'>): Promise<void> {
  try {
    const directus = getTypedDirectus();
    const row = await directus.request(readItem(SESSIONS, sessionId, { fields: ['revision'] })) as any;
    const next = (Number(row?.revision) || 0) + 1;
    await directus.request(updateItem(SESSIONS, sessionId, {
      revision: next,
      last_activity: { ...activity, at: new Date().toISOString() },
    }));
  } catch (err: any) {
    console.warn('[director-sessions] recordActivity failed:', err?.message);
  }
}

// ─── Reads ────────────────────────────────────────────────────────────────────

export interface LoadedParticipant {
  id: string | number;
  userId: string | null;
  name: string;
  avatar: string | null;
  role: ParticipantRole;
  status: ParticipantStatus;
  currentSlide: number;
  lastSeen: string | null;
}

function participantName(u: any): string {
  if (!u) return 'Someone';
  return [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || 'Someone';
}

export async function loadParticipants(sessionId: string | number): Promise<LoadedParticipant[]> {
  try {
    const directus = getTypedDirectus();
    const rows = await directus.request(readItems(PARTICIPANTS, {
      filter: { session: { _eq: sessionId } } as any,
      fields: ['id', 'role', 'status', 'current_slide', 'last_seen', ...USER_FIELDS.map((f) => `user.${f}`)],
      sort: ['date_created'],
      limit: 100,
    })) as any[];
    return (rows || []).map((r) => ({
      id: r.id,
      userId: r.user?.id ?? (typeof r.user === 'string' ? r.user : null),
      name: participantName(r.user),
      avatar: r.user?.avatar ?? null,
      role: (r.role === 'host' ? 'host' : 'member') as ParticipantRole,
      status: (r.status === 'left' ? 'left' : r.status === 'invited' ? 'invited' : 'active') as ParticipantStatus,
      currentSlide: Number(r.current_slide) || 0,
      lastSeen: r.last_seen ?? null,
    }));
  } catch (err: any) {
    return [];
  }
}

export interface LoadedSession {
  id: string | number;
  organizationId: string | null;
  hostId: string | null;
  presenterId: string | null;
  title: string | null;
  status: SessionStatus;
  scopeType: 'org' | 'entity';
  entityType: string | null;
  entityId: string | null;
  subject: string | null;
  topic: string | null;
  planId: string | null;
  currentSlide: number;
  followPresenter: boolean;
  revision: number;
  lastActivity: SessionActivity | null;
  dateCreated: string | null;
}

function mapSession(r: any): LoadedSession {
  const idOf = (v: any) => (v && typeof v === 'object' ? v.id : v) ?? null;
  return {
    id: r.id,
    organizationId: idOf(r.organization),
    hostId: idOf(r.host),
    presenterId: idOf(r.presenter),
    title: r.title ?? null,
    status: (r.status === 'ended' ? 'ended' : 'live') as SessionStatus,
    scopeType: (r.scope_type === 'entity' ? 'entity' : 'org') as 'org' | 'entity',
    entityType: r.entity_type ?? null,
    entityId: r.entity_id ?? null,
    subject: r.subject ?? null,
    topic: r.topic ?? null,
    planId: r.plan_id ?? null,
    currentSlide: Number(r.current_slide) || 0,
    followPresenter: r.follow_presenter !== false,
    revision: Number(r.revision) || 0,
    lastActivity: r.last_activity ?? null,
    dateCreated: r.date_created ?? null,
  };
}

const SESSION_FIELDS = [
  'id', 'organization', 'host', 'presenter', 'title', 'status', 'scope_type',
  'entity_type', 'entity_id', 'subject', 'topic', 'plan_id', 'current_slide',
  'follow_presenter', 'revision', 'last_activity', 'date_created',
];

export async function loadSession(sessionId: string | number): Promise<LoadedSession | null> {
  try {
    const directus = getTypedDirectus();
    const row = await directus.request(readItem(SESSIONS, sessionId, { fields: SESSION_FIELDS })) as any;
    return row ? mapSession(row) : null;
  } catch (err: any) {
    return null;
  }
}

export interface LoadedStep {
  id: string;
  action_type: string;
  title: string;
  preview: any;
  status: 'pending' | 'executing' | 'executed' | 'rejected' | 'failed';
  decidedByName?: string | null;
}

/** The proposed steps for a session's plan (ai_actions rows, admin-read). */
export async function loadSessionSteps(planId: string | null | undefined, organizationId: string): Promise<LoadedStep[]> {
  if (!planId) return [];
  try {
    const directus = getTypedDirectus();
    // Keep the select scalar-only: `approved_by` may be a plain uuid column (not
    // an m2o relation), and a nested select on it would 400. "Who decided" is
    // surfaced from the session's last_activity instead.
    const rows = await directus.request(readItems('ai_actions' as any, {
      filter: { _and: [{ organization: { _eq: organizationId } }, { session_id: { _eq: planId } }] } as any,
      fields: ['id', 'action_type', 'title', 'preview', 'status'],
      sort: ['date_created'],
      limit: 50,
    })) as any[];
    return (rows || []).map((a) => ({
      id: String(a.id),
      action_type: a.action_type,
      title: a.title || a.action_type,
      preview: a.preview || null,
      status: (a.status === 'executed' ? 'executed' : a.status === 'rejected' ? 'rejected' : a.status === 'failed' ? 'failed' : 'pending'),
    }));
  } catch (err: any) {
    return [];
  }
}

export interface LoadedQaTurn {
  id: string | number;
  role: 'user' | 'assistant';
  text: string;
  userId: string | null;
  name: string | null;
  at: string | null;
}

/** The shared Ask-Earnest thread for a session, oldest first. */
export async function loadQa(sessionId: string | number): Promise<LoadedQaTurn[]> {
  try {
    const directus = getTypedDirectus();
    const rows = await directus.request(readItems(QA, {
      filter: { session: { _eq: sessionId } } as any,
      fields: ['id', 'role', 'text', 'date_created', ...USER_FIELDS.map((f) => `user.${f}`)],
      sort: ['date_created'],
      limit: 100,
    })) as any[];
    return (rows || []).map((r) => ({
      id: r.id,
      role: (r.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
      text: r.text || '',
      userId: r.user?.id ?? (typeof r.user === 'string' ? r.user : null),
      name: r.user ? participantName(r.user) : null,
      at: r.date_created ?? null,
    }));
  } catch (err: any) {
    return [];
  }
}

/** Live sessions for an org (the "join the table" list). Newest first. */
export async function listLiveSessions(organizationId: string): Promise<Array<LoadedSession & { participantCount: number; hostName: string | null }>> {
  try {
    const directus = getTypedDirectus();
    const rows = await directus.request(readItems(SESSIONS, {
      filter: { _and: [{ organization: { _eq: organizationId } }, { status: { _eq: 'live' } }] } as any,
      fields: [...SESSION_FIELDS, 'host.first_name', 'host.last_name'],
      sort: ['-date_created'],
      limit: 20,
    })) as any[];
    const out: Array<LoadedSession & { participantCount: number; hostName: string | null }> = [];
    for (const r of rows || []) {
      const parts = await loadParticipants(r.id);
      out.push({
        ...mapSession(r),
        participantCount: parts.filter((p) => p.status !== 'left').length,
        hostName: r.host ? [r.host.first_name, r.host.last_name].filter(Boolean).join(' ').trim() || null : null,
      });
    }
    return out;
  } catch (err: any) {
    return [];
  }
}
