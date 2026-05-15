<script setup lang="ts">
/**
 * Work app — Apps Layout Phase 3.
 *
 * Single landing page with a pill-segmented floor strip:
 *   Projects (default) | Tasks | Tickets | Meetings | Calendar | Insights
 *
 * Floor switching is in-place (v-if on a query param), so the shell never
 * remounts. Drill-downs from any floor still push to the canonical
 * classic routes (`/projects/[id]`, `/tickets/[id]`, `/meetings/[id]`).
 *
 * The Projects floor exposes two views of the same `projects` data:
 *   - `timeline` (default) — `ProjectTimelineUnifiedGantt`
 *   - `table`              — `ProjectsTable` with search + status filter
 * The view is persisted via `?view=table` (timeline is default and omitted
 * from the URL). Legacy `?floor=gantt` deep-links are redirected to
 * `?floor=projects` (which lands on Timeline anyway).
 *
 * Multi-home decision (documented for Phase 3):
 *   Meetings + Tasks do NOT get their own tab on /apps/clients/[id].
 *   Both already surface via the Projects tab drill-down. A unified
 *   Activity feed (Phase 7) will cover cross-noun chronology if needed.
 *   Five tabs is already at the edge of comfortable.
 */
import { useDebounceFn } from '@vueuse/core';
import { Button } from '~/components/ui/button';

definePageMeta({ layout: 'apps', middleware: ['auth'] });
useHead({ title: 'Work | Earnest' });

const router = useRouter();
const route = useRoute();
const config = useRuntimeConfig();

// ── Floor strip ─────────────────────────────────────────────────────────────
type FloorKey = 'projects' | 'tasks' | 'tickets' | 'meetings' | 'calendar' | 'insights';
const FLOOR_KEYS: FloorKey[] = ['projects', 'tasks', 'tickets', 'meetings', 'calendar', 'insights'];

// Migrate legacy `?floor=gantt` deep-links onto the merged Projects floor.
// Gantt was its own floor pre-merge; it's now the default *view* on Projects.
const initialFloor: FloorKey = (() => {
  const v = route.query.floor;
  if (v === 'gantt') return 'projects';
  return typeof v === 'string' && FLOOR_KEYS.includes(v as FloorKey) ? (v as FloorKey) : 'projects';
})();
const floor = ref<FloorKey>(initialFloor);

watch(floor, (next) => {
  router.replace({ query: { ...route.query, floor: next === 'projects' ? undefined : next } });
});

const floors: Array<{ key: FloorKey; label: string; icon: string }> = [
  { key: 'projects', label: 'Projects', icon: 'lucide:folder-kanban' },
  { key: 'tasks', label: 'Tasks', icon: 'lucide:check-square' },
  { key: 'tickets', label: 'Tickets', icon: 'lucide:ticket' },
  { key: 'meetings', label: 'Meetings', icon: 'lucide:video' },
  { key: 'calendar', label: 'Calendar', icon: 'lucide:calendar' },
  { key: 'insights', label: 'Insights', icon: 'lucide:bar-chart-3' },
];

// View toggle on the Projects floor — `timeline` (default) renders the
// unified Gantt; `table` renders the searchable ProjectsTable. Persists
// via `?view=table`; the default is omitted from the URL.
type ProjectsView = 'timeline' | 'table';
const initialProjectsView: ProjectsView = route.query.view === 'table' ? 'table' : 'timeline';
const projectsView = ref<ProjectsView>(initialProjectsView);

watch(projectsView, (next) => {
  router.replace({
    query: { ...route.query, view: next === 'timeline' ? undefined : next },
  });
});

// Rewrite any `?floor=gantt` URL once on mount so the legacy query stops
// hanging around in the address bar (and so back-button doesn't bounce
// the user back to the dead floor). The view defaults to `timeline`
// which is what Gantt was anyway.
if (route.query.floor === 'gantt') {
  const { floor: _drop, ...rest } = route.query;
  router.replace({ query: rest });
}

// ── Insights floor ──────────────────────────────────────────────────────────
const { snapshot: insightsSnapshot, snapshotLoading: insightsLoading, fetchSnapshot: fetchInsights } = useCRMIntelligence();
let insightsLoaded = false;
watch(floor, (next) => {
  if (next === 'insights' && !insightsLoaded) {
    insightsLoaded = true;
    if (!insightsSnapshot.value) fetchInsights();
  }
}, { immediate: true });

// ── Common deps ─────────────────────────────────────────────────────────────
const { user } = useDirectusAuth();
const { selectedOrg, getOrganizationFilter } = useOrganization();
const { selectedClient, getClientFilter } = useClients();
// Team filter is shared state via `useState`, so the picker on the Projects
// floor + the TicketsBoard's filter both read/write the same `selectedTeam`.
// Changing it triggers a refetch on the active floor.
const { selectedTeam, visibleTeams, fetchTeams, setTeam, clearTeam } = useTeams();

// ── Projects floor ──────────────────────────────────────────────────────────
const projectItems = useDirectusItems('projects');
const taskItemsApi = useDirectusItems('project_tasks');
const projectsList = ref<any[]>([]);
const projectsLoading = ref(false);
const projectStatusFilter = ref<'active' | 'completed' | 'archived' | 'all'>('active');
const projectsSearch = ref('');

const projectStatusItems = [
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'archived', label: 'Archived' },
  { key: 'all', label: 'All' },
];

async function fetchProjects() {
  projectsLoading.value = true;
  try {
    const filter: Record<string, any> = {};
    Object.assign(filter, getOrganizationFilter());
    Object.assign(filter, getClientFilter());
    // Direct team filter — `projects.team` is a M2O field. Matches the same
    // shape TicketsBoard uses for tickets.team, so both floors are aligned.
    if (selectedTeam.value) {
      filter.team = { _eq: selectedTeam.value };
    }

    const statusFilter =
      projectStatusFilter.value === 'active'
        ? { status: { _nin: ['Archived', 'completed'] } }
        : projectStatusFilter.value === 'completed'
        ? { status: { _in: ['completed'] } }
        : projectStatusFilter.value === 'archived'
        ? { status: { _eq: 'Archived' } }
        : { status: { _nin: ['Archived'] } };

    const raw = await projectItems.list({
      fields: [
        'id', 'title', 'status', 'due_date', 'date_updated',
        'service.id', 'service.name', 'service.color',
        'client.id', 'client.name',
        'assigned_to.id',
        'assigned_to.directus_users_id.id',
        'assigned_to.directus_users_id.first_name',
        'assigned_to.directus_users_id.last_name',
      ],
      search: projectsSearch.value || undefined,
      filter: { ...statusFilter, ...filter },
      sort: ['-date_updated'],
      limit: 200,
    });

    const ids = (raw || []).map((p: any) => p.id);
    if (ids.length) {
      try {
        const tasks = await taskItemsApi.list({
          fields: ['id', 'project', 'completed', 'status', 'event_id.project'],
          filter: {
            _or: [
              { project: { _in: ids } },
              { event_id: { project: { _in: ids } } },
            ],
          },
          limit: -1,
        });
        const progress: Record<string, { total: number; completed: number }> = {};
        for (const t of tasks || []) {
          const pid = t.project || t.event_id?.project;
          if (!pid) continue;
          if (!progress[pid]) progress[pid] = { total: 0, completed: 0 };
          progress[pid].total++;
          if (t.completed || t.status === 'done') progress[pid].completed++;
        }
        projectsList.value = (raw || []).map((p: any) => ({
          ...p,
          taskCount: progress[p.id]?.total || 0,
          taskProgress: progress[p.id]?.total
            ? Math.round((progress[p.id].completed / progress[p.id].total) * 100)
            : 0,
        }));
      } catch {
        projectsList.value = raw || [];
      }
    } else {
      projectsList.value = raw || [];
    }
  } catch (e) {
    console.error('[apps/work] fetchProjects failed', e);
    projectsList.value = [];
  } finally {
    projectsLoading.value = false;
  }
}

const debouncedFetchProjects = useDebounceFn(fetchProjects, 300);

// ── Tasks floor ─────────────────────────────────────────────────────────────
const tasksTab = ref<'assigned' | 'organization' | 'all'>('assigned');
const tasksFilterUserId = computed(() => (tasksTab.value === 'assigned' ? user.value?.id ?? null : null));
const tasksOrgId = computed(() => selectedOrg.value || null);

const taskTabs = [
  { key: 'assigned', label: 'Assigned to Me' },
  { key: 'organization', label: 'Organization' },
  { key: 'all', label: 'All Tasks' },
];

// ── Meetings floor ──────────────────────────────────────────────────────────
const videoMeetingsApi = useDirectusItems('video_meetings');
const meetings = ref<any[]>([]);
const meetingsLoading = ref(false);
const meetingsSearch = ref('');

async function fetchMeetings() {
  if (!user.value?.id) return;
  meetingsLoading.value = true;
  try {
    const rows = await videoMeetingsApi.list({
      fields: [
        'id', 'title', 'status', 'scheduled_start', 'actual_start', 'actual_duration_minutes',
        'recording_url', 'transcript_text', 'summary_status',
        'host_user.id', 'host_user.first_name', 'host_user.last_name',
        'project.id', 'project.title',
        'project_event.id', 'project_event.title',
        'project_event.project.id', 'project_event.project.title',
        'related_organization.id', 'related_organization.name',
        'attendees.id', 'attendees.directus_user',
      ],
      filter: {
        _or: [
          { host_user: { _eq: user.value.id } },
          { attendees: { directus_user: { _eq: user.value.id } } },
        ],
      },
      sort: ['-scheduled_start'],
      limit: 100,
    });
    meetings.value = rows || [];
  } catch (err) {
    console.error('[apps/work] fetchMeetings failed', err);
    meetings.value = [];
  } finally {
    meetingsLoading.value = false;
  }
}

const filteredMeetings = computed(() => {
  const q = meetingsSearch.value.trim().toLowerCase();
  if (!q) return meetings.value;
  return meetings.value.filter((m: any) => {
    const haystack = [
      m.title,
      m.project?.title,
      m.project_event?.title,
      m.project_event?.project?.title,
      m.related_organization?.name,
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(q);
  });
});

function meetingChip(m: any) {
  if (m.summary_status === 'complete') return { label: 'Recap ready', tone: 'emerald' };
  if (m.summary_status === 'generating') return { label: 'Generating…', tone: 'sky' };
  if (m.summary_status === 'failed') return { label: 'Recap failed', tone: 'red' };
  if (m.transcript_text) return { label: 'Awaiting recap', tone: 'amber' };
  if (m.status === 'completed') return { label: 'No transcript', tone: 'gray' };
  if (m.status === 'in_progress') return { label: 'In progress', tone: 'sky' };
  if (m.status === 'cancelled') return { label: 'Cancelled', tone: 'gray' };
  return { label: 'Scheduled', tone: 'gray' };
}

const meetingTone: Record<string, string> = {
  emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  sky: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  red: 'bg-red-500/10 text-red-600 dark:text-red-400',
  gray: 'bg-muted/40 text-muted-foreground',
};

function formatMeetingDate(s: string | null | undefined) {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return s;
  }
}

// ── Calendar floor ──────────────────────────────────────────────────────────
// The calendar floor mounts <SchedulerHub />, which is self-contained:
// it provides its own `schedulerData` and fetches its own video meetings
// via the scheduler API. The Meetings floor still uses the local
// `meetings` ref + fetchMeetings() above for its card list.

// ── Lazy-load per floor ─────────────────────────────────────────────────────
const projectsLoaded = ref(false);
const meetingsLoaded = ref(false);

watch(
  floor,
  (next) => {
    // Eager-load projects on floor entry so the Table view is populated
    // the moment the user toggles to it (Timeline view has its own
    // fetcher via ProjectTimelineUnifiedGantt; the cost of pre-fetching
    // the table data is small and avoids a race where toggling to Table
    // races the watcher and renders an empty list).
    if (next === 'projects' && !projectsLoaded.value) {
      projectsLoaded.value = true;
      fetchProjects();
    }
    if (next === 'meetings' && !meetingsLoaded.value) {
      meetingsLoaded.value = true;
      fetchMeetings();
    }
  },
  { immediate: true },
);

// Refetch projects when filters change (only if Projects floor is active or already loaded)
watch([projectStatusFilter, selectedOrg, selectedClient, selectedTeam], () => {
  if (projectsLoaded.value) fetchProjects();
});

// Load the team list once we know the active org. Picker hides until the
// org has at least one team — keeps the chrome clean for solo accounts.
watch(selectedOrg, (orgId) => {
  if (orgId) fetchTeams(orgId).catch(() => {});
}, { immediate: true });

const currentTeamLabel = computed(() => {
  if (!selectedTeam.value) return 'All teams';
  const t = visibleTeams.value.find((x: any) => x.id === selectedTeam.value);
  return t?.name || 'Team';
});

function handleSelectTeam(id: string | null) {
  if (!id) clearTeam();
  else setTeam(id);
}

// ── Slide-overs (Phase 7 Track A) ──────────────────────────────────────────
// Row clicks on the Projects + Meetings floors open a quick-look slide-over
// instead of pushing to the full page. Each panel exposes an "Open full page"
// link for two-deep flows (slide-overs do not stack).
const slideOverProject = ref<any>(null);
const projectSlideOpen = computed({
  get: () => !!slideOverProject.value,
  set: (v) => { if (!v) slideOverProject.value = null; },
});
function openProjectSlideOver(project: any) {
  slideOverProject.value = project;
}

const slideOverMeeting = ref<any>(null);
const meetingSlideOpen = computed({
  get: () => !!slideOverMeeting.value,
  set: (v) => { if (!v) slideOverMeeting.value = null; },
});
function openMeetingSlideOver(meeting: any) {
  slideOverMeeting.value = meeting;
}
</script>

<template>
  <div class="apps-page">
    <AppHeader title="Work" app-id="work">
      <template #actions>
        <!-- Team filter — only shows when the active org has at least one team
             and the floor it can affect is open. Picker writes to the shared
             `selectedTeam` state, which TicketsBoard already reads. -->
        <UDropdown
          v-if="visibleTeams.length > 0 && (floor === 'projects' || floor === 'tickets')"
          :items="[
            [{ label: 'All teams', icon: 'i-heroicons-user-group', click: () => handleSelectTeam(null) }],
            visibleTeams.map((t) => ({ label: t.name, icon: 'i-heroicons-users', click: () => handleSelectTeam(t.id) })),
          ]"
        >
          <button
            type="button"
            class="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-border bg-background text-xs font-medium text-foreground hover:bg-muted/40"
          >
            <Icon name="lucide:users" class="w-3.5 h-3.5 text-muted-foreground" />
            <span class="hidden sm:inline">{{ currentTeamLabel }}</span>
            <span class="sm:hidden">Team</span>
            <Icon name="lucide:chevron-down" class="w-3 h-3 text-muted-foreground" />
          </button>
        </UDropdown>
        <NuxtLink
          v-if="floor === 'projects'"
          to="/projects?new=1"
          class="inline-flex"
        >
          <Button size="sm">
            <Icon name="lucide:plus" class="w-4 h-4 mr-1" />
            New Project
          </Button>
        </NuxtLink>
      </template>
    </AppHeader>

    <LayoutPageContainer>
      <AppFloorStrip v-model="floor" :items="floors" aria-label="Work sections" />

      <AppIntroCard app-id="work" />
      <GoalsRelatedGoalsCard :categories="['delivery']" title="Goals in this lens" />

      <!-- ── Projects floor (Timeline + Table views) ──────────────────── -->
      <template v-if="floor === 'projects'">
        <div class="flex gap-3 mb-5 flex-wrap items-center">
          <!-- View toggle — same `projects` data, two visualisations. -->
          <div class="inline-flex items-center rounded-md border border-border bg-background p-0.5" role="tablist">
            <button
              v-for="opt in [
                { key: 'timeline', label: 'Timeline', icon: 'lucide:bar-chart-horizontal' },
                { key: 'table',    label: 'Table',    icon: 'lucide:list' },
              ]"
              :key="opt.key"
              type="button"
              role="tab"
              :aria-selected="projectsView === opt.key"
              class="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[5px] text-xs font-medium transition-colors"
              :class="projectsView === opt.key
                ? 'bg-muted/70 text-foreground'
                : 'text-muted-foreground hover:text-foreground'"
              @click="projectsView = opt.key as ProjectsView"
            >
              <Icon :name="opt.icon" class="w-3.5 h-3.5" />
              {{ opt.label }}
            </button>
          </div>

          <!-- Table-only filters. The Gantt view does its own filtering
               inside ProjectTimelineUnifiedGantt. -->
          <template v-if="projectsView === 'table'">
            <input
              v-model="projectsSearch"
              type="search"
              placeholder="Search projects..."
              class="flex-1 min-w-48 rounded-md border bg-background px-3 py-2 text-sm"
              @input="debouncedFetchProjects"
            />
            <UTabs
              v-model="projectStatusFilter"
              :items="projectStatusItems"
              class="w-fit"
            />
          </template>
        </div>

        <ClientOnly v-if="projectsView === 'timeline'">
          <div class="min-h-svh">
            <ProjectTimelineUnifiedGantt />
          </div>
          <template #fallback>
            <div class="flex items-center justify-center min-h-[400px]">
              <div class="flex flex-col items-center gap-3">
                <Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
                <span class="text-sm text-muted-foreground">Loading timeline…</span>
              </div>
            </div>
          </template>
        </ClientOnly>

        <div v-else class="ios-card p-5">
          <ProjectsTable
            :projects="projectsList"
            :loading="projectsLoading"
            apps
            @select-project="openProjectSlideOver"
          />
        </div>
      </template>

      <!-- ── Tasks floor ──────────────────────────────────────────────── -->
      <template v-else-if="floor === 'tasks'">
        <UTabs
          v-model="tasksTab"
          :items="taskTabs.map((t) => ({ key: t.key, label: t.label }))"
          class="mb-5 w-fit"
        />

        <div class="ios-card p-5">
          <ClientOnly>
            <TicketsTasksList
              :organizationId="tasksOrgId"
              :userId="tasksFilterUserId"
              :limit="50"
            />
            <template #fallback>
              <div class="p-4 flex justify-center">
                <Icon name="lucide:loader-2" class="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            </template>
          </ClientOnly>
        </div>
      </template>

      <!-- ── Tickets floor ────────────────────────────────────────────── -->
      <ClientOnly v-else-if="floor === 'tickets'">
        <div class="xl:flex xl:items-center xl:justify-center w-full min-h-svh">
          <TicketsBoard />
        </div>
        <template #fallback>
          <div class="flex items-center justify-center min-h-[400px]">
            <Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
          </div>
        </template>
      </ClientOnly>

      <!-- ── Meetings floor ───────────────────────────────────────────── -->
      <template v-else-if="floor === 'meetings'">
        <div class="flex gap-3 mb-5 flex-wrap items-center">
          <input
            v-model="meetingsSearch"
            type="search"
            placeholder="Search meetings, projects, clients…"
            class="flex-1 min-w-48 rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>

        <div v-if="meetingsLoading" class="text-center py-12 text-sm text-muted-foreground">
          Loading meetings…
        </div>

        <div v-else-if="!filteredMeetings.length" class="ios-card p-12 text-center">
          <div class="w-14 h-14 rounded-2xl bg-muted/30 flex items-center justify-center mx-auto mb-4">
            <Icon name="lucide:video" class="w-7 h-7 text-muted-foreground" />
          </div>
          <h2 class="text-base font-semibold text-foreground">No meetings yet</h2>
          <p class="text-sm text-muted-foreground mt-1.5 max-w-sm mx-auto">
            Schedule a meeting from any project event or directly from your calendar. Recaps appear here after the host enables transcription during the call.
          </p>
        </div>

        <div v-else class="space-y-2">
          <button
            v-for="m in filteredMeetings"
            :key="m.id"
            type="button"
            class="ios-card block px-4 py-3 hover:bg-muted/30 transition-colors w-full text-left"
            @click="openMeetingSlideOver(m)"
          >
            <div class="flex items-start gap-3">
              <div class="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                <Icon name="lucide:video" class="w-5 h-5 text-emerald-500" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-start justify-between gap-2">
                  <h3 class="text-sm font-semibold text-foreground truncate">{{ m.title || 'Untitled meeting' }}</h3>
                  <span
                    :class="[
                      'flex-shrink-0 inline-flex items-center px-2 h-5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                      meetingTone[meetingChip(m).tone],
                    ]"
                  >
                    {{ meetingChip(m).label }}
                  </span>
                </div>
                <div class="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-muted-foreground">
                  <span class="inline-flex items-center gap-1">
                    <Icon name="lucide:clock" class="w-3 h-3" />
                    {{ formatMeetingDate(m.actual_start || m.scheduled_start) }}
                  </span>
                  <span v-if="m.actual_duration_minutes" class="inline-flex items-center gap-1">
                    <Icon name="lucide:play" class="w-3 h-3" />
                    {{ m.actual_duration_minutes }}m
                  </span>
                  <span v-if="m.project_event?.project?.title || m.project?.title" class="inline-flex items-center gap-1">
                    <Icon name="lucide:folder" class="w-3 h-3" />
                    {{ m.project_event?.project?.title || m.project?.title }}
                  </span>
                  <span v-if="m.related_organization?.name" class="inline-flex items-center gap-1">
                    <Icon name="lucide:building-2" class="w-3 h-3" />
                    {{ m.related_organization.name }}
                  </span>
                  <span v-if="m.recording_url" class="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <Icon name="lucide:film" class="w-3 h-3" />
                    Recording
                  </span>
                </div>
              </div>
            </div>
          </button>
        </div>
      </template>

      <!-- ── Calendar floor ───────────────────────────────────────────── -->
      <!-- Full scheduler hub: stats, filters, CRM sidebar, calendar with
           day-click-to-create, day timeline, unified event/meeting modal. -->
      <ClientOnly v-else-if="floor === 'calendar'">
        <SchedulerHub />
        <template #fallback>
          <div class="flex items-center justify-center min-h-[400px]">
            <Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
          </div>
        </template>
      </ClientOnly>

      <template v-else-if="floor === 'insights'">
        <WorkInsightsView :snapshot="insightsSnapshot" :loading="insightsLoading" />
      </template>
    </LayoutPageContainer>

    <!-- Slide-overs (Phase 7 Track A) — teleport into the apps shell root -->
    <ClientOnly>
      <Teleport to="#app-slide-over-root">
        <AppSlideOver
          v-model="projectSlideOpen"
          :title="slideOverProject?.title || 'Project'"
        >
          <div v-if="slideOverProject" class="space-y-5">
            <div class="flex flex-wrap items-center gap-2">
              <span
                class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider"
              >
                {{ slideOverProject.status }}
              </span>
              <span v-if="slideOverProject.service?.name" class="text-xs text-muted-foreground">
                {{ slideOverProject.service.name }}
              </span>
              <span v-if="slideOverProject.client?.name" class="text-xs text-muted-foreground">
                · {{ slideOverProject.client.name }}
              </span>
            </div>

            <div class="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Due date</p>
                <p>{{ slideOverProject.due_date ? new Date(slideOverProject.due_date).toLocaleDateString() : '—' }}</p>
              </div>
              <div>
                <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Updated</p>
                <p>{{ slideOverProject.date_updated ? new Date(slideOverProject.date_updated).toLocaleDateString() : '—' }}</p>
              </div>
            </div>

            <div v-if="slideOverProject.taskCount">
              <p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Progress</p>
              <div class="flex items-center gap-2">
                <div class="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                  <div
                    class="h-full rounded-full transition-all"
                    :class="slideOverProject.taskProgress > 75 ? 'bg-emerald-500' : slideOverProject.taskProgress > 25 ? 'bg-amber-500' : 'bg-primary'"
                    :style="{ width: `${slideOverProject.taskProgress || 0}%` }"
                  />
                </div>
                <span class="text-xs text-muted-foreground tabular-nums">{{ slideOverProject.taskProgress }}%</span>
              </div>
            </div>

            <div v-if="slideOverProject.assigned_to?.length">
              <p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Assigned</p>
              <div class="flex flex-wrap gap-1.5">
                <span
                  v-for="a in slideOverProject.assigned_to"
                  :key="a.id"
                  class="text-xs px-2 py-0.5 rounded-full bg-muted/40"
                >
                  {{ a.directus_users_id?.first_name }} {{ a.directus_users_id?.last_name }}
                </span>
              </div>
            </div>

            <div class="pt-3 border-t border-border/30">
              <NuxtLink
                :to="`/projects/${slideOverProject.id}`"
                class="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Open full project page
                <Icon name="lucide:external-link" class="w-3 h-3" />
              </NuxtLink>
            </div>
          </div>
        </AppSlideOver>

        <AppSlideOver
          v-model="meetingSlideOpen"
          :title="slideOverMeeting?.title || 'Meeting'"
        >
          <div v-if="slideOverMeeting" class="space-y-5">
            <span
              :class="[
                'inline-flex items-center px-2 h-5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                meetingTone[meetingChip(slideOverMeeting).tone],
              ]"
            >
              {{ meetingChip(slideOverMeeting).label }}
            </span>

            <div class="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Started</p>
                <p>{{ formatMeetingDate(slideOverMeeting.actual_start || slideOverMeeting.scheduled_start) }}</p>
              </div>
              <div v-if="slideOverMeeting.actual_duration_minutes">
                <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Duration</p>
                <p>{{ slideOverMeeting.actual_duration_minutes }} min</p>
              </div>
            </div>

            <div v-if="slideOverMeeting.project_event?.project?.title || slideOverMeeting.project?.title" class="text-sm">
              <p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Project</p>
              <p>{{ slideOverMeeting.project_event?.project?.title || slideOverMeeting.project?.title }}</p>
            </div>

            <div v-if="slideOverMeeting.related_organization?.name" class="text-sm">
              <p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Client</p>
              <p>{{ slideOverMeeting.related_organization.name }}</p>
            </div>

            <div v-if="slideOverMeeting.recording_url" class="text-sm">
              <a
                :href="slideOverMeeting.recording_url"
                target="_blank"
                rel="noopener"
                class="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <Icon name="lucide:film" class="w-4 h-4" />
                Open recording
              </a>
            </div>

            <div class="pt-3 border-t border-border/30">
              <NuxtLink
                :to="`/meetings/${slideOverMeeting.id}`"
                class="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Open meeting page
                <Icon name="lucide:external-link" class="w-3 h-3" />
              </NuxtLink>
            </div>
          </div>
        </AppSlideOver>
      </Teleport>
    </ClientOnly>
  </div>
</template>

<style scoped>
.apps-page {
  @apply flex flex-col min-h-full;
}
</style>
