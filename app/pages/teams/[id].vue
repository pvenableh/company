<script setup lang="ts">
import type { Team } from '~~/shared/directus';
import { Button } from '~/components/ui/button';

definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Team Details | Earnest' });

const route = useRoute();
const router = useRouter();
const teamId = route.params.id as string;
const config = useRuntimeConfig();

const teamItems = useDirectusItems<Team>('teams');
const ticketItems = useDirectusItems('tickets');
const goalItems = useDirectusItems('team_goals');

const { getStatusBadgeClasses } = useStatusStyle();
const { setEntity, clearEntity, sidebarOpen, closeSidebar } = useEntityPageContext();

const team = ref<any>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const ticketStats = ref({ pending: 0, scheduled: 0, inProgress: 0, completed: 0, total: 0 });
const goals = ref<any[]>([]);
const goalsLoading = ref(false);
const showGoalModal = ref(false);
const editingGoal = ref<any>(null);

async function loadTeam() {
  loading.value = true;
  error.value = null;
  try {
    team.value = await teamItems.get(teamId, {
      fields: [
        '*',
        'icon.*',
        'organization.id', 'organization.name',
        'users.id', 'users.directus_users_id.id', 'users.directus_users_id.first_name',
        'users.directus_users_id.last_name', 'users.directus_users_id.avatar',
        'users.directus_users_id.email', 'users.is_manager',
        'projects.id', 'projects.title', 'projects.status',
      ],
    });
    await Promise.all([loadTicketStats(), loadGoals()]);
  } catch (e: any) {
    error.value = e?.message || 'Failed to load team';
  } finally {
    loading.value = false;
  }
}

async function loadTicketStats() {
  try {
    const tickets = await ticketItems.list({
      fields: ['id', 'status'],
      filter: { team: { _eq: teamId } },
      limit: -1,
    });
    const stats = { pending: 0, scheduled: 0, inProgress: 0, completed: 0, total: tickets.length };
    for (const t of tickets) {
      if ((t as any).status === 'Pending') stats.pending++;
      else if ((t as any).status === 'Scheduled') stats.scheduled++;
      else if ((t as any).status === 'In Progress') stats.inProgress++;
      else if ((t as any).status === 'Completed') stats.completed++;
    }
    ticketStats.value = stats;
  } catch (e) {
    console.error('Failed to load ticket stats:', e);
  }
}

async function loadGoals() {
  goalsLoading.value = true;
  try {
    goals.value = await goalItems.list({
      fields: ['*'],
      filter: { team: { _eq: teamId } },
      sort: ['sort', '-date_created'],
      limit: 50,
    });
  } catch (e) {
    // team_goals collection may not exist yet
    console.warn('Goals not available:', e);
    goals.value = [];
  } finally {
    goalsLoading.value = false;
  }
}

function openNewGoal() {
  editingGoal.value = null;
  showGoalModal.value = true;
}

function editGoal(goal: any) {
  editingGoal.value = goal;
  showGoalModal.value = true;
}

async function onGoalSaved() {
  editingGoal.value = null;
  await loadGoals();
}

async function onGoalDeleted() {
  editingGoal.value = null;
  await loadGoals();
}

async function handleGoalQuickDelete(goal: any) {
  if (!confirm(`Delete "${goal.title}"? This cannot be undone.`)) return;
  try {
    await goalItems.remove(goal.id);
    await loadGoals();
  } catch (e: any) {
    error.value = e?.message || 'Failed to delete goal';
  }
}

// Helpers
const members = computed(() => {
  if (!team.value?.users) return [];
  return (team.value.users as any[])
    .filter(u => u.directus_users_id)
    .map(u => ({
      ...u.directus_users_id,
      isManager: u.is_manager,
    }));
});

const projects = computed(() => {
  if (!team.value?.projects) return [];
  return (team.value.projects as any[]).filter(p => typeof p === 'object');
});

function getAvatarUrl(user: any): string | null {
  if (!user?.avatar) return null;
  const avatarId = typeof user.avatar === 'string' ? user.avatar : user.avatar?.id;
  return avatarId ? `${config.public.directusUrl}/assets/${avatarId}?key=avatar` : null;
}

function getUserInitials(user: any): string {
  const first = user?.first_name?.[0] || '';
  const last = user?.last_name?.[0] || '';
  return (first + last).toUpperCase() || '?';
}

const { isOrgManagerOrAbove } = useOrgRole();

const goalProgress = computed(() => {
  if (!goals.value.length) return 0;
  return Math.round(goals.value.reduce((sum, g) => sum + (g.progress || 0), 0) / goals.value.length);
});

onMounted(loadTeam);

// AI sidebar lifecycle
watch(team, (t) => {
  if (!t) return;
  setEntity('team', String(t.id), t.name || 'Team');
}, { immediate: true });
onUnmounted(() => clearEntity());
</script>

<template>
  <LayoutPageContainer>
    <!-- Loading -->
    <div v-if="loading" class="flex flex-col items-center justify-center py-24 gap-3">
      <Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
      <p class="text-sm text-muted-foreground">Loading team...</p>
    </div>

    <!-- Error -->
    <div v-else-if="error && !team" class="flex flex-col items-center justify-center py-24 gap-4">
      <Icon name="lucide:alert-circle" class="w-10 h-10 text-destructive" />
      <p class="text-sm text-destructive">{{ error }}</p>
      <div class="flex gap-2">
        <Button variant="outline" size="sm" @click="router.push('/organization/teams')">
          <Icon name="lucide:arrow-left" class="w-4 h-4 mr-1" />
          Back to Teams
        </Button>
        <Button size="sm" @click="loadTeam">Retry</Button>
      </div>
    </div>

    <!-- Team Dashboard -->
    <template v-else-if="team">
      <!-- Back link -->
      <NuxtLink
        to="/organization/teams"
        class="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors mt-4 mb-2"
      >
        <Icon name="lucide:chevron-left" class="w-3 h-3" />
        Teams
      </NuxtLink>

      <!-- Header -->
      <div class="flex items-center justify-between mb-5">
        <div class="flex items-center gap-3">
          <div
            v-if="team.icon"
            class="w-10 h-10 rounded-xl overflow-hidden bg-muted shrink-0"
          >
            <img
              :src="`${config.public.directusUrl}/assets/${typeof team.icon === 'string' ? team.icon : team.icon.id}?key=avatar`"
              :alt="team.name"
              class="w-full h-full object-cover"
            />
          </div>
          <div
            v-else
            class="w-10 h-10 rounded-xl bg-muted/60 flex items-center justify-center text-lg font-semibold text-muted-foreground shrink-0"
          >
            {{ (team.name || '?')[0].toUpperCase() }}
          </div>
          <div>
            <h1 class="text-base font-semibold">{{ team.name }}</h1>
            <p class="text-xs text-muted-foreground">{{ members.length }} {{ members.length === 1 ? 'member' : 'members' }}</p>
          </div>
        </div>
        <div class="flex items-center gap-1.5">
          <button
            class="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-border text-xs font-medium text-primary hover:bg-primary/10 hover:border-primary/30 transition-colors"
            @click="sidebarOpen = true"
          >
            <Icon name="lucide:sparkles" class="w-3.5 h-3.5" />
            <span class="hidden sm:inline">Ask Earnest</span>
          </button>
        </div>
      </div>

      <!-- Error banner -->
      <div
        v-if="error"
        class="mb-4 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
      >
        <Icon name="lucide:alert-circle" class="w-4 h-4 shrink-0" />
        {{ error }}
        <button class="ml-auto" @click="error = null"><Icon name="lucide:x" class="w-4 h-4" /></button>
      </div>

      <!-- AI Notices -->
      <ClientOnly>
        <AIProactiveNotices v-if="team?.id" entity-type="team" :entity-id="String(team.id)" />
      </ClientOnly>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Left: Main content -->
        <div class="lg:col-span-2 space-y-4">
          <!-- Description -->
          <div v-if="team.description" class="ios-card p-5">
            <h3 class="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
              <Icon name="lucide:info" class="w-3.5 h-3.5" />
              About
            </h3>
            <p class="text-sm text-muted-foreground leading-relaxed">{{ team.description }}</p>
          </div>

          <!-- Goals -->
          <div class="ios-card p-5">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Icon name="lucide:target" class="w-3.5 h-3.5" />
                Goals
                <span v-if="goals.length" class="text-[10px] text-muted-foreground/60 normal-case tracking-normal">{{ goalProgress }}% avg</span>
              </h3>
              <Button type="button" variant="outline" size="sm" @click="openNewGoal">
                <Icon name="lucide:plus" class="w-3.5 h-3.5 mr-1" />
                Add Goal
              </Button>
            </div>

            <div v-if="goals.length" class="space-y-2">
              <TeamsGoalItem
                v-for="goal in goals"
                :key="goal.id"
                :goal="goal"
                @edit="editGoal"
                @delete="handleGoalQuickDelete"
              />
            </div>
            <div v-else class="text-center py-6 text-sm text-muted-foreground">
              No goals set yet. Add a goal to track team progress.
            </div>
          </div>

          <!-- Team Members -->
          <div class="ios-card p-5">
            <h3 class="text-[10px] uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <Icon name="lucide:users" class="w-3.5 h-3.5" />
              Members
              <span class="text-[10px] text-muted-foreground/60 ml-auto normal-case tracking-normal">{{ members.length }}</span>
            </h3>
            <div class="space-y-2">
              <div
                v-for="member in members"
                :key="member.id"
                class="flex items-center gap-3 p-3 bg-muted/30 rounded-xl"
              >
                <div class="w-8 h-8 rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0">
                  <img
                    v-if="getAvatarUrl(member)"
                    :src="getAvatarUrl(member)!"
                    :alt="member.first_name"
                    class="w-full h-full object-cover"
                  />
                  <span v-else class="text-xs font-medium text-muted-foreground">{{ getUserInitials(member) }}</span>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium truncate">{{ member.first_name }} {{ member.last_name }}</p>
                  <p class="text-xs text-muted-foreground truncate">{{ member.email }}</p>
                </div>
                <span
                  v-if="member.isManager"
                  class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-blue-500/15 text-blue-400"
                >
                  Manager
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Right: Sidebar -->
        <div class="space-y-4">
          <!-- Ticket Stats -->
          <div class="ios-card p-5">
            <h3 class="text-[10px] uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <Icon name="lucide:ticket" class="w-3.5 h-3.5" />
              Tickets
              <span class="text-[10px] text-muted-foreground/60 ml-auto normal-case tracking-normal">{{ ticketStats.total }}</span>
            </h3>
            <div class="space-y-2.5 text-sm">
              <div class="flex justify-between items-center">
                <span class="text-muted-foreground">Pending</span>
                <span class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium" :class="getStatusBadgeClasses('pending')">
                  {{ ticketStats.pending }}
                </span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-muted-foreground">Scheduled</span>
                <span class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium" :class="getStatusBadgeClasses('scheduled')">
                  {{ ticketStats.scheduled }}
                </span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-muted-foreground">In Progress</span>
                <span class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium" :class="getStatusBadgeClasses('in progress')">
                  {{ ticketStats.inProgress }}
                </span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-muted-foreground">Completed</span>
                <span class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium" :class="getStatusBadgeClasses('completed')">
                  {{ ticketStats.completed }}
                </span>
              </div>
            </div>
          </div>

          <!-- Client Assignments -->
          <div class="ios-card p-5">
            <TeamsClientAssignment :teamId="teamId" :canManage="isOrgManagerOrAbove" />
          </div>

          <!-- Projects -->
          <div v-if="projects.length" class="ios-card p-5">
            <h3 class="text-[10px] uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <Icon name="lucide:folder" class="w-3.5 h-3.5" />
              Projects
              <span class="text-[10px] text-muted-foreground/60 ml-auto normal-case tracking-normal">{{ projects.length }}</span>
            </h3>
            <div class="space-y-2">
              <div
                v-for="project in projects"
                :key="project.id"
                class="flex items-center justify-between p-2.5 bg-muted/30 rounded-lg"
              >
                <span class="text-sm truncate">{{ project.title }}</span>
                <span
                  v-if="project.status"
                  class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize"
                  :class="getStatusBadgeClasses(project.status)"
                >
                  {{ project.status }}
                </span>
              </div>
            </div>
          </div>

          <!-- Team Info -->
          <div class="ios-card p-5">
            <h3 class="text-[10px] uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <Icon name="lucide:info" class="w-3.5 h-3.5" />
              Details
            </h3>
            <div class="space-y-2.5 text-sm">
              <div class="flex justify-between">
                <span class="text-muted-foreground">Organization</span>
                <span>{{ team.organization?.name || '\u2014' }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">Members</span>
                <span>{{ members.length }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">Projects</span>
                <span>{{ projects.length }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">Status</span>
                <span class="capitalize">{{ team.active ? 'Active' : 'Inactive' }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Goal Modal -->
      <TeamsGoalFormModal
        v-model="showGoalModal"
        :goal="editingGoal"
        :team-id="teamId"
        @created="onGoalSaved"
        @updated="onGoalSaved"
        @deleted="onGoalDeleted"
      />
    </template>

    <!-- Contextual AI Sidebar -->
    <ClientOnly>
      <AIContextualSidebar
        v-if="sidebarOpen && team?.id"
        entity-type="team"
        :entity-id="String(team.id)"
        :entity-label="team.name || 'Team'"
        @close="closeSidebar"
      />
      <Transition name="overlay">
        <div v-if="sidebarOpen" class="fixed inset-0 bg-black/20 z-40" @click="closeSidebar" />
      </Transition>
    </ClientOnly>
  </LayoutPageContainer>
</template>
