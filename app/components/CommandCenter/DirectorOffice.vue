<!--
  DirectorOffice — the org-wide (or focused) "command center" overlay.

  Earnest convenes a working meeting: it opens the board packet (the ai-notices
  sweep, via /api/ai/director/agenda), the user picks a subject, Earnest drafts a
  numbered PLAN of proposed actions (/api/ai/director/plan), and the user approves
  or skips each step one-by-one. Propose-only — nothing runs without a per-step
  approve. A "minutes" rollup summarizes the meeting, and on close any approved
  changes trigger a refresh so the page behind the overlay isn't stale.

  Mounted once globally (app.vue); opened from anywhere via useBoardroom().
-->
<script setup lang="ts">
import { gsap } from 'gsap';
import { useEarnestPresence, type EarnestMood } from '~/composables/useEarnestPresence';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui/tooltip';
const { isOpen, scope, close } = useBoardroom();
const { selectedOrg, currentOrg } = useOrganization();
const orgName = computed(() => (currentOrg.value as any)?.name || '');
const toast = useToast();
const config = useRuntimeConfig();

// Assignable teammates — for the deck's "assign an action item" capture form and
// re-assigning an AI-proposed task before approving it.
const { filteredUsers, fetchFilteredUsers } = useFilteredUsers();
const assignableUsers = computed(() =>
  (filteredUsers.value || []).map((u: any) => ({
    id: String(u.id),
    label: u.label || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email || 'Teammate',
    avatar: u.avatar ? `${config.public.assetsUrl}${u.avatar}?key=avatar` : null,
  })),
);
const usersById = computed(() => new Map(assignableUsers.value.map((u) => [u.id, u])));

// ── Live, multiplayer meeting ────────────────────────────────────────────────
// The office runs solo by default; going live convenes a shared session others
// can be invited to. All live wiring is guarded by `liveActive` so solo mode is
// untouched. Realtime state (presence, steps, Q&A) comes from useBoardroomSession.
const {
  isLive: liveActive,
  isHost: liveIsHost,
  isPresenter: liveIsPresenter,
  canDecide: liveCanDecide,
  isFollowing: liveIsFollowing,
  session: liveSession,
  connecting: liveConnecting,
  attendees: liveAttendees,
  presentNow: livePresentNow,
  steps: liveSteps,
  qa: liveQa,
  convene,
  leave: leaveSession,
  end: endSession,
  invite: inviteToSession,
  approveStep: approveStepLive,
  skipStep: skipStepLive,
  postQa,
  broadcastView,
  takePresenter,
  setViewOnly,
  reportViewedSlide,
  attachPlan,
} = useBoardroomSession();

const showInvite = ref(false);
// Go-live setup sheet — the host curates which advisors are in the room.
const showGoLive = ref(false);
const goLiveSubjects = ref<string[]>([]);
const goLiveViewOnly = ref(false);
const seatedIds = computed(() => liveAttendees.value.map((p) => String(p.userId)).filter(Boolean));

function avatarFor(p: { avatar: string | null; name: string }): string {
  if (p.avatar) return `${config.public.assetsUrl}${p.avatar}?key=avatar`;
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name || 'Teammate')}&background=6366f1&color=fff&size=48`;
}

// The advisors (agenda subjects) available to bring into a live meeting.
interface Advisor { subject: string; label: string; icon: string }
const availableAdvisors = computed<Advisor[]>(() =>
  (agenda.value?.groups || []).map((g) => ({ subject: g.subject, label: g.label, icon: iconForSubject(g) })),
);

// Open the go-live setup sheet: seed the advisor selection (all in by default,
// or just the one already open) so the host can curate who's in the room.
function openGoLive() {
  const all = availableAdvisors.value.map((a) => a.subject);
  goLiveSubjects.value = activeSubject.value ? [activeSubject.value] : all;
  goLiveViewOnly.value = false;
  showGoLive.value = true;
}

function toggleGoLiveSubject(subject: string) {
  const set = new Set(goLiveSubjects.value);
  if (set.has(subject)) set.delete(subject);
  else set.add(subject);
  goLiveSubjects.value = Array.from(set);
}

// Convene the live meeting with the curated advisor set. Invitees land on the
// same briefing and only ever see the advisors the host let into the room.
async function confirmGoLive() {
  const s = scope.value;
  const included = goLiveSubjects.value.slice();
  const id = await convene({
    scopeType: s?.mode === 'entity' ? 'entity' : 'org',
    entityType: s?.mode === 'entity' ? s.entityType : null,
    entityId: s?.mode === 'entity' ? s.entityId : null,
    subject: activeSubject.value || null,
    topic: topicInput.value.trim() || null,
    planId: planId.value || null,
    title: activeSubject.value ? recentLabelForSubject(activeSubject.value) : (s?.label || 'Working session'),
    // Entity/focused meetings are inherently one advisor — no curation needed.
    includedSubjects: s?.mode === 'entity' ? null : (included.length ? included : null),
    viewOnly: goLiveViewOnly.value,
  });
  showGoLive.value = false;
  if (id) {
    showInvite.value = true; // prompt to fill the table straight away
    toast.add({ title: 'You’re live', description: 'Invite teammates to review and approve together.', icon: 'i-lucide-radio', color: 'green' });
  }
}

function recentLabelForSubject(subject: string): string {
  const s = (subject || '').toLowerCase();
  return ({ money: 'The Money', clients: 'Clients', projects: 'Projects', leads: 'Pipeline', proposals: 'Proposals', tickets: 'Support' } as Record<string, string>)[s]
    || (subject ? subject.charAt(0).toUpperCase() + subject.slice(1) : 'Working session');
}

async function onInvite(userIds: string[]) {
  const n = await inviteToSession(userIds);
  showInvite.value = false;
  if (n > 0) toast.add({ title: `Invited ${n} ${n === 1 ? 'teammate' : 'teammates'}`, description: 'They’ll get a notification to join.', icon: 'i-lucide-user-plus', color: 'green' });
}

async function onLeaveMeeting() {
  if (liveIsHost.value) await endSession();
  else await leaveSession();
}

// The presenter drives the shared deck; everyone reports their viewed slide.
function onSlideIndex(n: number) {
  reportViewedSlide(n);
  if (liveActive.value && liveIsPresenter.value) broadcastView({ slide: n });
}
// NOTE: the presenter/follower screen-sync watchers live further down, after
// `activeSubject` and `viewMode` are declared (they can't run before those refs).

// Mirror live step state into the local `steps` the whole template already
// renders — so a teammate's approve/skip shows for everyone. Live steps are the
// authoritative objects (approveStepLive mutates them in place + re-syncs).
watch([liveActive, liveSteps], () => {
  // Guard on length so the brief empty state right after going live doesn't wipe
  // the host's already-drafted steps before the first session sync lands.
  if (liveActive.value && liveSteps.value.length) steps.value = liveSteps.value as any;
}, { immediate: true });

// Mirror the shared Q&A thread when live.
watch([liveActive, liveQa], () => {
  if (liveActive.value) qaThread.value = liveQa.value.map((t) => ({ role: t.role, text: t.text }));
}, { immediate: true });

// When a live session's shared subject changes (e.g. a follower joins, or the
// presenter opens a section), everyone catches up to the same briefing. This is
// LOAD-ONLY — a catching-up attendee must never POST /plan (that would mint a
// duplicate plan); they read the saved briefing + the session's shared steps.
watch(() => liveSession.value?.sharedSubject ?? liveSession.value?.subject, (subject) => {
  if (!liveActive.value || !isOpen.value) return;
  // Only followers snap to the presenter's advisor; the presenter drives freely.
  if (!liveIsFollowing.value) return;
  if (subject && activeSubject.value !== subject) loadSharedSubject(subject);
});

async function loadSharedSubject(subject: string) {
  activeSubject.value = subject;
  topicInput.value = liveSession.value?.topic || '';
  planning.value = true;
  planIntro.value = '';
  finance.value = null;
  opportunity.value = null;
  clientRating.value = null;
  try {
    const q: Record<string, string> = { organizationId: selectedOrg.value! };
    if (subject) q.subject = subject;
    if (topicInput.value.trim()) q.topic = topicInput.value.trim();
    if (scope.value?.mode === 'entity' && scope.value.entityType && scope.value.entityId) {
      q.entityType = scope.value.entityType;
      q.entityId = scope.value.entityId;
    }
    const saved = await $fetch<{ found: boolean; planId?: string; intro?: string; stepCount?: number; finance?: any; opportunity?: any; clientRating?: any; savedAt?: string }>(
      '/api/ai/director/briefing', { query: q },
    ).catch(() => ({ found: false }) as any);
    if (saved?.found) {
      planId.value = saved.planId || liveSession.value?.planId || null;
      planIntro.value = saved.intro || '';
      finance.value = saved.finance || null;
      opportunity.value = saved.opportunity || null;
      clientRating.value = saved.clientRating || null;
      briefingSavedAt.value = saved.savedAt || null;
    }
    // Steps come from the live session mirror; load by the shared planId as a
    // fallback if the mirror hasn't landed yet.
    const pid = liveSession.value?.planId || planId.value;
    if (pid && !steps.value.length) await loadSteps(pid).catch(() => {});
  } finally {
    planning.value = false;
  }
}

type Priority = 'urgent' | 'high' | 'medium' | 'low';
interface AgendaNotice { id: string; title: string; description: string; priority: Priority; entityType?: string; entityId?: string }
interface AgendaGroup { subject: string; label: string; topPriority: Priority; notices: AgendaNotice[]; proposedCount: number }
interface Agenda { mode: 'org' | 'entity' | 'mine'; groups: AgendaGroup[]; totalNotices: number; totalProposed: number }

type StepStatus = 'pending' | 'executing' | 'executed' | 'rejected' | 'failed';
interface Step { id: string; action_type: string; title: string; preview: any; status: StepStatus }

const agenda = ref<Agenda | null>(null);
const loadingAgenda = ref(false);
const agendaError = ref<string | null>(null);
// Agenda presentation: the boardroom "table" (chairs = agenda items) by default,
// or the plain card outline. Desktop only — mobile always shows the cards.
const agendaView = ref<'table' | 'outline'>('outline');
// Immersive skin: the half-circle board (default) vs the detail agenda cards.
const agendaLayout = ref<'arc' | 'cards'>('arc');

// In a live meeting the host may have curated which advisors are in the room —
// everyone (host included) only sees those. Solo/off-live shows all.
const visibleAgendaGroups = computed(() => {
  const gs = agenda.value?.groups || [];
  const included = liveActive.value ? liveSession.value?.includedSubjects : null;
  if (!included || !included.length) return gs;
  const set = new Set(included);
  return gs.filter((g) => set.has(g.subject));
});

// Seat each agenda group around the table along a shallow top arc (edges sit
// lower/nearer, the middle sits higher/back), so N items read as one boardroom.
const agendaSeats = computed(() => {
  const gs = visibleAgendaGroups.value;
  const n = gs.length;
  return gs.map((g, i) => {
    const t = n <= 1 ? 0.5 : i / (n - 1);
    const arc = Math.sin(t * Math.PI); // 0 at the edges, 1 in the middle
    // Each chair takes a different palette accent (in the app rail's own gradient
    // order) so the table reads as a chromatic spread, cohesive with the rail.
    const accent = `var(--app-${CHAIR_ACCENT_IDS[i % CHAIR_ACCENT_IDS.length]}-icon, hsl(200 71% 40%))`;
    return { g, left: `${22 + t * 56}%`, top: `${50 - arc * 28}px`, accent };
  });
});
// App-rail accent ids in gradient order (bright cyan → dark blue) — reused to
// tint the boardroom chairs the same chromatic way the rail tints its apps.
const CHAIR_ACCENT_IDS = ['clients', 'work', 'money', 'marketing', 'director', 'organization', 'account'];

// ── Immersive "board" — departments fanned in a half-circle around the Director,
// no table. Each seat = an agenda group; click convenes on that subject. The
// yPx / xPct mark the CHIP CENTRE so the connector lines land dead-centre.
const ARC_H = 300;
const DIRECTOR_POS = { xPct: 50, yPx: 234 };
const arcSeats = computed(() => {
  const gs = visibleAgendaGroups.value;
  const n = gs.length;
  const startDeg = 156, endDeg = 24;
  return gs.map((g, i) => {
    const t = n <= 1 ? 0.5 : i / (n - 1);
    const deg = startDeg + (endDeg - startDeg) * t;
    const rad = (deg * Math.PI) / 180;
    const xPct = 50 + 40 * Math.cos(rad);
    const yPx = 198 - 150 * Math.sin(rad);
    const accent = `var(--app-${CHAIR_ACCENT_IDS[i % CHAIR_ACCENT_IDS.length]}-icon, hsl(200 71% 40%))`;
    return { g, xPct, yPx, left: `${xPct}%`, top: `${yPx}px`, accent };
  });
});
// During a live session the presenter drives a shared subject — pulse that seat.
const presentingSubject = computed(() => (liveActive.value ? activeSubject.value : null));
const presenterAvatar = computed(() => {
  const pid = liveSession.value?.presenterId;
  if (!pid) return null;
  const p = livePresentNow.value.find((x) => String(x.userId) === String(pid));
  return p ? { name: p.name, src: avatarFor(p) } : null;
});
// The department currently in focus (for the meeting's context sub-line).
const activeGroupLabel = computed(() => visibleAgendaGroups.value.find((g) => g.subject === activeSubject.value)?.label || '');
// What the meeting is focused on: a picked department, an entity scope, or — by
// default — the whole organization.
const focusLabel = computed(() => {
  if (activeSubject.value && activeGroupLabel.value) return activeGroupLabel.value;
  if (scope.value?.mode === 'entity') return scopeLabel.value;
  return 'the whole organization';
});
// The back link's label reflects where you land: the board or the agenda list.
const backLabel = computed(() => (agendaLayout.value === 'arc' ? 'Back to board room' : 'Back to agenda'));
// Un-focus the department AND clear the drafted plan → a clean board.
function backToBoard() {
  activeSubject.value = null;
  planning.value = false;
  steps.value = [];
  planId.value = null;
  planIntro.value = '';
  finance.value = null;
  opportunity.value = null;
  clientRating.value = null;
  briefingSavedAt.value = null;
  qaThread.value = [];
  qaInput.value = '';
  topicInput.value = '';
}

// The Director at the head of the table — the current user. Name from the
// session; job title needs the full user record (session omits it).
const { user } = useUserSession();
const { readMe } = useDirectusUsers();
const directorName = computed(() => user.value?.first_name?.trim() || 'You');
const directorTitle = ref('Director');
onMounted(async () => {
  try {
    const me: any = await readMe({ fields: ['title'] });
    if (me?.title) directorTitle.value = String(me.title);
  } catch { /* keep the "Director" default */ }
});

// Live: the OTHER humans present (not me — I'm the Director chair at the head),
// seated flanking the head so the table shows real people. Split left/right so
// they fan out symmetrically around the Director.
const otherAttendees = computed(() =>
  livePresentNow.value.filter((p) => String(p.userId) !== String(user.value?.id)),
);
const leftGuests = computed(() => otherAttendees.value.filter((_, i) => i % 2 === 0).slice(0, 3));
const rightGuests = computed(() => otherAttendees.value.filter((_, i) => i % 2 === 1).slice(0, 3));

// Collapsed "Raise a topic" affordance that expands to the input on click.
const topicOpen = ref(false);
const topicInputEl = ref<HTMLInputElement | null>(null);
function openTopic() {
  topicOpen.value = true;
  nextTick(() => topicInputEl.value?.focus());
}

// This meeting's identity — its date/time (saved meetings are keyed on it).
const meetingStartedAt = ref<Date | null>(null);
const meetingLabel = computed(() =>
  meetingStartedAt.value
    ? meetingStartedAt.value.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '',
);

// User tags on this meeting for future reference.
const meetingTags = ref<string[]>([]);
const tagInput = ref('');
const tagOpen = ref(false);
const tagInputEl = ref<HTMLInputElement | null>(null);
function openTag() {
  tagOpen.value = true;
  nextTick(() => tagInputEl.value?.focus());
}
function addTag() {
  const t = tagInput.value.trim().replace(/^#/, '');
  if (t && !meetingTags.value.includes(t)) meetingTags.value.push(t);
  tagInput.value = '';
}
function removeTag(tag: string) {
  meetingTags.value = meetingTags.value.filter((x) => x !== tag);
}

// While a member is presenting (its plan is open), draw a dashed line from that
// chair to the Director at the head. Coords are in the table's 600×208 space.
const activeSeatLine = computed(() => {
  if (!activeSubject.value) return null;
  const seat = agendaSeats.value.find((s) => s.g.subject === activeSubject.value);
  if (!seat) return null;
  const x = (parseFloat(seat.left) / 100) * 600;
  const y = parseFloat(seat.top) + 34;
  return { x1: x, y1: y, x2: 300, y2: 150, accent: seat.accent };
});

const activeSubject = ref<string | null>(null);
const planning = ref(false);
const planIntro = ref('');
const planId = ref<string | null>(null);
const steps = ref<Step[]>([]);
const finance = ref<any | null>(null); // money-mode snapshot metrics
const opportunity = ref<any | null>(null); // money-mode opportunity intel
const clientRating = ref<any | null>(null); // focused client-review scorecard
const topicInput = ref(''); // free-text "raise a topic" steer for the plan
const mutated = ref(false); // any step executed → refresh page behind on close

// ── Minutes (async "decision room" recap) ────────────────────────────────────
// Record the finished meeting into a durable decision record, then optionally
// share it for review. Captured action items are accumulated here so they land
// in the minutes alongside the steps + Q&A.
const { record: recordMinutes, share: shareMinutes } = useBoardroomMinutes();
interface CapturedItem { type: 'task' | 'ticket'; title: string; priority?: string; assignees?: string[] }
const capturedItems = ref<CapturedItem[]>([]);
const recordingMinutes = ref(false);
const savedMinutesId = ref<string | null>(null);
const showShareMinutes = ref(false);

// ── Board-packet cache ────────────────────────────────────────────────────
// The overlay is mounted once (app.vue) and only toggles `isOpen`, so this
// state survives close/reopen. We reuse a recent agenda so reopening is
// instant, and cache each subject's drafted plan so flipping back to a section
// restores it verbatim (steps + statuses) instead of re-drafting from scratch.
interface QaTurn { role: 'user' | 'assistant'; text: string }
interface CachedPlan {
  planId: string | null; intro: string; steps: Step[];
  finance: any; opportunity: any; clientRating: any; at: number; savedAt: string | null; qa: QaTurn[];
}
const AGENDA_FRESH_MS = 5 * 60 * 1000; // reuse a board packet for 5 min on reopen
const agendaCache = ref<{ key: string; agenda: Agenda; at: number } | null>(null);
const planCache = ref<Record<string, CachedPlan>>({}); // keyed by subject + topic
const briefingSavedAt = ref<string | null>(null); // when the shown plan was first drafted (persisted)

// Outline (stacked panel) vs Slides (designed presentation deck) view of a plan.
const viewMode = ref<'outline' | 'slides'>('outline');
const hasBriefing = computed(() =>
  !!planIntro.value || steps.value.length > 0 || !!finance.value || !!clientRating.value || !!opportunity.value,
);
const showSlides = computed(() => viewMode.value === 'slides' && !planning.value && hasBriefing.value);

// ── Live screen-sync (declared here — needs activeSubject + viewMode above) ──
// Presenter broadcasts the whole screen — which advisor + which view — so
// followers mirror exactly what's on the projector.
watch(activeSubject, (subject) => {
  if (liveActive.value && liveIsPresenter.value) broadcastView({ subject: subject || null });
});
watch(viewMode, (mode) => {
  if (liveActive.value && liveIsPresenter.value) broadcastView({ viewMode: mode });
});
// Followers mirror the presenter's view mode.
watch(() => liveSession.value?.sharedViewMode, (mode) => {
  if (liveIsFollowing.value && mode && viewMode.value !== mode) viewMode.value = mode;
});

// Ask Earnest — advisory Q&A grounded in the current briefing (per-subject,
// cached alongside the plan so flipping back keeps the conversation).
const qaThread = ref<QaTurn[]>([]);
const qaInput = ref('');
const qaLoading = ref(false);
const qaSuggestions = computed<string[]>(() => {
  if (activeSubject.value === 'money' || finance.value) return ['Why this plan?', "What's the biggest risk?", 'Where should we focus to grow?'];
  if (clientRating.value) return ['Why this rating?', 'Should we keep investing here?', 'How do we improve it?'];
  return ['Why this order?', "What's the biggest risk?", 'Suggest an alternative'];
});

// The model appends a "TL;DR:" line: verbose prose above (outline), crisp
// takeaways below (slides). Rides in the persisted `intro`, split per view.
const TLDR_RE = /TL;?DR\s*:/i;
const outlineIntro = computed(() => {
  const t = planIntro.value || '';
  const i = t.search(TLDR_RE);
  return (i >= 0 ? t.slice(0, i) : t).trim();
});
const slidePoints = computed<string[]>(() => {
  const parts = (planIntro.value || '').split(TLDR_RE);
  if (parts.length < 2) return [];
  return parts[parts.length - 1]!.split('|').map((s) => s.trim().replace(/^[-•*]\s*/, '')).filter(Boolean).slice(0, 4);
});

// Which slide the Director is viewing — lets Ask Earnest resolve "this slide".
const slideContext = ref('');

const nowMs = () => Date.now();

// Distinguishes an org-wide meeting from a focused one for cache keys.
function scopeKey(): string {
  const s = scope.value;
  if (s?.mode === 'entity' && s.entityType && s.entityId) return `entity:${s.entityType}:${s.entityId}`;
  return 'org';
}

// Relative age helper ("3h ago"), reused by the saved-briefing tag + recents.
function relTime(iso: string | null): string {
  if (!iso) return '';
  const diff = nowMs() - new Date(iso).getTime();
  if (!isFinite(diff) || diff < 60_000) return 'just now';
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}
const savedAgo = computed(() => relTime(briefingSavedAt.value));

// Recent meetings — lets the Director pick up prior work without leaving the
// overlay. Loaded from the saved-briefing history, scoped to the current
// meeting scope (org-wide or this focused entity), deduped to the latest per
// subject/topic.
interface RecentMeeting {
  id: string | number; subject: string | null; topic: string | null;
  scope_type: string; entity_type: string | null; entity_id: string | null;
  step_count: number; intro: string | null; date_created: string;
}
const recentMeetings = ref<RecentMeeting[]>([]);

async function loadRecent() {
  if (!selectedOrg.value) { recentMeetings.value = []; return; }
  try {
    const res = await $fetch<{ meetings: RecentMeeting[] }>('/api/ai/director/history', {
      query: { organizationId: selectedOrg.value, limit: 40 },
    });
    const s = scope.value;
    const isEntity = s?.mode === 'entity' && !!s.entityType && !!s.entityId;
    const inScope = (res.meetings || []).filter((m) => isEntity
      ? (m.scope_type === 'entity' && m.entity_type === s!.entityType && String(m.entity_id) === String(s!.entityId))
      : m.scope_type === 'org');
    const seen = new Set<string>();
    const out: RecentMeeting[] = [];
    for (const m of inScope) {
      const k = `${m.subject || ''}|${(m.topic || '').toLowerCase().trim()}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(m);
      if (out.length >= 5) break;
    }
    recentMeetings.value = out;
  } catch {
    recentMeetings.value = [];
  }
}

function recentLabel(m: RecentMeeting): string {
  if (m.topic) return m.topic;
  const s = (m.subject || '').toLowerCase();
  return ({ money: 'The Money', clients: 'Clients', projects: 'Projects', leads: 'Pipeline', proposals: 'Proposals', tickets: 'Support' } as Record<string, string>)[s]
    || (m.subject ? m.subject.charAt(0).toUpperCase() + m.subject.slice(1) : 'Working session');
}
function recentIcon(m: RecentMeeting): string {
  const s = (m.subject || '').toLowerCase();
  if (s === 'money') return 'i-lucide-banknote';
  if (s === 'clients') return 'i-lucide-user-round';
  if (s === 'projects') return 'i-lucide-folder-kanban';
  if (s === 'leads') return 'i-lucide-trending-up';
  if (s === 'proposals') return 'i-lucide-file-text';
  if (s === 'tickets') return 'i-lucide-ticket';
  return 'i-lucide-sparkles';
}
function openRecent(m: RecentMeeting) {
  topicInput.value = m.topic || '';
  draftPlan(m.subject || '');
}

const fmtMoney = (n: number) => `$${Math.round(Number(n) || 0).toLocaleString()}`;
const netClass = (n: number) => (Number(n) >= 0 ? 'text-success' : 'text-destructive');
function ratingClass(r: string): string {
  return { A: 'bg-success/15 text-success', B: 'bg-success/10 text-success', C: 'bg-warning/15 text-warning', D: 'bg-destructive/10 text-destructive', F: 'bg-destructive/20 text-destructive' }[r] || 'bg-muted text-muted-foreground';
}

const scopeLabel = computed(() => {
  if (scope.value?.mode === 'entity') return scope.value.label || 'this item';
  return 'the organization';
});

const meetingActive = computed(() =>
  !!activeSubject.value || planning.value || !!planIntro.value || steps.value.length > 0 || !!finance.value || !!clientRating.value,
);

function raiseTopic() {
  if (!topicInput.value.trim() || planning.value) return;
  // Free-text topic: draft against the current subject if one is open, else org-wide.
  draftPlan(activeSubject.value || '');
}

const rollup = computed(() => {
  const done = steps.value.filter((s) => s.status === 'executed').length;
  const skipped = steps.value.filter((s) => s.status === 'rejected').length;
  const failed = steps.value.filter((s) => s.status === 'failed').length;
  const open = steps.value.filter((s) => s.status === 'pending' || s.status === 'executing').length;
  return { done, skipped, failed, open, total: steps.value.length };
});

function priorityClass(p: Priority): string {
  return {
    urgent: 'text-destructive bg-destructive/10',
    high: 'text-warning bg-warning/10',
    medium: 'text-info bg-info/10',
    low: 'text-muted-foreground bg-muted',
  }[p];
}

async function loadAgenda(force = false) {
  if (!selectedOrg.value) return;
  const key = `${selectedOrg.value}::${scopeKey()}`;
  // Reuse a recent board packet on reopen — instant, and resume the meeting
  // exactly where it was left (active subject + drafted plans stay cached).
  if (!force && agendaCache.value?.key === key && nowMs() - agendaCache.value.at < AGENDA_FRESH_MS) {
    agenda.value = agendaCache.value.agenda;
    return;
  }
  loadingAgenda.value = true;
  agendaError.value = null;
  agenda.value = null;
  activeSubject.value = null;
  steps.value = [];
  planId.value = null;
  planIntro.value = '';
  finance.value = null;
  opportunity.value = null;
  clientRating.value = null;
  planCache.value = {}; // new packet → drop stale per-subject plans
  try {
    const q: Record<string, string> = { organizationId: selectedOrg.value };
    if (scope.value?.mode === 'entity' && scope.value.entityType && scope.value.entityId) {
      q.entityType = scope.value.entityType;
      q.entityId = scope.value.entityId;
    }
    agenda.value = await $fetch<Agenda>('/api/ai/director/agenda', { query: q });
    agendaCache.value = { key, agenda: agenda.value, at: nowMs() };
    // Focused meetings have a single subject — open its plan straight away.
    if (agenda.value?.mode === 'entity' && agenda.value.groups.length === 1) {
      draftPlan(agenda.value.groups[0]!.subject);
    }
  } catch (err: any) {
    agendaError.value = err?.data?.message || 'Could not load the agenda.';
  } finally {
    loadingAgenda.value = false;
  }
}

async function draftPlan(subject: string, force = false) {
  if (planning.value) return;
  const topic = topicInput.value.trim();
  const key = `${subject} ${topic}`;
  activeSubject.value = subject;
  // Cache hit → restore the drafted plan verbatim (steps + approve/skip
  // statuses persist because it's the same reactive array) — no re-draft.
  const cached = planCache.value[key];
  if (!force && cached) {
    planId.value = cached.planId;
    planIntro.value = cached.intro;
    steps.value = cached.steps;
    finance.value = cached.finance;
    opportunity.value = cached.opportunity;
    clientRating.value = cached.clientRating;
    briefingSavedAt.value = cached.savedAt;
    qaThread.value = cached.qa || [];
    return;
  }
  planning.value = true;
  steps.value = [];
  planId.value = null;
  planIntro.value = '';
  finance.value = null;
  opportunity.value = null;
  clientRating.value = null;
  briefingSavedAt.value = null;
  qaThread.value = [];
  qaInput.value = '';
  const q: Record<string, string> = { organizationId: selectedOrg.value! };
  if (subject) q.subject = subject;
  if (topic) q.topic = topic;
  if (scope.value?.mode === 'entity' && scope.value.entityType && scope.value.entityId) {
    q.entityType = scope.value.entityType;
    q.entityId = scope.value.entityId;
  }
  try {
    // Unless forced, try Earnest's saved thinking first — zero tokens.
    if (!force) {
      const saved = await $fetch<{ found: boolean; planId?: string; intro?: string; stepCount?: number; finance?: any; opportunity?: any; clientRating?: any; savedAt?: string }>(
        '/api/ai/director/briefing', { query: q },
      ).catch(() => ({ found: false }) as any);
      if (saved?.found && saved.planId) {
        planId.value = saved.planId;
        planIntro.value = saved.intro || '';
        finance.value = saved.finance || null;
        opportunity.value = saved.opportunity || null;
        clientRating.value = saved.clientRating || null;
        briefingSavedAt.value = saved.savedAt || null;
        if ((saved.stepCount || 0) > 0) await loadSteps(saved.planId);
        planCache.value[key] = {
          planId: planId.value, intro: planIntro.value, steps: steps.value,
          finance: finance.value, opportunity: opportunity.value, clientRating: clientRating.value,
          at: nowMs(), savedAt: briefingSavedAt.value, qa: qaThread.value,
        };
        return;
      }
    }
    // Nothing saved (or a forced re-draft) → call Claude. The server persists
    // this draft so next time the branch above restores it for free.
    const res = await $fetch<{ planId: string; intro: string; stepCount: number; finance?: any; opportunity?: any; clientRating?: any }>(
      '/api/ai/director/plan', { method: 'POST', body: { ...q } },
    );
    planId.value = res.planId;
    planIntro.value = res.intro || '';
    finance.value = res.finance || null;
    opportunity.value = res.opportunity || null;
    clientRating.value = res.clientRating || null;
    briefingSavedAt.value = null; // freshly drafted just now
    if (res.stepCount > 0) await loadSteps(res.planId);
    else toast.add({ title: 'Nothing to propose', description: 'Earnest had no concrete actions for this area right now.', icon: 'i-lucide-info', color: 'blue' });
    planCache.value[key] = {
      planId: planId.value, intro: planIntro.value, steps: steps.value,
      finance: finance.value, opportunity: opportunity.value, clientRating: clientRating.value,
      at: nowMs(), savedAt: null, qa: qaThread.value,
    };
    loadRecent(); // a fresh draft is persisted — refresh the recents list
    // Live host re-drafted in-room → push the new plan to everyone at the table.
    if (liveActive.value && liveIsHost.value && planId.value) {
      attachPlan(planId.value, recentLabelForSubject(subject));
    }
  } catch (err: any) {
    toast.add({ title: 'Could not draft a plan', description: err?.data?.message || 'Please try again.', icon: 'i-lucide-alert-circle', color: 'red' });
  } finally {
    planning.value = false;
  }
}

async function loadSteps(pid: string) {
  const res = await $fetch<{ actions: any[] }>('/api/ai/actions', {
    query: { organizationId: selectedOrg.value, planId: pid },
  });
  steps.value = (res.actions || []).map((a: any) => ({
    id: String(a.id),
    action_type: a.action_type,
    title: a.title || a.action_type,
    preview: a.preview || null,
    status: (a.status === 'executed' ? 'executed' : a.status === 'rejected' ? 'rejected' : a.status === 'failed' ? 'failed' : 'pending') as StepStatus,
  }));
}

async function approveStep(step: Step) {
  if (step.status !== 'pending') return;
  // View-only meeting: only the presenter/host may decide.
  if (liveActive.value && !liveCanDecide.value) {
    toast.add({ title: 'View-only meeting', description: 'Only the presenter can approve steps here.', icon: 'i-lucide-eye', color: 'blue' });
    return;
  }
  // Live: route through the session so the decision (and who made it) broadcasts.
  if (liveActive.value) { mutated.value = true; return approveStepLive(step as any); }
  step.status = 'executing';
  try {
    await $fetch(`/api/ai/actions/${step.id}/approve`, { method: 'POST' });
    step.status = 'executed';
    mutated.value = true;
  } catch (err: any) {
    step.status = 'failed';
    toast.add({ title: 'Step failed', description: err?.data?.message || 'Could not run this step.', icon: 'i-lucide-alert-circle', color: 'red' });
  }
}

async function skipStep(step: Step) {
  if (step.status !== 'pending') return;
  if (liveActive.value && !liveCanDecide.value) return;
  if (liveActive.value) return skipStepLive(step as any);
  const prev = step.status;
  step.status = 'rejected';
  try {
    await $fetch(`/api/ai/actions/${step.id}/reject`, { method: 'POST' });
  } catch (err: any) {
    step.status = prev;
    toast.add({ title: 'Could not skip', description: err?.data?.message || 'Please try again.', icon: 'i-lucide-alert-circle', color: 'red' });
  }
}

// When the meeting is focused on a project/client, a captured item inherits that
// link; a client-review briefing carries its client id too.
const captureProjectId = computed(() =>
  scope.value?.mode === 'entity' && scope.value.entityType === 'projects' ? scope.value.entityId || null : null,
);
const captureClientId = computed(() => {
  if (scope.value?.mode === 'entity' && scope.value.entityType === 'clients') return scope.value.entityId || null;
  return (clientRating.value as any)?.clientId || null;
});

// Capture: mint a real task/ticket and assign it, right from the deck.
async function captureActionItem(payload: { type: 'task' | 'ticket'; title: string; priority: string; assignTo: string[] }) {
  if (!selectedOrg.value) return;
  try {
    await $fetch('/api/ai/director/capture', {
      method: 'POST',
      body: {
        organizationId: selectedOrg.value,
        type: payload.type,
        title: payload.title,
        priority: payload.priority,
        assignTo: payload.assignTo,
        projectId: captureProjectId.value,
        clientId: captureClientId.value,
      },
    });
    mutated.value = true;
    // Remember it for the minutes (names, not ids, so the recap reads cleanly).
    capturedItems.value.push({
      type: payload.type,
      title: payload.title,
      priority: payload.priority,
      assignees: payload.assignTo.map((id) => usersById.value.get(id)?.label).filter(Boolean) as string[],
    });
    const noun = payload.type === 'ticket' ? 'Ticket' : 'Task';
    toast.add({
      title: `${noun} created`,
      description: payload.assignTo.length ? 'Assigned — the team was notified.' : 'Added to the board.',
      icon: 'i-lucide-check-circle',
      color: 'green',
    });
  } catch (err: any) {
    toast.add({ title: 'Could not create it', description: err?.data?.message || 'Please try again.', icon: 'i-lucide-alert-circle', color: 'red' });
  }
}

// Re-assign an AI-proposed task before it's approved. Patches the stored action
// (honored by both the solo and live approve paths); preview updates optimistically.
async function reassignStep({ step, userIds }: { step: Step; userIds: string[] }) {
  const names = userIds.map((id) => usersById.value.get(id)?.label).filter(Boolean) as string[];
  const prev = step.preview?.assignees;
  step.preview = { ...(step.preview || {}), assignees: names };
  try {
    const res = await $fetch<{ assignees: string[] }>(`/api/ai/actions/${step.id}/assignees`, { method: 'POST', body: { userIds } });
    step.preview = { ...(step.preview || {}), assignees: res.assignees };
  } catch (err: any) {
    step.preview = { ...(step.preview || {}), assignees: prev };
    toast.add({ title: 'Could not update assignees', description: err?.data?.message || 'Please try again.', icon: 'i-lucide-alert-circle', color: 'red' });
  }
}

async function askEarnest(seed?: string) {
  const question = (seed ?? qaInput.value).trim();
  if (!question || qaLoading.value) return;
  const priorHistory = qaThread.value.map((m) => ({ role: m.role, text: m.text }));
  // Live: don't push locally — the shared thread echoes both turns to everyone.
  if (!liveActive.value) qaThread.value.push({ role: 'user', text: question });
  qaInput.value = '';
  qaLoading.value = true;
  try {
    const body: Record<string, any> = {
      organizationId: selectedOrg.value,
      question,
      history: priorHistory,
      // Drift-proof grounding: send what's on screen alongside the lookup keys.
      context: { intro: outlineIntro.value, finance: finance.value, opportunity: opportunity.value, clientRating: clientRating.value },
    };
    if (activeSubject.value) body.subject = activeSubject.value;
    if (topicInput.value.trim()) body.topic = topicInput.value.trim();
    if (planId.value) body.planId = planId.value;
    // Slide-aware: tell Earnest which slide the user is on so "this" resolves.
    if (showSlides.value && slideContext.value) body.viewing = slideContext.value;
    if (scope.value?.mode === 'entity' && scope.value.entityType && scope.value.entityId) {
      body.entityType = scope.value.entityType;
      body.entityId = scope.value.entityId;
    }
    const res = await $fetch<{ answer: string }>('/api/ai/director/ask', { method: 'POST', body });
    const answer = res.answer || 'I don’t have a clear answer for that right now.';
    // Live: persist the exchange to the shared thread (echoes to all attendees);
    // solo: append locally as before.
    if (liveActive.value) await postQa(question, answer);
    else qaThread.value.push({ role: 'assistant', text: answer });
  } catch (err: any) {
    toast.add({ title: 'Could not get an answer', description: err?.data?.message || 'Please try again.', icon: 'i-lucide-alert-circle', color: 'red' });
  } finally {
    qaLoading.value = false;
  }
}

function labelForType(t: string): string {
  return { create_tasks: 'Tasks', update_field: 'Update', send_email: 'Email', reschedule_project: 'Reschedule' }[t] || t;
}

// A friendly lucide glyph per action type — gives step chips a face, not just text.
function iconForType(t: string): string {
  return {
    create_tasks: 'i-lucide-list-plus',
    update_field: 'i-lucide-pencil',
    send_email: 'i-lucide-mail',
    reschedule_project: 'i-lucide-calendar-clock',
  }[t] || 'i-lucide-sparkles';
}

// Pick an evocative icon for each agenda subject so the board packet reads at a glance.
function iconForSubject(g: AgendaGroup): string {
  const hay = `${g.subject} ${g.label}`.toLowerCase();
  if (g.subject === 'money' || /financ|revenue|invoice|cash|budget|payment/.test(hay)) return 'i-lucide-banknote';
  if (/client|account|customer/.test(hay)) return 'i-lucide-user-round';
  if (/project/.test(hay)) return 'i-lucide-folder-kanban';
  if (/task|to-?do/.test(hay)) return 'i-lucide-list-checks';
  if (/meeting|event|calendar|schedul/.test(hay)) return 'i-lucide-calendar-clock';
  if (/lead|pipeline|deal|opportun/.test(hay)) return 'i-lucide-trending-up';
  if (/proposal|quote|estimate|contract|document/.test(hay)) return 'i-lucide-file-text';
  if (/email|message|inbox/.test(hay)) return 'i-lucide-mail';
  if (/ticket|support|issue/.test(hay)) return 'i-lucide-ticket';
  if (/content|social|post|campaign/.test(hay)) return 'i-lucide-megaphone';
  return 'i-lucide-sparkles';
}

// Priority → dot tint, for a small status pip alongside the label.
function priorityDot(p: Priority): string {
  return { urgent: 'bg-destructive', high: 'bg-warning', medium: 'bg-info', low: 'bg-muted-foreground/50' }[p];
}

// Assemble the current meeting into a minutes snapshot and persist it. The
// server generates the AI summary + rollup. Returns the saved id (or null).
async function recordMeetingMinutes(): Promise<string | null> {
  if (!selectedOrg.value || recordingMinutes.value) return null;
  recordingMinutes.value = true;
  try {
    const s = scope.value;
    const res = await recordMinutes({
      organizationId: selectedOrg.value,
      sessionId: liveActive.value ? (liveSession.value?.id ?? null) : null,
      title: activeSubject.value ? recentLabelForSubject(activeSubject.value) : (s?.label || 'Working session'),
      scopeType: s?.mode === 'entity' ? (s.entityType === 'user' ? 'mine' : 'entity') : 'org',
      entityType: s?.mode === 'entity' ? (s.entityType ?? null) : null,
      entityId: s?.mode === 'entity' ? (s.entityId ?? null) : null,
      subject: activeSubject.value || null,
      topic: topicInput.value.trim() || null,
      planId: planId.value || null,
      intro: planIntro.value || null,
      points: slidePoints.value.length ? slidePoints.value : null,
      finance: finance.value,
      opportunity: opportunity.value,
      clientRating: clientRating.value,
      steps: steps.value.map((st) => ({ id: st.id, action_type: st.action_type, title: st.title, preview: st.preview, status: st.status })),
      captured: capturedItems.value.slice(),
      qa: qaThread.value.map((t) => ({ role: t.role, text: t.text })),
    });
    if (res?.id) {
      savedMinutesId.value = res.id;
      return res.id;
    }
    return null;
  } finally {
    recordingMinutes.value = false;
  }
}

// "Record & share" — save the minutes, then open the teammate picker to fan out
// a share-for-review notification. If already saved this session, just re-open
// the picker rather than minting a duplicate record.
async function recordAndShare() {
  const id = savedMinutesId.value || (await recordMeetingMinutes());
  if (!id) return;
  showShareMinutes.value = true;
}

async function onShareMinutes(userIds: string[]) {
  const id = savedMinutesId.value;
  showShareMinutes.value = false;
  if (!id || !userIds.length) return;
  const n = await shareMinutes(id, userIds);
  if (n > 0) {
    toast.add({
      title: `Shared with ${n} ${n === 1 ? 'teammate' : 'teammates'}`,
      description: 'They’ll get a notification with the recap to review.',
      icon: 'i-lucide-send',
      color: 'green',
    });
  }
}

function onClose() {
  // Only refetch the page behind us if the meeting actually changed data.
  if (mutated.value) refreshNuxtData();
  mutated.value = false;
  close();
}

// Load the agenda + recent meetings each time the office opens.
watch(isOpen, (open) => {
  if (open) {
    meetingStartedAt.value = new Date();
    // Fresh meeting → fresh minutes snapshot.
    capturedItems.value = [];
    savedMinutesId.value = null;
    loadAgenda(); loadRecent(); fetchFilteredUsers();
  }
});
onKeyStroke('Escape', () => { if (isOpen.value) onClose(); });

// ── Liquid entrance (GSAP) ───────────────────────────────────────────────────
// The old flat opacity fade read "old". Now the scrim washes in while the panel
// rises and settles out of a soft blur with a spring — the same living language
// as Earnest's presence. IMPORTANT: transform/filter on `.director-office`
// create a containing block that would trap the full-screen (position: fixed)
// slides deck living inside it, so we clearProps the instant the entrance
// settles, leaving the panel with no lingering inline transform/filter.
const reduceMotionDO = import.meta.client && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function onEnter(el: Element, done: () => void) {
  const scrim = el as HTMLElement;
  const panel = scrim.querySelector('.director-office') as HTMLElement | null;
  if (reduceMotionDO || !panel) { gsap.set(scrim, { opacity: 1 }); done(); return; }
  gsap.set(scrim, { opacity: 0 });
  gsap.set(panel, { opacity: 0, scale: 0.94, yPercent: 3, filter: 'blur(12px)', transformOrigin: '50% 34%', willChange: 'transform, filter' });
  gsap.timeline({ onComplete: () => { gsap.set(panel, { clearProps: 'transform,filter,opacity,willChange,transformOrigin' }); done(); } })
    .to(scrim, { opacity: 1, duration: 0.32, ease: 'power2.out' }, 0)
    .to(panel, { opacity: 1, scale: 1, yPercent: 0, filter: 'blur(0px)', duration: 0.62, ease: 'power3.out' }, 0.03);
}
function onLeave(el: Element, done: () => void) {
  const scrim = el as HTMLElement;
  const panel = scrim.querySelector('.director-office') as HTMLElement | null;
  if (reduceMotionDO || !panel) { gsap.to(scrim, { opacity: 0, duration: 0.2, onComplete: done }); return; }
  gsap.set(panel, { willChange: 'transform, filter' });
  gsap.timeline({ onComplete: done })
    .to(panel, { opacity: 0, scale: 0.965, yPercent: 1.5, filter: 'blur(8px)', duration: 0.3, ease: 'power2.in' }, 0)
    .to(scrim, { opacity: 0, duration: 0.3, ease: 'power2.in' }, 0.04);
}

// ── Living aura behind the boardroom (the shared presence language) ──────────
// A subtle version of Earnest's Focus aura, calmly present, gathering to a warm
// amber "think" while Earnest is reviewing the business or drafting the plan.
const doPresence = useEarnestPresence({ initial: 'present' });
const doMood = computed<EarnestMood>(() => (loadingAgenda.value || planning.value) ? 'think' : 'present');
watch(doMood, (m) => doPresence.setMood(m), { immediate: true });

// ── Stagger reveal (GSAP) ────────────────────────────────────────────────────
// A per-item rise-in so cards + seats flow into place instead of snapping. The
// `.fade` modifier is opacity-only for transform-positioned nodes (the table
// seats center via translateX — never clear their transform). transition:none
// during the tween stops the cards' CSS `transition-all` from double-animating.
const vReveal = {
  mounted(el: HTMLElement, binding: { value?: number; modifiers: Record<string, boolean> }) {
    if (reduceMotionDO) return;
    const i = typeof binding.value === 'number' ? binding.value : 0;
    const fadeOnly = !!binding.modifiers.fade;
    const prevTransition = el.style.transition;
    el.style.transition = 'none';
    gsap.from(el, {
      opacity: 0,
      ...(fadeOnly ? {} : { y: 14 }),
      duration: fadeOnly ? 0.6 : 0.5,
      delay: Math.min(i, 8) * 0.055,
      ease: 'power2.out',
      onComplete() {
        el.style.transition = prevTransition;
        gsap.set(el, { clearProps: fadeOnly ? 'opacity' : 'transform,opacity' });
      },
    });
  },
};
</script>

<template>
  <Teleport to="body">
    <Transition :css="false" @enter="onEnter" @leave="onLeave">
      <div
        v-if="isOpen"
        class="dark director-canvas fixed inset-0 z-[80] flex justify-center overflow-hidden"
        @click.self="onClose"
      >
        <!-- Living aura — the immersive backdrop (pointer-events:none) -->
        <EarnestAura :presence="doPresence" class="director-aura" />
        <section class="director-office director-scroll relative z-[3] flex flex-col h-full w-full max-w-3xl mx-auto px-4 sm:px-8 text-foreground overflow-y-auto">
          <!-- Boardroom header — scrolls with the content -->
          <header class="relative flex items-start justify-between gap-3 pt-5 pb-3 shrink-0">
            <div class="relative flex items-center gap-3 min-w-0">
              <div class="w-10 h-10 rounded-full bg-muted ring-1 ring-border flex items-center justify-center shrink-0">
                <DirectorChairIcon class="w-6 h-6" />
              </div>
              <div class="min-w-0">
                <h2 class="text-base font-semibold leading-tight flex items-center gap-1.5">
                  The Boardroom
                  <TooltipProvider :delay-duration="150">
                    <Tooltip>
                      <TooltipTrigger as-child>
                        <span class="inline-flex cursor-help"><UIcon name="i-lucide-info" class="w-3.5 h-3.5 text-muted-foreground hover:text-foreground transition-colors shrink-0" /></span>
                      </TooltipTrigger>
                      <TooltipContent :side-offset="6" class="z-[95] max-w-xs">
                        Earnest convened the board on {{ scopeLabel }} and drafted the work below — you approve each step; nothing runs on its own.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </h2>
                <p class="text-xs text-muted-foreground truncate">Approve each step — nothing runs on its own.</p>
              </div>
            </div>
            <div class="relative flex items-center gap-1.5 shrink-0">
              <!-- Collaboration: go live, or the live table controls -->
              <template v-if="!liveActive">
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors disabled:opacity-50"
                  title="Convene a live meeting others can join"
                  :disabled="liveConnecting"
                  @click="openGoLive"
                >
                  <UIcon :name="liveConnecting ? 'i-lucide-loader-2' : 'i-lucide-radio'" class="w-3.5 h-3.5" :class="liveConnecting ? 'animate-spin' : ''" />
                  <span class="hidden sm:inline">Go live</span>
                </button>
              </template>
              <template v-else>
                <span class="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">
                  <span class="relative flex w-1.5 h-1.5">
                    <span class="absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75 animate-ping" />
                    <span class="relative inline-flex rounded-full w-1.5 h-1.5 bg-destructive" />
                  </span>
                  Live
                </span>
                <!-- Who's at the table (present now) -->
                <div class="hidden sm:flex items-center -space-x-1.5">
                  <img
                    v-for="p in livePresentNow.slice(0, 4)"
                    :key="p.id"
                    :src="avatarFor(p)"
                    :alt="p.name"
                    :title="p.name + (p.role === 'host' ? ' · host' : '')"
                    class="w-6 h-6 rounded-full ring-2 ring-card object-cover"
                  />
                  <span v-if="livePresentNow.length > 4" class="w-6 h-6 rounded-full ring-2 ring-card bg-muted text-[9px] font-semibold flex items-center justify-center">+{{ livePresentNow.length - 4 }}</span>
                </div>
                <button
                  type="button"
                  class="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/15 transition-colors"
                  title="Invite teammates to the table"
                  @click="showInvite = true"
                >
                  <UIcon name="i-lucide-user-plus" class="w-3.5 h-3.5" />
                  <span class="hidden sm:inline">Invite</span>
                </button>
                <button
                  type="button"
                  class="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors"
                  :title="liveIsHost ? 'End the meeting for everyone' : 'Leave the meeting'"
                  @click="onLeaveMeeting"
                >
                  <UIcon :name="liveIsHost ? 'i-lucide-square' : 'i-lucide-log-out'" class="w-3.5 h-3.5" />
                  <span class="hidden sm:inline">{{ liveIsHost ? 'End' : 'Leave' }}</span>
                </button>
              </template>
              <NuxtLink
                to="/boardroom"
                class="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                title="Past meetings — open the Boardroom history"
                @click="onClose"
              >
                <UIcon name="i-lucide-history" class="w-3.5 h-3.5" /> Past meetings
              </NuxtLink>
              <button
                type="button"
                class="text-muted-foreground hover:text-foreground p-1 disabled:opacity-40"
                aria-label="Refresh the agenda"
                title="Refresh — re-review the business"
                :disabled="loadingAgenda"
                @click="loadAgenda(true)"
              >
                <UIcon name="i-lucide-refresh-cw" class="w-4 h-4" :class="loadingAgenda ? 'animate-spin' : ''" />
              </button>
              <button type="button" class="text-muted-foreground hover:text-foreground p-1" aria-label="Close" @click="onClose">
                <UIcon name="i-lucide-x" class="w-5 h-5" />
              </button>
            </div>
          </header>

          <div class="space-y-5 py-3">
            <!-- Live: who's at the table -->
            <div v-if="liveActive" class="flex items-center gap-2.5 flex-wrap rounded-2xl border border-primary/20 bg-primary/5 px-3.5 py-2.5">
              <UIcon name="i-lucide-users-round" class="w-4 h-4 text-primary shrink-0" />
              <div class="flex items-center -space-x-1.5">
                <img
                  v-for="p in liveAttendees"
                  :key="p.id"
                  :src="avatarFor(p)"
                  :alt="p.name"
                  :title="p.name + (p.role === 'host' ? ' · host' : '') + (p.status === 'invited' ? ' · invited' : '')"
                  class="w-7 h-7 rounded-full ring-2 ring-card object-cover"
                  :class="p.status === 'invited' ? 'opacity-50' : ''"
                />
              </div>
              <span class="text-xs text-muted-foreground">
                {{ livePresentNow.length }} here<template v-if="liveAttendees.length > livePresentNow.length"> · {{ liveAttendees.length - livePresentNow.length }} invited</template>
              </span>
              <div class="ml-auto flex items-center gap-2">
                <!-- Host-only: lock participation to view-only -->
                <button
                  v-if="liveIsHost"
                  type="button"
                  class="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full transition-colors"
                  :class="liveSession?.viewOnly ? 'bg-warning/15 text-warning' : 'text-muted-foreground hover:text-foreground'"
                  :title="liveSession?.viewOnly ? 'View-only is on — only you (presenter) can approve. Click to unlock.' : 'Lock participation — only the presenter can approve'"
                  @click="setViewOnly(!liveSession?.viewOnly)"
                >
                  <UIcon :name="liveSession?.viewOnly ? 'i-lucide-lock' : 'i-lucide-lock-open'" class="w-3 h-3" />
                  {{ liveSession?.viewOnly ? 'View-only' : 'Open' }}
                </button>
                <span v-if="liveIsPresenter" class="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-primary font-medium">
                  <UIcon name="i-lucide-presentation" class="w-3 h-3" /> You're presenting
                </span>
                <template v-else>
                  <span v-if="liveIsFollowing" class="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <UIcon name="i-lucide-eye" class="w-3 h-3" /> Following presenter
                  </span>
                  <!-- Take the deck (blocked in view-only meetings) -->
                  <button
                    v-if="!liveSession?.viewOnly"
                    type="button"
                    class="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors"
                    title="Take over presenting"
                    @click="takePresenter()"
                  >
                    <UIcon name="i-lucide-presentation" class="w-3 h-3" /> Present
                  </button>
                </template>
              </div>
            </div>

            <!-- Agenda loading / error -->
            <div v-if="loadingAgenda" class="flex flex-col items-center justify-center gap-3 py-10 text-center">
              <span class="relative flex items-center justify-center w-12 h-12">
                <span class="absolute inset-0 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                <EarnestIcon class="w-5 h-5 text-primary" />
              </span>
              <p class="text-sm text-muted-foreground">Convening the board — reviewing the business…</p>
            </div>
            <div v-else-if="agendaError" class="flex items-center gap-2 text-sm text-destructive py-4">
              <UIcon name="i-lucide-alert-triangle" class="w-4 h-4 shrink-0" /> {{ agendaError }}
            </div>

            <template v-else-if="agenda">
              <!-- Empty agenda -->
              <div v-if="agenda.groups.length === 0" class="text-center py-10">
                <div class="relative mx-auto mb-3 w-16 h-16">
                  <svg class="w-full h-full text-success" viewBox="0 0 64 64" fill="none" aria-hidden="true">
                    <circle cx="32" cy="32" r="26" stroke="currentColor" stroke-width="2" stroke-opacity="0.25" />
                    <circle cx="32" cy="32" r="19" fill="currentColor" fill-opacity="0.12" />
                    <path d="M23 32.5l6 6 12-13" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                  <UIcon name="i-lucide-sparkles" class="absolute -top-1 -right-1 w-4 h-4 text-warning" />
                  <UIcon name="i-lucide-sparkle" class="absolute bottom-0 -left-1 w-3 h-3 text-primary/60" />
                </div>
                <p class="text-sm font-medium text-foreground">All clear — nothing pressing on the agenda.</p>
                <p class="text-xs text-muted-foreground">Earnest found no open issues for {{ scopeLabel }} right now.</p>
              </div>

              <!-- Agenda: boardroom table (default) or card outline -->
              <div v-else>
                <div class="flex items-end justify-between mb-2 gap-2">
                  <div class="min-w-0">
                    <!-- Back out of a focused department — app-standard back link.
                         A grid-rows collapse takes ZERO space when unfocused (no
                         gap) and expands smoothly when a department is focused, so
                         it neither leaves a gap nor jumps the header. The mb-3 on
                         the button gives it room as its own element above the
                         title (and collapses with it). -->
                    <div class="grid transition-[grid-template-rows] duration-300 ease-out" :style="{ gridTemplateRows: activeSubject ? '1fr' : '0fr' }">
                      <div class="overflow-hidden transition-opacity duration-200" :class="activeSubject ? 'opacity-100' : 'opacity-0'">
                        <button
                          type="button"
                          data-no-press
                          :tabindex="activeSubject ? 0 : -1"
                          :aria-hidden="!activeSubject"
                          class="inline-flex items-center gap-0.5 mb-3 text-[10px] uppercase tracking-wider font-medium leading-none text-muted-foreground hover:text-foreground transition-colors"
                          @click="backToBoard"
                        >
                          <UIcon name="i-lucide-chevron-left" class="w-3 h-3" /> {{ backLabel }}
                        </button>
                      </div>
                    </div>
                    <p class="text-[11px] uppercase tracking-wider font-semibold text-foreground leading-none">
                      Board meeting<span v-if="meetingLabel" class="font-normal text-muted-foreground">&nbsp;· {{ meetingLabel }}</span>
                    </p>
                    <p class="text-[10px] uppercase tracking-wider text-muted-foreground truncate mt-0.5">Focused on <span class="font-semibold text-foreground">{{ focusLabel }}</span></p>
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    <div class="inline-flex items-center gap-0.5 p-0.5 rounded-full bg-muted">
                      <button type="button" class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors" :class="agendaLayout === 'arc' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'" @click="agendaLayout = 'arc'">
                        <UIcon name="i-lucide-users-round" class="w-3.5 h-3.5" /> Board
                      </button>
                      <button type="button" class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors" :class="agendaLayout === 'cards' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'" @click="agendaLayout = 'cards'">
                        <UIcon name="i-lucide-list" class="w-3.5 h-3.5" /> Agenda
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Meeting tags — for future reference -->
                <div class="flex items-center flex-wrap gap-1.5 mb-2">
                  <span
                    v-for="tag in meetingTags"
                    :key="tag"
                    class="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                  >
                    #{{ tag }}
                    <button type="button" class="hover:text-foreground" aria-label="Remove tag" @click="removeTag(tag)">
                      <UIcon name="i-lucide-x" class="w-3 h-3" />
                    </button>
                  </span>
                  <TooltipProvider v-if="!tagOpen" :delay-duration="150">
                    <Tooltip>
                      <TooltipTrigger as-child>
                        <button
                          type="button"
                          class="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                          @click="openTag"
                        >
                          <UIcon name="i-lucide-tag" class="w-3 h-3" /> Add tag
                        </button>
                      </TooltipTrigger>
                      <TooltipContent :side-offset="6" class="z-[95] max-w-xs">
                        Label this meeting (e.g. “weekly”, “Q3-planning”) so you can find it again in Past meetings.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <input
                    v-else
                    ref="tagInputEl"
                    v-model="tagInput"
                    type="text"
                    placeholder="tag…"
                    class="w-28 text-[11px] rounded-full border border-border bg-background px-2.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary/30"
                    @keydown.enter="addTag"
                    @keydown.escape="tagOpen = false"
                    @blur="tagOpen = false"
                  />
                </div>

                <!-- Immersive board — departments fanned in a half-circle around
                     the Director (you), no table. Each seat is a department; click
                     to convene on just that subject. Live teammates cluster around
                     your chair; the presenter's subject pulses. -->
                <div v-if="agendaLayout === 'arc'" class="relative mx-auto w-full max-w-[620px]" :style="{ height: ARC_H + 'px' }">
                  <svg v-reveal.fade="0" class="absolute inset-0 w-full h-full pointer-events-none" :viewBox="`0 0 100 ${ARC_H}`" preserveAspectRatio="none" aria-hidden="true">
                    <line
                      v-for="s in arcSeats" :key="s.g.subject"
                      :x1="s.xPct" :y1="s.yPx" :x2="DIRECTOR_POS.xPct" :y2="DIRECTOR_POS.yPx"
                      :stroke="s.accent"
                      :stroke-opacity="activeSubject === s.g.subject ? 0.7 : (activeSubject ? 0.06 : 0.16)"
                      stroke-width="1.5" stroke-dasharray="4 6" stroke-linecap="round" vector-effect="non-scaling-stroke"
                    />
                  </svg>
                  <button
                    v-for="(s, i) in arcSeats" :key="s.g.subject"
                    v-reveal.fade="i"
                    type="button" class="do-seat" data-no-press
                    :style="{ left: s.left, top: s.top, '--seat-accent': s.accent }"
                    :data-dim="activeSubject && activeSubject !== s.g.subject ? 'true' : 'false'"
                    :data-active="activeSubject === s.g.subject ? 'true' : 'false'"
                    :data-presenting="presentingSubject === s.g.subject ? 'true' : 'false'"
                    @click="draftPlan(s.g.subject)"
                  >
                    <span class="do-seat__chip">
                      <UIcon :name="iconForSubject(s.g)" class="w-6 h-6" />
                      <span v-if="s.g.notices.length" class="do-seat__badge">{{ s.g.notices.length }}</span>
                      <img v-if="presentingSubject === s.g.subject && presenterAvatar" :src="presenterAvatar.src" :alt="presenterAvatar.name" :title="`${presenterAvatar.name} is presenting`" class="do-seat__presenter" />
                    </span>
                    <span class="do-seat__label">{{ s.g.label }}</span>
                    <span class="do-seat__pri">{{ s.g.topPriority }}</span>
                  </button>
                  <div class="do-director" v-reveal.fade="arcSeats.length" :style="{ left: DIRECTOR_POS.xPct + '%', top: DIRECTOR_POS.yPx + 'px' }">
                    <span class="do-director__chair"><DirectorChairIcon class="w-8 h-8" /></span>
                    <span class="do-director__label">{{ directorName }}</span>
                    <div v-if="otherAttendees.length" class="do-attendees">
                      <img v-for="p in otherAttendees.slice(0, 5)" :key="p.id" :src="avatarFor(p)" :alt="p.name" :title="p.name" class="do-att" />
                    </div>
                  </div>
                </div>

                <!-- Legacy boardroom table (retained, never rendered — agendaView is 'outline') -->
                <div
                  v-if="agendaView === 'table'"
                  class="hidden sm:block relative mx-auto w-full max-w-[600px] mb-1"
                  style="height: 208px"
                >
                  <div class="absolute left-1/2 -translate-x-1/2 bottom-12 w-[66%] h-[74px] rounded-[50%] bg-muted/40 border border-border" />

                  <!-- Presence line — from the presenting member to the Director -->
                  <Transition name="line-fade">
                    <svg
                      v-if="activeSeatLine"
                      class="absolute inset-0 w-full h-full pointer-events-none"
                      viewBox="0 0 600 208"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                    >
                      <line
                        :x1="activeSeatLine.x1"
                        :y1="activeSeatLine.y1"
                        :x2="activeSeatLine.x2"
                        :y2="activeSeatLine.y2"
                        :stroke="activeSeatLine.accent"
                        stroke-width="2"
                        stroke-dasharray="5 6"
                        stroke-linecap="round"
                        vector-effect="non-scaling-stroke"
                        class="director-presence-line"
                      />
                    </svg>
                  </Transition>

                  <button
                    v-for="(seat, idx) in agendaSeats"
                    :key="seat.g.subject"
                    v-reveal.fade="idx"
                    type="button"
                    class="group absolute -translate-x-1/2 flex flex-col items-center gap-1.5 w-[92px]"
                    :style="{ left: seat.left, top: seat.top }"
                    @click="draftPlan(seat.g.subject)"
                  >
                    <span class="flex items-center gap-1 max-w-full">
                      <span class="text-[10px] font-semibold uppercase tracking-wider leading-tight text-center line-clamp-2 text-foreground">{{ seat.g.label }}</span>
                      <span class="text-[9px] font-semibold px-1.5 py-px rounded-full leading-none shrink-0" :class="priorityClass(seat.g.topPriority)">{{ seat.g.notices.length }}</span>
                    </span>
                    <span
                      class="w-11 h-11 rounded-full ring-1 flex items-center justify-center transition-transform group-hover:-translate-y-0.5"
                      :class="activeSubject === seat.g.subject ? 'bg-background ring-primary/50 shadow-md' : 'bg-muted/50 ring-border shadow-sm'"
                    >
                      <DirectorChairIcon class="w-5 h-5" :style="{ color: seat.accent }" />
                    </span>
                    <!-- Hover: subject icon + label + count -->
                    <span class="opacity-0 group-hover:opacity-100 transition-opacity absolute -bottom-6 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 whitespace-nowrap text-[10px] font-medium px-2 py-0.5 rounded-full bg-card border border-border shadow-sm">
                      <UIcon :name="iconForSubject(seat.g)" class="w-3 h-3" />
                      {{ seat.g.label }} · {{ seat.g.notices.length }}
                    </span>
                  </button>

                  <!-- The head of the table — the Director (you), flanked in a
                       live meeting by the human guests actually in the room. -->
                  <div class="absolute left-1/2 -translate-x-1/2 bottom-0 z-10 flex items-end gap-1.5" title="You — the Director">
                    <!-- Guests on the left -->
                    <div v-if="liveActive" class="flex items-end gap-1 mb-1.5">
                      <span
                        v-for="p in leftGuests"
                        :key="p.id"
                        class="relative"
                        :title="p.name + (String(p.userId) === String(liveSession?.presenterId) ? ' · presenting' : '')"
                      >
                        <img
                          :src="avatarFor(p)"
                          :alt="p.name"
                          class="w-8 h-8 rounded-full object-cover ring-2"
                          :class="String(p.userId) === String(liveSession?.presenterId) ? 'ring-primary' : 'ring-card'"
                        />
                        <span v-if="String(p.userId) === String(liveSession?.presenterId)" class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                          <UIcon name="i-lucide-presentation" class="w-2 h-2" />
                        </span>
                      </span>
                    </div>

                    <div class="flex flex-col items-center">
                      <DirectorChairIcon class="w-16 h-16 drop-shadow-sm" />
                      <span class="mt-0.5 text-[11px] font-semibold uppercase tracking-wide leading-none text-foreground">{{ directorName }}</span>
                      <span class="mt-0.5 text-[9px] uppercase tracking-[0.14em] text-muted-foreground leading-none whitespace-nowrap">{{ directorTitle }}<template v-if="orgName"> @ {{ orgName }}</template></span>
                    </div>

                    <!-- Guests on the right -->
                    <div v-if="liveActive" class="flex items-end gap-1 mb-1.5">
                      <span
                        v-for="p in rightGuests"
                        :key="p.id"
                        class="relative"
                        :title="p.name + (String(p.userId) === String(liveSession?.presenterId) ? ' · presenting' : '')"
                      >
                        <img
                          :src="avatarFor(p)"
                          :alt="p.name"
                          class="w-8 h-8 rounded-full object-cover ring-2"
                          :class="String(p.userId) === String(liveSession?.presenterId) ? 'ring-primary' : 'ring-card'"
                        />
                        <span v-if="String(p.userId) === String(liveSession?.presenterId)" class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                          <UIcon name="i-lucide-presentation" class="w-2 h-2" />
                        </span>
                      </span>
                    </div>
                  </div>
                </div>

                <!-- Detail agenda cards (the "Agenda" view option) -->
                <div v-if="agendaLayout === 'cards'" class="grid gap-2 sm:grid-cols-2">
                  <button
                    v-for="(g, i) in visibleAgendaGroups"
                    :key="g.subject"
                    v-reveal="i"
                    type="button"
                    class="do-spring group text-left rounded-2xl border p-3 transition-all hover:border-primary/40 hover:shadow-sm hover:-translate-y-0.5"
                    :class="activeSubject === g.subject ? 'border-primary/60 bg-primary/5' : 'border-border bg-background'"
                    @click="draftPlan(g.subject)"
                  >
                    <div class="flex items-start gap-2.5">
                      <span
                        class="mt-0.5 w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors"
                        :class="activeSubject === g.subject ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'"
                      >
                        <UIcon :name="iconForSubject(g)" class="w-4 h-4" />
                      </span>
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center justify-between gap-2 mb-0.5">
                          <span class="text-sm font-medium uppercase tracking-wide truncate">{{ g.label }}</span>
                          <span class="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full font-medium shrink-0" :class="priorityClass(g.topPriority)">
                            <span class="w-1.5 h-1.5 rounded-full" :class="priorityDot(g.topPriority)" />
                            {{ g.topPriority }}
                          </span>
                        </div>
                        <p class="text-xs text-muted-foreground">
                          <template v-if="g.subject === 'money'">
                            Financial review — income, expenses &amp; forecast<template v-if="g.notices.length">, {{ g.notices.length }} flag{{ g.notices.length === 1 ? '' : 's' }}</template>
                          </template>
                          <template v-else>
                            {{ g.notices.length }} item{{ g.notices.length === 1 ? '' : 's' }} needing attention
                          </template>
                        </p>
                      </div>
                    </div>
                  </button>
                </div>

                <!-- Raise a topic — collapsed to a pill, expands to the input on click -->
                <div class="mt-3">
                  <button
                    v-if="!topicOpen"
                    type="button"
                    class="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                    @click="openTopic"
                  >
                    <UIcon name="i-lucide-message-circle" class="w-3.5 h-3.5" />
                    Raise a topic
                  </button>
                  <Transition name="topic-expand">
                    <div v-if="topicOpen" class="flex items-center gap-2">
                      <input
                        ref="topicInputEl"
                        v-model="topicInput"
                        type="text"
                        placeholder="Raise a topic — e.g. “Are we on track to hit Q3 revenue?”"
                        class="flex-1 rounded-full border border-border bg-background px-3.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        @keydown.enter="raiseTopic"
                        @keydown.escape="topicOpen = false"
                      />
                      <button
                        type="button"
                        class="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-foreground text-background disabled:opacity-50 shrink-0"
                        :disabled="!topicInput.trim() || planning"
                        @click="raiseTopic"
                      >
                        <UIcon name="i-lucide-message-circle" class="w-3.5 h-3.5" />
                        Discuss
                        <AiSpendMark muted />
                      </button>
                      <button
                        type="button"
                        class="text-muted-foreground hover:text-foreground p-1 shrink-0"
                        aria-label="Collapse"
                        @click="topicOpen = false"
                      >
                        <UIcon name="i-lucide-x" class="w-4 h-4" />
                      </button>
                    </div>
                  </Transition>
                </div>
              </div>

              <!-- Recent meetings moved out of the overlay → the "Past meetings"
                   link in the header opens the Director's Office page. -->

              <!-- Active meeting: plan / analysis for the chosen subject or topic -->
              <div v-if="meetingActive" class="rounded-2xl border border-border bg-background p-4 space-y-3">
                <div class="flex items-center gap-2">
                  <EarnestIcon class="w-4 h-4 text-primary" />
                  <span class="text-sm font-medium">{{ clientRating ? 'Client rating review' : finance ? 'Financial briefing' : 'Proposed plan' }}</span>
                  <span v-if="planning" class="text-xs text-muted-foreground flex items-center gap-1">
                    <UIcon name="i-lucide-loader-2" class="w-3.5 h-3.5 animate-spin" /> {{ (finance || clientRating) ? 'analyzing…' : 'drafting…' }}
                  </span>
                  <div v-else-if="activeSubject !== null" class="ml-auto flex items-center gap-2 shrink-0">
                    <span v-if="briefingSavedAt" class="text-[11px] text-muted-foreground inline-flex items-center gap-1" :title="`Earnest saved this briefing ${savedAgo}`">
                      <UIcon name="i-lucide-bookmark-check" class="w-3 h-3" /> Saved {{ savedAgo }}
                    </span>
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                      title="Draft a fresh plan for this section — asks Earnest anew, so it spends tokens"
                      @click="draftPlan(activeSubject || '', true)"
                    >
                      <UIcon name="i-lucide-refresh-cw" class="w-3 h-3" /> Re-draft
                      <AiSpendMark muted />
                    </button>
                  </div>
                </div>

                <!-- Outline / Slides view toggle -->
                <div v-if="!planning && hasBriefing" class="flex justify-center">
                  <div class="inline-flex items-center gap-0.5 p-0.5 rounded-full bg-muted">
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors"
                      :class="viewMode === 'outline' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
                      @click="viewMode = 'outline'"
                    >
                      <UIcon name="i-lucide-list" class="w-3.5 h-3.5" /> Outline
                    </button>
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors"
                      :class="viewMode === 'slides' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
                      @click="viewMode = 'slides'"
                    >
                      <UIcon name="i-lucide-gallery-horizontal-end" class="w-3.5 h-3.5" /> Slides
                    </button>
                  </div>
                </div>

                <!-- Presentation (slide) view -->
                <CommandCenterDirectorSlides
                  v-if="showSlides"
                  :subject="activeSubject"
                  :scope-label="scopeLabel"
                  :intro="outlineIntro"
                  :points="slidePoints"
                  :finance="finance"
                  :opportunity="opportunity"
                  :client-rating="clientRating"
                  :steps="steps"
                  :follow="liveIsFollowing"
                  :sync-index="liveActive ? (liveSession?.currentSlide ?? null) : null"
                  :can-decide="!liveActive || liveCanDecide"
                  :users="assignableUsers"
                  :can-capture="!liveActive || liveCanDecide"
                  @approve="approveStep"
                  @skip="skipStep"
                  @capture="captureActionItem"
                  @assign="reassignStep"
                  @slide="slideContext = $event"
                  @index="onSlideIndex"
                />

                <!-- Outline (stacked panel) view -->
                <template v-else>
                <!-- Client review: rating badge + value / effort / health -->
                <div v-if="clientRating" class="rounded-xl border border-border p-3">
                  <div class="flex items-center gap-3 mb-2">
                    <span class="w-9 h-9 rounded-full flex items-center justify-center text-base font-bold" :class="ratingClass(clientRating.rating)">{{ clientRating.rating }}</span>
                    <div class="min-w-0">
                      <p class="text-sm font-medium truncate">{{ clientRating.clientName }}</p>
                      <p class="text-[11px] text-muted-foreground">Earnest's rating for this account</p>
                    </div>
                  </div>
                  <div class="grid grid-cols-3 gap-2 text-center">
                    <div class="rounded-lg bg-muted/40 p-2">
                      <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Value</p>
                      <p class="text-sm font-semibold">{{ fmtMoney(clientRating.value.revenue) }}</p>
                      <p class="text-[10px] text-muted-foreground">{{ clientRating.value.activeProjects }} active proj.</p>
                    </div>
                    <div class="rounded-lg bg-muted/40 p-2">
                      <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Effort</p>
                      <p class="text-sm font-semibold">{{ clientRating.effort.total }}</p>
                      <p class="text-[10px] text-muted-foreground">touch-points</p>
                    </div>
                    <div class="rounded-lg bg-muted/40 p-2">
                      <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Overdue AR</p>
                      <p class="text-sm font-semibold" :class="clientRating.health.overdueAR > 0 ? 'text-destructive' : ''">{{ fmtMoney(clientRating.health.overdueAR) }}</p>
                      <p class="text-[10px] text-muted-foreground">{{ clientRating.health.staleDays != null ? clientRating.health.staleDays + 'd since touch' : 'no activity' }}</p>
                    </div>
                  </div>
                </div>

                <!-- Money mode: metrics strip -->
                <div v-if="finance" class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div class="rounded-xl bg-muted/40 p-2.5">
                    <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Income / mo (avg)</p>
                    <p class="text-sm font-semibold">{{ fmtMoney(finance.trailing.income) }}</p>
                  </div>
                  <div class="rounded-xl bg-muted/40 p-2.5">
                    <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Expenses / mo (avg)</p>
                    <p class="text-sm font-semibold">{{ fmtMoney(finance.trailing.expenses) }}</p>
                  </div>
                  <div class="rounded-xl bg-muted/40 p-2.5">
                    <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Net / mo (avg)</p>
                    <p class="text-sm font-semibold" :class="netClass(finance.trailing.net)">{{ fmtMoney(finance.trailing.net) }}</p>
                  </div>
                  <div class="rounded-xl bg-muted/40 p-2.5">
                    <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Outstanding AR</p>
                    <p class="text-sm font-semibold">{{ fmtMoney(finance.outstanding.total) }}</p>
                    <p v-if="finance.outstanding.overdueTotal > 0" class="text-[10px] text-destructive">{{ fmtMoney(finance.outstanding.overdueTotal) }} overdue</p>
                  </div>
                  <div class="col-span-2 sm:col-span-4 rounded-xl bg-primary/5 border border-primary/20 p-2.5">
                    <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Projected next {{ finance.projection.horizonMonths }} months (run-rate)</p>
                    <p class="text-sm">
                      Income {{ fmtMoney(finance.projection.income) }} · Expenses {{ fmtMoney(finance.projection.expenses) }} ·
                      <span class="font-semibold" :class="netClass(finance.projection.net)">Net {{ fmtMoney(finance.projection.net) }}</span>
                    </p>
                  </div>
                </div>

                <!-- Money mode: opportunity strip (where the best money is) -->
                <div v-if="opportunity && (opportunity.topClients.length || opportunity.pipeline.openCount)" class="rounded-xl border border-border p-2.5 space-y-1.5">
                  <p class="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1"><UIcon name="i-lucide-trending-up" class="w-3 h-3" /> Where the money is</p>
                  <p v-if="opportunity.topClients.length" class="text-xs">
                    <span class="text-muted-foreground">Top clients:</span>
                    {{ opportunity.topClients.slice(0, 3).map((c: any) => `${c.name} ${fmtMoney(c.revenue)}`).join(' · ') }}
                  </p>
                  <p v-if="opportunity.topServiceLines.length" class="text-xs">
                    <span class="text-muted-foreground">Best lines:</span>
                    {{ opportunity.topServiceLines.slice(0, 3).map((s: any) => `${s.name} ${fmtMoney(s.revenue)}`).join(' · ') }}
                  </p>
                  <p v-if="opportunity.pipeline.openCount" class="text-xs">
                    <span class="text-muted-foreground">Pipeline:</span>
                    {{ opportunity.pipeline.openCount }} open · ~{{ fmtMoney(opportunity.pipeline.weightedValue) }} weighted
                  </p>
                </div>

                <p v-if="outlineIntro && !planning" class="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{{ outlineIntro }}</p>

                <!-- Step cards — the presenting member's proposed actions -->
                <div v-if="steps.length" class="space-y-2">
                  <div
                    v-for="(step, i) in steps"
                    :key="step.id"
                    v-reveal="i"
                    class="rounded-xl border border-border p-3"
                    :class="step.status === 'rejected' ? 'opacity-60' : ''"
                  >
                    <div class="flex items-start gap-2.5">
                      <span
                        class="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0"
                        :class="step.status === 'executed' ? 'bg-success/15 text-success' : step.status === 'failed' ? 'bg-destructive/15 text-destructive' : 'bg-primary/10 text-primary'"
                      >
                        <UIcon v-if="step.status === 'executed'" name="i-lucide-check" class="w-3 h-3" />
                        <UIcon v-else-if="step.status === 'failed'" name="i-lucide-x" class="w-3 h-3" />
                        <template v-else>{{ i + 1 }}</template>
                      </span>
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2 flex-wrap">
                          <span class="text-sm font-medium" :class="step.status === 'rejected' ? 'line-through text-muted-foreground' : ''">{{ step.title }}</span>
                          <span class="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                            <UIcon :name="iconForType(step.action_type)" class="w-3 h-3" />
                            {{ labelForType(step.action_type) }}
                          </span>
                        </div>

                        <!-- Email preview before approving a send -->
                        <div v-if="step.action_type === 'send_email' && step.preview" class="mt-1.5 text-xs text-muted-foreground space-y-0.5">
                          <p><span class="font-medium text-foreground">To:</span> {{ step.preview.to || 'contact' }}</p>
                          <p><span class="font-medium text-foreground">Subject:</span> {{ step.preview.subject }}</p>
                        </div>

                        <!-- Task assignment preview before approving -->
                        <p v-if="step.action_type === 'create_tasks' && step.preview?.assignees?.length" class="mt-1 text-xs text-muted-foreground inline-flex items-center gap-1">
                          <UIcon name="i-lucide-user-check" class="w-3.5 h-3.5" /> Assigns to {{ step.preview.assignees.join(', ') }}
                        </p>

                        <!-- Status line -->
                        <p v-if="step.status === 'executed'" class="mt-1 text-xs text-success">Approved · done</p>
                        <p v-else-if="step.status === 'rejected'" class="mt-1 text-xs text-muted-foreground">Skipped</p>
                        <p v-else-if="step.status === 'failed'" class="mt-1 text-xs text-destructive">Failed — try it manually</p>

                        <!-- Actions — hidden for view-only observers -->
                        <div v-else-if="!liveActive || liveCanDecide" class="mt-2 flex items-center gap-2">
                          <button
                            type="button"
                            class="inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                            :disabled="step.status === 'executing'"
                            @click="approveStep(step)"
                          >
                            <UIcon v-if="step.status === 'executing'" name="i-lucide-loader-2" class="w-3.5 h-3.5 animate-spin" />
                            <UIcon v-else name="i-lucide-check" class="w-3.5 h-3.5" />
                            Approve
                          </button>
                          <button
                            type="button"
                            class="text-xs px-3 py-1 rounded-full border border-border text-muted-foreground hover:text-foreground disabled:opacity-50"
                            :disabled="step.status === 'executing'"
                            @click="skipStep(step)"
                          >
                            Skip
                          </button>
                        </div>
                        <p v-else class="mt-2 text-xs text-muted-foreground inline-flex items-center gap-1">
                          <UIcon name="i-lucide-eye" class="w-3.5 h-3.5" /> Awaiting the presenter's decision
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <p v-else-if="!planning" class="text-sm text-muted-foreground">No concrete steps to propose for this area.</p>

                <!-- Minutes rollup + record/share (async decision room) -->
                <div v-if="hasBriefing && !planning" class="pt-2 border-t border-border flex items-center justify-between gap-3 flex-wrap">
                  <p class="text-xs text-muted-foreground min-w-0">
                    <template v-if="rollup.total">
                      Meeting minutes — {{ rollup.done }} done, {{ rollup.skipped }} skipped<span v-if="rollup.failed">, {{ rollup.failed }} failed</span><span v-if="rollup.open">, {{ rollup.open }} open</span>.
                    </template>
                    <template v-else>Record what you reviewed for the team.</template>
                    <span v-if="capturedItems.length" class="text-muted-foreground/70"> · {{ capturedItems.length }} action item{{ capturedItems.length === 1 ? '' : 's' }} captured</span>
                  </p>
                  <div class="flex items-center gap-1.5 shrink-0">
                    <NuxtLink
                      v-if="savedMinutesId"
                      :to="`/boardroom/minutes/${savedMinutesId}`"
                      class="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                      title="Open the saved recap"
                    >
                      <UIcon name="i-lucide-external-link" class="w-3.5 h-3.5" /> View recap
                    </NuxtLink>
                    <button
                      type="button"
                      class="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full bg-foreground text-background hover:opacity-90 disabled:opacity-50 transition-opacity"
                      :disabled="recordingMinutes"
                      :title="savedMinutesId ? 'Share the recap with teammates for review' : 'Save these minutes and share for review'"
                      @click="recordAndShare"
                    >
                      <UIcon :name="recordingMinutes ? 'i-lucide-loader-2' : 'i-lucide-gavel'" class="w-3.5 h-3.5" :class="recordingMinutes ? 'animate-spin' : ''" />
                      {{ savedMinutesId ? 'Share for review' : 'Record & share minutes' }}
                    </button>
                  </div>
                </div>
                </template>

                <!-- Ask Earnest — advisory Q&A about this briefing (both views) -->
                <div v-if="hasBriefing && !planning" class="pt-3 border-t border-border space-y-2.5">
                  <p class="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1">
                    <EarnestIcon class="w-3 h-3 text-primary" /> Ask Earnest
                    <AiSpendMark muted />
                  </p>

                  <div v-if="qaThread.length" class="space-y-2">
                    <div v-for="(m, i) in qaThread" :key="i" class="flex" :class="m.role === 'user' ? 'justify-end' : 'justify-start'">
                      <div
                        class="max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-line"
                        :class="m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'"
                      >{{ m.text }}</div>
                    </div>
                    <div v-if="qaLoading" class="flex justify-start">
                      <div class="rounded-2xl px-3 py-2 bg-muted text-muted-foreground text-sm inline-flex items-center gap-1.5">
                        <UIcon name="i-lucide-loader-2" class="w-3.5 h-3.5 animate-spin" /> thinking…
                      </div>
                    </div>
                  </div>

                  <!-- Starter prompts before the first question -->
                  <div v-if="!qaThread.length" class="flex flex-wrap gap-1.5">
                    <button
                      v-for="s in qaSuggestions"
                      :key="s"
                      type="button"
                      class="text-[11px] px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 disabled:opacity-50"
                      :disabled="qaLoading"
                      @click="askEarnest(s)"
                    >{{ s }}</button>
                  </div>

                  <div class="flex items-center gap-2">
                    <input
                      v-model="qaInput"
                      type="text"
                      placeholder="Ask a question or push back…"
                      class="flex-1 rounded-full border border-border bg-background px-3.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      :disabled="qaLoading"
                      @keydown.enter="askEarnest()"
                    />
                    <button
                      type="button"
                      class="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-foreground text-background disabled:opacity-50"
                      :disabled="!qaInput.trim() || qaLoading"
                      @click="askEarnest()"
                    >
                      <UIcon name="i-lucide-send" class="w-3.5 h-3.5" /> Ask
                    </button>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </section>

        <!-- Go-live setup — curate which advisors are in the room -->
        <Teleport to="body">
          <div v-if="showGoLive" class="dark fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-foreground" @click.self="showGoLive = false">
            <section class="w-full max-w-md rounded-3xl border border-border bg-card shadow-2xl overflow-hidden">
              <header class="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
                <div class="flex items-center gap-2.5 min-w-0">
                  <span class="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <UIcon name="i-lucide-radio" class="w-4.5 h-4.5" />
                  </span>
                  <div class="min-w-0">
                    <h3 class="text-sm font-semibold leading-tight">Go live with the team</h3>
                    <p class="text-xs text-muted-foreground truncate">Choose which advisors are in the room.</p>
                  </div>
                </div>
                <button type="button" class="text-muted-foreground hover:text-foreground p-1" aria-label="Close" @click="showGoLive = false">
                  <UIcon name="i-lucide-x" class="w-5 h-5" />
                </button>
              </header>

              <div class="px-5 py-4 space-y-3">
                <template v-if="scope?.mode !== 'entity' && availableAdvisors.length">
                  <p class="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Advisors at the table</p>
                  <p class="text-xs text-muted-foreground -mt-1">Unpicked advisors — and their data — stay out of this meeting. Leave “The Money” out and no one here sees the finances.</p>
                  <div class="grid grid-cols-2 gap-2">
                    <button
                      v-for="a in availableAdvisors"
                      :key="a.subject"
                      type="button"
                      class="flex items-center gap-2 rounded-2xl border p-2.5 text-left transition-colors"
                      :class="goLiveSubjects.includes(a.subject) ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-primary/30'"
                      @click="toggleGoLiveSubject(a.subject)"
                    >
                      <span class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" :class="goLiveSubjects.includes(a.subject) ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'">
                        <UIcon :name="a.icon" class="w-3.5 h-3.5" />
                      </span>
                      <span class="text-sm font-medium truncate flex-1">{{ a.label }}</span>
                      <span class="w-4 h-4 rounded-full border flex items-center justify-center shrink-0" :class="goLiveSubjects.includes(a.subject) ? 'bg-primary border-primary text-primary-foreground' : 'border-border'">
                        <UIcon v-if="goLiveSubjects.includes(a.subject)" name="i-lucide-check" class="w-2.5 h-2.5" />
                      </span>
                    </button>
                  </div>
                </template>
                <p v-else-if="scope?.mode === 'entity'" class="text-xs text-muted-foreground">
                  This is a focused meeting on {{ scopeLabel }} — one advisor, ready to present.
                </p>

                <!-- Participation mode -->
                <label class="flex items-start gap-2.5 rounded-2xl border border-border p-3 cursor-pointer">
                  <input v-model="goLiveViewOnly" type="checkbox" class="mt-0.5 accent-primary" />
                  <span class="min-w-0">
                    <span class="text-sm font-medium block">View-only for guests</span>
                    <span class="text-xs text-muted-foreground">Only you (the presenter) can approve steps. Everyone else watches and follows your screen.</span>
                  </span>
                </label>
              </div>

              <footer class="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-border">
                <span class="text-xs text-muted-foreground">{{ scope?.mode === 'entity' ? '1 advisor' : (goLiveSubjects.length + ' advisor' + (goLiveSubjects.length === 1 ? '' : 's')) }}</span>
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-full bg-primary text-primary-foreground disabled:opacity-50"
                  :disabled="liveConnecting || (scope?.mode !== 'entity' && !goLiveSubjects.length)"
                  @click="confirmGoLive"
                >
                  <UIcon :name="liveConnecting ? 'i-lucide-loader-2' : 'i-lucide-radio'" class="w-4 h-4" :class="liveConnecting ? 'animate-spin' : ''" />
                  Go live
                </button>
              </footer>
            </section>
          </div>
        </Teleport>

        <!-- Invite teammates to the live table -->
        <CommandCenterDirectorInvitePicker
          v-if="showInvite && liveActive && selectedOrg"
          :organization-id="selectedOrg"
          :seated-ids="seatedIds"
          @invite="onInvite"
          @close="showInvite = false"
        />

        <!-- Share the recorded minutes with teammates for async review -->
        <CommandCenterDirectorInvitePicker
          v-if="showShareMinutes && selectedOrg"
          :organization-id="selectedOrg"
          title="Share minutes for review"
          subtitle="They'll get the recap to review on their own time."
          cta="Share recap"
          icon="i-lucide-gavel"
          @invite="onShareMinutes"
          @close="showShareMinutes = false"
        />
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

/* Immersive dark canvas + the living aura as the full backdrop (Focus language). */
.director-canvas { background: radial-gradient(140% 120% at 50% 8%, #0c1424 0%, #070b14 52%, #04060c 100%); }
/* The whole panel scrolls as one; hide its scrollbar. */
.director-scroll { scrollbar-width: none; }
.director-scroll::-webkit-scrollbar { display: none; }
.director-aura { position: absolute; inset: 0; opacity: 0.9; z-index: 0; }

/* Half-circle board — departments fanned around the Director (you). Seats are
   anchored to their CHIP CENTRE (translate -30px = half the 60px chip) so the
   connector lines land dead-centre; label + priority flow below. */
/* Seats + director sit ABOVE the connector <svg> (z:1) and use an OPAQUE base so
   the dotted lines are occluded where they pass under a chip — the lines read as
   coming out from behind each department, never over it. */
.do-seat { position: absolute; z-index: 1; transform: translate(-50%, -30px); display: flex; flex-direction: column; align-items: center; gap: 6px; width: 96px; background: transparent; border: 0; cursor: pointer; transition: opacity .3s; }
.do-seat[data-dim="true"] { opacity: .38; }
.do-seat__chip { position: relative; width: 60px; height: 60px; border-radius: 50%; display: grid; place-items: center; border: 1px solid hsl(var(--aura-rim)); background: color-mix(in oklab, var(--seat-accent) 20%, #0c1526); color: color-mix(in oklab, var(--seat-accent), white 22%); box-shadow: 0 12px 30px -14px rgba(0,0,0,.7); transition: transform .34s cubic-bezier(.34,1.5,.5,1), box-shadow .3s, border-color .25s; }
.do-seat:hover .do-seat__chip { transform: translateY(-4px) scale(1.06); border-color: color-mix(in oklab, var(--seat-accent), white 20%); }
.do-seat[data-active="true"] .do-seat__chip { border-color: var(--seat-accent); box-shadow: 0 0 0 2px var(--seat-accent), 0 14px 34px -12px color-mix(in oklab, var(--seat-accent) 60%, transparent); }
.do-seat__badge { position: absolute; top: -5px; right: -5px; min-width: 21px; height: 21px; padding: 0 6px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: #06121f; background: var(--seat-accent); box-shadow: 0 2px 8px -2px rgba(0,0,0,.6); }
.do-seat__presenter { position: absolute; bottom: -5px; left: -5px; width: 22px; height: 22px; border-radius: 50%; object-fit: cover; border: 2px solid hsl(var(--aura-ground)); }
.do-seat[data-presenting="true"] .do-seat__chip::after { content: ''; position: absolute; inset: -5px; border-radius: 50%; border: 2px solid var(--seat-accent); animation: do-ring 1.9s ease-out infinite; pointer-events: none; }
@keyframes do-ring { 0% { transform: scale(1); opacity: .7; } 100% { transform: scale(1.42); opacity: 0; } }
.do-seat__label { font-size: 12px; font-weight: 600; letter-spacing: -0.01em; color: hsl(var(--aura-foreground)); }
.do-seat__pri { font-size: 9.5px; letter-spacing: .12em; text-transform: uppercase; color: rgba(238,242,248,.42); margin-top: -3px; }

.do-director { position: absolute; z-index: 1; transform: translate(-50%, -30px); display: flex; flex-direction: column; align-items: center; gap: 5px; }
.do-director__chair { width: 60px; height: 60px; border-radius: 50%; display: grid; place-items: center; color: hsl(var(--aura-foreground)); background: color-mix(in oklab, #6a86dc 12%, #101a2e); border: 1px solid rgba(255,255,255,.2); box-shadow: 0 0 44px -6px rgba(120,150,220,.5); }
.do-director__label { font-size: 10px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: rgba(238,242,248,.6); max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.do-attendees { display: flex; margin-top: 3px; }
.do-att { width: 23px; height: 23px; border-radius: 50%; object-fit: cover; margin-left: -7px; border: 2px solid hsl(var(--aura-ground)); box-shadow: 0 2px 6px -2px rgba(0,0,0,.6); }
.do-att:first-child { margin-left: 0; }

/* Liquid card micro-interaction: retime the existing hover lift to a gentle
   spring (overshoot ease) so cards feel buoyant, not mechanical. */
.do-spring {
  transition-duration: 0.34s !important;
  transition-timing-function: cubic-bezier(0.34, 1.4, 0.5, 1) !important;
}

.director-fade-enter-active,
.director-fade-leave-active {
  transition: opacity 240ms ease;
}
.director-fade-enter-from,
.director-fade-leave-to {
  opacity: 0;
}
.director-office {
  /* opacity only — `will-change: transform` would create a containing block that
     traps the slides deck's full-screen (position: fixed) inside this panel. */
  will-change: opacity;
}

/* Raise-a-topic input grows in from the left when the pill is clicked. */
.topic-expand-enter-active {
  transition: opacity 240ms ease, transform 280ms cubic-bezier(0.36, 0.66, 0.04, 1);
  transform-origin: left center;
}
.topic-expand-enter-from {
  opacity: 0;
  transform: translateY(-4px) scaleX(0.9);
}
.topic-expand-leave-active {
  transition: opacity 140ms ease;
}
.topic-expand-leave-to {
  opacity: 0;
}

/* Presence line — marching dashes flowing toward the Director, fades in/out. */
.director-presence-line {
  animation: presence-dash 800ms linear infinite;
}
@keyframes presence-dash {
  to {
    stroke-dashoffset: -22;
  }
}
.line-fade-enter-active,
.line-fade-leave-active {
  transition: opacity 260ms ease;
}
.line-fade-enter-from,
.line-fade-leave-to {
  opacity: 0;
}
</style>
