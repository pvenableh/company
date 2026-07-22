<!--
  /boardroom — the Boardroom as its own destination.

  The working meeting itself still runs in the global overlay
  (CommandCenter/DirectorOffice.vue) so it can be convened from anywhere; this
  page is the "app home": a Convene button + a history of past briefings
  (director_briefings, via /api/ai/director/history). Opening a past meeting
  re-opens the office in the same scope — its saved briefing loads instantly.
-->
<script setup lang="ts">
definePageMeta({ middleware: ['auth'] });
useHead({ title: "The Boardroom | Earnest" });

const { open: openBoardroom } = useBoardroom();
const { selectedOrg } = useOrganization();
const { joinSession, session: liveSession } = useBoardroomSession();
const { user } = useUserSession();

// Personal "My work" review — grounded on the current user's own assignments,
// no org-wide financials. Modeled as a focused meeting on the `user` entity.
function reviewMyWork() {
  const id = (user.value as any)?.id;
  if (!id) return;
  openBoardroom({ mode: 'entity', entityType: 'user', entityId: String(id), label: 'My work' });
}
const route = useRoute();
const router = useRouter();

// Live meetings happening right now — anyone in the org can pull up a chair.
interface LiveMeeting {
  id: string | number; title: string | null; subject: string | null; topic: string | null;
  scopeType: 'org' | 'entity'; entityType: string | null; entityId: string | null;
  hostName: string | null; participantCount: number;
}
const liveMeetings = ref<LiveMeeting[]>([]);

async function loadLive() {
  if (!selectedOrg.value) { liveMeetings.value = []; return; }
  try {
    const res = await $fetch<{ sessions: any[] }>('/api/ai/director/sessions', { query: { organizationId: selectedOrg.value } });
    liveMeetings.value = (res.sessions || []).map((s) => ({
      id: s.id, title: s.title, subject: s.subject, topic: s.topic,
      scopeType: s.scopeType, entityType: s.entityType, entityId: s.entityId,
      hostName: s.hostName, participantCount: s.participantCount,
    }));
  } catch {
    liveMeetings.value = [];
  }
}

async function joinLive(id: string | number) {
  const ok = await joinSession(String(id));
  if (!ok) return;
  const s = liveSession.value;
  if (s?.scopeType === 'entity' && s.entityType && s.entityId) {
    openBoardroom({ mode: 'entity', entityType: s.entityType, entityId: s.entityId, label: s.title || 'Live session' });
  } else {
    openBoardroom();
  }
}

function liveLabel(m: LiveMeeting): string {
  if (m.title) return m.title;
  if (m.topic) return m.topic;
  const s = (m.subject || '').toLowerCase();
  return ({ money: 'The Money', clients: 'Clients', projects: 'Projects', leads: 'Pipeline', proposals: 'Proposals', tickets: 'Support' } as Record<string, string>)[s] || 'Working session';
}

interface Meeting {
  id: string | number;
  subject: string | null;
  topic: string | null;
  scope_type: string;
  entity_type: string | null;
  entity_id: string | null;
  cache_key: string;
  step_count: number;
  intro: string | null;
  date_created: string;
}

const meetings = ref<Meeting[]>([]);
const loading = ref(false);
const search = ref('');

async function load() {
  if (!selectedOrg.value) return;
  loading.value = true;
  try {
    const res = await $fetch<{ meetings: Meeting[] }>('/api/ai/director/history', { query: { organizationId: selectedOrg.value } });
    meetings.value = res.meetings || [];
  } catch {
    meetings.value = [];
  }
  loading.value = false;
}

// Decision records — recorded minutes (director_minutes), the async recap layer.
const { list: listMinutes } = useBoardroomMinutes();
const decisionRecords = ref<Awaited<ReturnType<typeof listMinutes>>>([]);
async function loadMinutes() {
  if (!selectedOrg.value) { decisionRecords.value = []; return; }
  decisionRecords.value = await listMinutes(selectedOrg.value, 12);
}
function recordScopeNote(m: { scopeType: string; entityType: string | null }): string {
  if (m.scopeType === 'entity' && m.entityType) return `Focused · ${m.entityType.replace(/s$/, '')}`;
  if (m.scopeType === 'mine') return 'My work';
  return 'Org-wide';
}

watch(selectedOrg, () => { load(); loadLive(); loadMinutes(); }, { immediate: true });

// Deep-link from an invite notification: /boardroom?session=<id> → join it.
onMounted(async () => {
  const sid = route.query.session;
  if (sid) {
    await joinLive(String(sid));
    router.replace({ query: {} });
  }
});

function subjectLabel(m: Meeting): string {
  if (m.topic) return m.topic;
  const s = (m.subject || '').toLowerCase();
  return ({ money: 'The Money', clients: 'Clients', projects: 'Projects', leads: 'Pipeline', proposals: 'Proposals', tickets: 'Support' } as Record<string, string>)[s]
    || (m.subject ? m.subject.charAt(0).toUpperCase() + m.subject.slice(1) : 'Working session');
}
function subjectIcon(m: Meeting): string {
  const s = (m.subject || '').toLowerCase();
  if (s === 'money') return 'i-lucide-banknote';
  if (s === 'clients') return 'i-lucide-user-round';
  if (s === 'projects') return 'i-lucide-folder-kanban';
  if (s === 'leads') return 'i-lucide-trending-up';
  if (s === 'proposals') return 'i-lucide-file-text';
  if (s === 'tickets') return 'i-lucide-ticket';
  return 'i-lucide-sparkles';
}
function scopeNote(m: Meeting): string {
  if (m.scope_type === 'entity' && m.entity_type) return `Focused · ${m.entity_type.replace(/s$/, '')}`;
  return 'Org-wide';
}
function ago(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (!isFinite(diff) || diff < 60_000) return 'just now';
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
function snippet(t: string | null): string {
  if (!t) return '';
  const clean = t.replace(/\s+/g, ' ').trim();
  return clean.length > 150 ? `${clean.slice(0, 150)}…` : clean;
}
function openMeeting(m: Meeting) {
  if (m.scope_type === 'entity' && m.entity_type && m.entity_id) {
    openBoardroom({ mode: 'entity', entityType: m.entity_type, entityId: m.entity_id, label: subjectLabel(m) });
  } else {
    openBoardroom();
  }
}

// Free-text filter across the meeting's title, topic, scope and briefing text.
const filteredMeetings = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return meetings.value;
  return meetings.value.filter((m) => {
    const hay = [subjectLabel(m), m.topic, m.subject, scopeNote(m), m.intro].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  });
});
</script>

<template>
  <LayoutPageContainer>
    <div class="flex items-start justify-between gap-4 pt-2 mb-6">
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-11 h-11 rounded-2xl bg-muted ring-1 ring-border flex items-center justify-center shrink-0">
          <ExecutiveChairIcon class="w-7 h-7" />
        </div>
        <div class="min-w-0">
          <h1 class="text-[28px] font-bold text-foreground tracking-tight leading-tight flex items-center gap-2">
            The Boardroom
            <UIcon
              name="i-lucide-info"
              class="w-4 h-4 text-muted-foreground hover:text-foreground cursor-help transition-colors shrink-0"
              title="Earnest's room — it convenes your board, reviews the business, and proposes a plan you approve step by step. Nothing runs on its own."
            />
          </h1>
        </div>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <button
          type="button"
          class="inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-border text-foreground text-sm font-medium ios-press"
          title="Review just your own tasks & tickets"
          @click="reviewMyWork"
        >
          <UIcon name="i-lucide-user-round" class="w-5 h-5" />
          <span class="hidden sm:inline">My work</span>
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-medium shadow-sm ios-press"
          @click="openBoardroom()"
        >
          <DirectorChairIcon class="w-5 h-5" />
          <span class="hidden sm:inline">Convene the board</span>
          <span class="sm:hidden">Convene</span>
        </button>
      </div>
    </div>

    <!-- Live now — join a meeting in progress -->
    <div v-if="liveMeetings.length" class="mb-6">
      <p class="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2 flex items-center gap-1.5">
        <span class="relative flex w-1.5 h-1.5">
          <span class="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 animate-ping" />
          <span class="relative inline-flex rounded-full w-1.5 h-1.5 bg-red-500" />
        </span>
        Live now
      </p>
      <div class="grid gap-2 sm:grid-cols-2">
        <button
          v-for="m in liveMeetings"
          :key="m.id"
          type="button"
          class="group text-left rounded-2xl border border-primary/30 bg-primary/5 p-3.5 transition-all hover:border-primary/50 hover:shadow-sm hover:-translate-y-0.5"
          @click="joinLive(m.id)"
        >
          <div class="flex items-center gap-3">
            <span class="w-9 h-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <UIcon name="i-lucide-users-round" class="w-4.5 h-4.5" />
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold truncate">{{ liveLabel(m) }}</p>
              <p class="text-xs text-muted-foreground truncate">
                <template v-if="m.hostName">{{ m.hostName }} · </template>{{ m.participantCount }} at the table
              </p>
            </div>
            <span class="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full bg-primary text-primary-foreground shrink-0 group-hover:bg-primary/90">
              <UIcon name="i-lucide-log-in" class="w-3.5 h-3.5" /> Join
            </span>
          </div>
        </button>
      </div>
    </div>

    <!-- Decision records — recorded minutes, shared for async review -->
    <div v-if="decisionRecords.length" class="mb-6">
      <p class="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2 flex items-center gap-1.5">
        <UIcon name="i-lucide-gavel" class="w-3.5 h-3.5" /> Decision records
      </p>
      <div class="grid gap-2 sm:grid-cols-2">
        <NuxtLink
          v-for="r in decisionRecords"
          :key="r.id"
          :to="`/boardroom/minutes/${r.id}`"
          class="group text-left rounded-2xl border border-border bg-card p-3.5 transition-all hover:border-primary/40 hover:shadow-sm hover:-translate-y-0.5"
        >
          <div class="flex items-center gap-3">
            <span class="w-9 h-9 rounded-xl bg-muted text-muted-foreground flex items-center justify-center shrink-0">
              <UIcon name="i-lucide-gavel" class="w-4.5 h-4.5" />
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold truncate group-hover:text-primary">{{ r.title || 'Working session' }}</p>
              <p class="text-xs text-muted-foreground truncate">
                {{ recordScopeNote(r) }}<template v-if="r.stats?.total"> · {{ r.stats.done }} approved / {{ r.stats.total }}</template><template v-if="r.authorName"> · {{ r.authorName }}</template>
              </p>
            </div>
            <span
              v-if="r.status === 'shared'"
              class="text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5 font-medium bg-success/15 text-success shrink-0"
            >Shared</span>
          </div>
        </NuxtLink>
      </div>
    </div>

    <!-- Past meetings -->
    <div class="mb-3 flex items-center gap-2 flex-wrap">
      <p class="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Past meetings</p>
      <span v-if="meetings.length" class="text-[10px] text-muted-foreground">· {{ filteredMeetings.length }}</span>
      <div v-if="meetings.length" class="ml-auto relative">
        <UIcon name="i-lucide-search" class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <input
          v-model="search"
          type="text"
          placeholder="Search meetings…"
          class="w-44 sm:w-64 rounded-full glass-field pl-8 pr-3 py-1.5 text-sm focus:outline-none"
        />
      </div>
    </div>

    <div v-if="loading" class="flex items-center gap-2 text-sm text-muted-foreground py-8">
      <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" /> Loading meeting history…
    </div>

    <div v-else-if="!meetings.length" class="rounded-2xl border border-dashed border-border p-8 text-center">
      <div class="mx-auto mb-3 w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
        <DirectorChairIcon class="w-6 h-6 text-muted-foreground" />
      </div>
      <p class="text-sm font-medium text-foreground">No meetings yet</p>
      <p class="text-xs text-muted-foreground mt-0.5 max-w-sm mx-auto">
        Convene the board and Earnest's briefings will be saved here — reopen any one to pick up where you left off.
      </p>
    </div>

    <div v-else class="rounded-2xl border border-border overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
              <th class="text-left font-medium px-4 py-2.5">Meeting</th>
              <th class="text-left font-medium px-4 py-2.5 hidden sm:table-cell">Scope</th>
              <th class="text-right font-medium px-4 py-2.5">Steps</th>
              <th class="text-left font-medium px-4 py-2.5 hidden md:table-cell">Summary</th>
              <th class="text-right font-medium px-4 py-2.5">When</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="m in filteredMeetings"
              :key="m.id"
              class="border-b border-border last:border-0 hover:bg-muted/40 cursor-pointer transition-colors"
              @click="openMeeting(m)"
            >
              <td class="px-4 py-2.5">
                <div class="flex items-center gap-2.5 min-w-0">
                  <span class="w-8 h-8 rounded-lg bg-muted text-muted-foreground flex items-center justify-center shrink-0">
                    <UIcon :name="subjectIcon(m)" class="w-4 h-4" />
                  </span>
                  <span class="font-medium truncate">{{ subjectLabel(m) }}</span>
                </div>
              </td>
              <td class="px-4 py-2.5 text-muted-foreground hidden sm:table-cell whitespace-nowrap">{{ scopeNote(m) }}</td>
              <td class="px-4 py-2.5 text-right text-muted-foreground tabular-nums">{{ m.step_count || '—' }}</td>
              <td class="px-4 py-2.5 hidden md:table-cell">
                <div class="text-muted-foreground truncate max-w-[280px]">{{ snippet(m.intro) || '—' }}</div>
              </td>
              <td class="px-4 py-2.5 text-right text-muted-foreground whitespace-nowrap" :title="new Date(m.date_created).toLocaleString()">{{ ago(m.date_created) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="!filteredMeetings.length" class="px-4 py-8 text-center text-sm text-muted-foreground">
        No meetings match “{{ search }}”.
      </div>
    </div>
  </LayoutPageContainer>
</template>
