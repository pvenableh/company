// composables/useDirectorSession.ts
/**
 * Client state + actions for the LIVE, multiplayer Director's Office.
 *
 * Wraps the /api/ai/director/sessions/* endpoints and keeps every attendee in
 * sync. Two sync channels, belt-and-braces:
 *   1. Realtime (primary) — a Directus WebSocket subscription (the user's own
 *      token, org-scoped read perm) on director_sessions / _participants / _qa.
 *      Any pushed event just means "something changed" → we re-fetch the
 *      authoritative state. The session's `revision` is the logical clock.
 *   2. Poll (backstop) — a light interval refresh while live, so the room still
 *      works if the realtime read perms/collection aren't in place yet (the
 *      whole live layer degrades gracefully to polling, then to single-user).
 *
 * Presence: a heartbeat posts the current user's viewed slide so the table can
 * show who's looking at what. All WRITES go through the server (admin) — clients
 * never write these collections directly.
 *
 * Module-level singleton (like usePresence) so the state survives the office
 * overlay toggling open/closed.
 */

export interface LiveParticipant {
  id: string | number;
  userId: string | null;
  name: string;
  avatar: string | null;
  role: 'host' | 'member';
  status: 'invited' | 'active' | 'left';
  currentSlide: number;
  lastSeen: string | null;
}

export interface LiveStep {
  id: string;
  action_type: string;
  title: string;
  preview: any;
  status: 'pending' | 'executing' | 'executed' | 'rejected' | 'failed';
  decidedByName?: string | null;
}

export interface LiveQaTurn {
  id: string | number;
  role: 'user' | 'assistant';
  text: string;
  userId: string | null;
  name: string | null;
  at: string | null;
}

export interface LiveSession {
  id: string | number;
  organizationId: string | null;
  hostId: string | null;
  presenterId: string | null;
  title: string | null;
  status: 'live' | 'ended';
  scopeType: 'org' | 'entity' | 'mine';
  entityType: string | null;
  entityId: string | null;
  subject: string | null;
  topic: string | null;
  planId: string | null;
  currentSlide: number;
  followPresenter: boolean;
  revision: number;
  lastActivity: any;
  includedSubjects: string[] | null;
  viewOnly: boolean;
  sharedSubject: string | null;
  sharedViewMode: 'outline' | 'slides';
}

interface StatePayload {
  session: LiveSession | null;
  participants: LiveParticipant[];
  steps: LiveStep[];
  qa: LiveQaTurn[];
}

// ─── Module-level singleton state ─────────────────────────────────────────────
const _session = ref<LiveSession | null>(null);
const _participants = ref<LiveParticipant[]>([]);
const _steps = ref<LiveStep[]>([]);
const _qa = ref<LiveQaTurn[]>([]);
const _connecting = ref(false);
const _lastRevision = ref(-1);

let _sessionId: string | null = null;
let _unsub: (() => void) | null = null;
let _pollTimer: ReturnType<typeof setInterval> | null = null;
let _heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let _refreshQueued = false;
let _myViewedSlide = 0;

const POLL_MS = 7000;
const HEARTBEAT_MS = 20000;
const PRESENCE_TTL = 60000; // treat a participant as "here now" if seen within 60s

export function useDirectorSession() {
  const { selectedOrg } = useOrganization();
  const { user } = useUserSession();
  const toast = useToast();

  const myUserId = computed(() => (user.value as any)?.id ?? null);
  const isLive = computed(() => !!_session.value && _session.value.status === 'live');
  const isHost = computed(() => !!_session.value && String(_session.value.hostId) === String(myUserId.value));
  const isPresenter = computed(() => !!_session.value && String(_session.value.presenterId) === String(myUserId.value));
  // Who may approve/skip: everyone, unless the meeting is view-only (then only
  // the presenter or host). Solo (not live) always true.
  const canDecide = computed(() => {
    if (!isLive.value) return true;
    if (!_session.value?.viewOnly) return true;
    return isPresenter.value || isHost.value;
  });
  // A follower mirrors the presenter's screen while follow is on and they aren't
  // the presenter. In view-only meetings follow is forced for non-presenters.
  const isFollowing = computed(() => {
    if (!isLive.value || isPresenter.value) return false;
    return !!_session.value?.followPresenter || !!_session.value?.viewOnly;
  });

  // Everyone still at the table (host first, then join order).
  const attendees = computed(() => _participants.value.filter((p) => p.status !== 'left'));
  // "Here right now" — active + a fresh heartbeat.
  const presentNow = computed(() => {
    const now = Date.now();
    return attendees.value.filter((p) =>
      p.status === 'active' && p.lastSeen && now - new Date(p.lastSeen).getTime() < PRESENCE_TTL,
    );
  });

  function _applyState(payload: StatePayload) {
    if (!payload?.session) return;
    _session.value = payload.session;
    _participants.value = payload.participants || [];
    _steps.value = payload.steps || [];
    _qa.value = payload.qa || [];
    _lastRevision.value = payload.session.revision;
  }

  async function refresh() {
    if (!_sessionId) return;
    try {
      const res = await $fetch<StatePayload>(`/api/ai/director/sessions/${_sessionId}`);
      _applyState(res);
    } catch (err: any) {
      // 404 → the session was ended/removed. Detach quietly.
      if (err?.statusCode === 404) detach();
    }
  }

  // Coalesce bursty realtime events into one refresh on the next tick.
  function _scheduleRefresh() {
    if (_refreshQueued) return;
    _refreshQueued = true;
    setTimeout(() => { _refreshQueued = false; refresh(); }, 250);
  }

  function _startTimers() {
    if (!_pollTimer) _pollTimer = setInterval(() => { if (!document.hidden) refresh(); }, POLL_MS);
    if (!_heartbeatTimer) _heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_MS);
  }
  function _stopTimers() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
    if (_heartbeatTimer) { clearInterval(_heartbeatTimer); _heartbeatTimer = null; }
  }

  function _subscribeRealtime(id: string) {
    if (import.meta.server) return;
    if (_unsub) { _unsub(); _unsub = null; }
    try {
      const { subscribe } = useWebSocketManager();
      const unsubs: Array<() => void> = [];
      // A pushed event on any of the three collections just means "re-sync".
      const onEvent = () => _scheduleRefresh();
      unsubs.push(subscribe('director_sessions', { fields: ['id', 'revision', 'status'], filter: { id: { _eq: id } }, sort: null }, onEvent).unsubscribe);
      unsubs.push(subscribe('director_participants', { fields: ['id', 'status'], filter: { session: { _eq: id } }, sort: null }, onEvent).unsubscribe);
      unsubs.push(subscribe('director_qa', { fields: ['id'], filter: { session: { _eq: id } }, sort: null }, onEvent).unsubscribe);
      _unsub = () => unsubs.forEach((u) => { try { u(); } catch { /* noop */ } });
    } catch {
      // No realtime available — the poll backstop keeps the room in sync.
    }
  }

  function _attach(id: string, initial?: StatePayload) {
    _sessionId = id;
    if (initial) _applyState(initial);
    _subscribeRealtime(id);
    _startTimers();
    sendHeartbeat();
    if (!initial) refresh();
  }

  function detach() {
    if (_unsub) { _unsub(); _unsub = null; }
    _stopTimers();
    _sessionId = null;
    _session.value = null;
    _participants.value = [];
    _steps.value = [];
    _qa.value = [];
    _lastRevision.value = -1;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  /** Convene a live meeting and take the host seat. Returns the session id. */
  async function convene(opts: {
    scopeType?: 'org' | 'entity' | 'mine'; entityType?: string | null; entityId?: string | null;
    subject?: string | null; topic?: string | null; planId?: string | null; title?: string | null;
    includedSubjects?: string[] | null; viewOnly?: boolean;
  }): Promise<string | null> {
    if (!selectedOrg.value) return null;
    _connecting.value = true;
    try {
      const res = await $fetch<{ sessionId: string | number }>('/api/ai/director/sessions', {
        method: 'POST',
        body: { organizationId: selectedOrg.value, ...opts },
      });
      const id = String(res.sessionId);
      _attach(id);
      await refresh();
      return id;
    } catch (err: any) {
      if (err?.statusCode === 503) {
        toast.add({ title: 'Live meetings not enabled', description: 'The realtime meeting layer needs a one-time setup. Running solo for now.', icon: 'i-lucide-info', color: 'blue' });
      } else {
        toast.add({ title: 'Could not go live', description: err?.data?.message || 'Please try again.', icon: 'i-lucide-alert-circle', color: 'red' });
      }
      return null;
    } finally {
      _connecting.value = false;
    }
  }

  /** Join an existing live session (from an invite or the join list). */
  async function joinSession(id: string): Promise<boolean> {
    _connecting.value = true;
    try {
      const res = await $fetch<StatePayload>(`/api/ai/director/sessions/${id}/join`, { method: 'POST' });
      _attach(String(id), res);
      return true;
    } catch (err: any) {
      toast.add({ title: 'Could not join', description: err?.data?.message || 'That meeting may have ended.', icon: 'i-lucide-alert-circle', color: 'red' });
      return false;
    } finally {
      _connecting.value = false;
    }
  }

  async function leave() {
    const id = _sessionId;
    detach();
    if (id) await $fetch(`/api/ai/director/sessions/${id}/leave`, { method: 'POST' }).catch(() => {});
  }

  async function end() {
    const id = _sessionId;
    if (!id) return;
    try {
      await $fetch(`/api/ai/director/sessions/${id}/end`, { method: 'POST' });
    } catch (err: any) {
      toast.add({ title: 'Could not end the meeting', description: err?.data?.message || 'Please try again.', icon: 'i-lucide-alert-circle', color: 'red' });
      return;
    }
    detach();
  }

  async function invite(userIds: string[]): Promise<number> {
    if (!_sessionId || !userIds.length) return 0;
    try {
      const res = await $fetch<{ invited: number }>(`/api/ai/director/sessions/${_sessionId}/invite`, {
        method: 'POST', body: { userIds },
      });
      await refresh();
      return res.invited || 0;
    } catch (err: any) {
      toast.add({ title: 'Could not send invites', description: err?.data?.message || 'Please try again.', icon: 'i-lucide-alert-circle', color: 'red' });
      return 0;
    }
  }

  /** Link a freshly-drafted plan to the live session (host drafts in-room). */
  async function attachPlan(planId: string, title?: string | null) {
    if (!_sessionId || !planId) return;
    await $fetch(`/api/ai/director/sessions/${_sessionId}/plan`, {
      method: 'POST', body: { planId, title },
    }).catch(() => {});
    await refresh();
  }

  // ── In-room actions ──────────────────────────────────────────────────────────

  async function approveStep(step: LiveStep) {
    if (!_sessionId || step.status !== 'pending') return;
    step.status = 'executing';
    try {
      await $fetch(`/api/ai/director/sessions/${_sessionId}/step`, {
        method: 'POST', body: { actionId: step.id, decision: 'approve' },
      });
      step.status = 'executed';
    } catch (err: any) {
      step.status = 'failed';
      toast.add({ title: 'Step failed', description: err?.data?.message || 'Could not run this step.', icon: 'i-lucide-alert-circle', color: 'red' });
    } finally {
      refresh();
    }
  }

  async function skipStep(step: LiveStep) {
    if (!_sessionId || step.status !== 'pending') return;
    const prev = step.status;
    step.status = 'rejected';
    try {
      await $fetch(`/api/ai/director/sessions/${_sessionId}/step`, {
        method: 'POST', body: { actionId: step.id, decision: 'reject' },
      });
    } catch (err: any) {
      step.status = prev;
      toast.add({ title: 'Could not skip', description: err?.data?.message || 'Please try again.', icon: 'i-lucide-alert-circle', color: 'red' });
    } finally {
      refresh();
    }
  }

  /** Post a shared Q&A exchange (answer already fetched from /ask). */
  async function postQa(question: string, answer: string) {
    if (!_sessionId) return;
    await $fetch(`/api/ai/director/sessions/${_sessionId}/qa`, {
      method: 'POST', body: { question, answer },
    }).catch(() => {});
    refresh();
  }

  /** Presenter drives the shared SCREEN — advisor (subject), view mode, slide.
   * Any subset; followers mirror exactly what's projected. */
  async function broadcastView(view: { subject?: string | null; viewMode?: 'outline' | 'slides'; slide?: number }) {
    if (!_sessionId || !isPresenter.value) return;
    await $fetch(`/api/ai/director/sessions/${_sessionId}/present`, {
      method: 'POST', body: view,
    }).catch(() => {});
  }

  async function takePresenter() {
    if (!_sessionId) return;
    await $fetch(`/api/ai/director/sessions/${_sessionId}/present`, {
      method: 'POST', body: { takePresenter: true },
    }).catch(() => {});
    refresh();
  }

  async function setFollowPresenter(follow: boolean) {
    if (!_sessionId) return;
    await $fetch(`/api/ai/director/sessions/${_sessionId}/present`, {
      method: 'POST', body: { follow },
    }).catch(() => {});
    refresh();
  }

  /** Host-only: lock participation so only the presenter can decide. */
  async function setViewOnly(viewOnly: boolean) {
    if (!_sessionId) return;
    await $fetch(`/api/ai/director/sessions/${_sessionId}/present`, {
      method: 'POST', body: { viewOnly },
    }).catch(() => {});
    refresh();
  }

  /** Record which slide I'm viewing (presence dots). Debounced by the caller. */
  function reportViewedSlide(slide: number) {
    _myViewedSlide = slide;
  }

  async function sendHeartbeat() {
    if (!_sessionId || import.meta.server) return;
    await $fetch(`/api/ai/director/sessions/${_sessionId}/presence`, {
      method: 'POST', body: { currentSlide: _myViewedSlide },
    }).catch(() => {});
  }

  return {
    // state
    session: readonly(_session),
    participants: readonly(_participants),
    steps: _steps, // mutable: optimistic approve/skip flips status in place
    qa: readonly(_qa),
    connecting: readonly(_connecting),
    // computed
    isLive, isHost, isPresenter, canDecide, isFollowing, attendees, presentNow, myUserId,
    // lifecycle
    convene, joinSession, leave, end, invite, attachPlan, refresh, detach,
    // in-room
    approveStep, skipStep, postQa, broadcastView, takePresenter, setFollowPresenter,
    setViewOnly, reportViewedSlide, sendHeartbeat,
  };
}
