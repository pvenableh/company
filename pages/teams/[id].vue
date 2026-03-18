<script setup lang="ts">
import type { Team } from '~/types/directus';
import { Button } from '~/components/ui/button';

definePageMeta({ middleware: ['auth'] });

const route = useRoute();
const router = useRouter();
const teamId = route.params.id as string;
const config = useRuntimeConfig();

const teamItems = useDirectusItems<Team>('teams');
const ticketItems = useDirectusItems('tickets');
const goalItems = useDirectusItems('team_goals');

const team = ref<any>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const ticketStats = ref({ pending: 0, scheduled: 0, inProgress: 0, completed: 0, total: 0 });
const goals = ref<any[]>([]);
const goalsLoading = ref(false);
const showGoalForm = ref(false);
const editingGoal = ref<any>(null);
const goalSaving = ref(false);
const showDeleteGoal = ref(false);
const deletingGoal = ref<any>(null);

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

async function handleGoalSave(data: any) {
  goalSaving.value = true;
  try {
    if (editingGoal.value) {
      await goalItems.update(editingGoal.value.id, data);
    } else {
      await goalItems.create({ ...data, team: teamId });
    }
    showGoalForm.value = false;
    editingGoal.value = null;
    await loadGoals();
  } catch (e: any) {
    error.value = e?.message || 'Failed to save goal';
  } finally {
    goalSaving.value = false;
  }
}

function editGoal(goal: any) {
  editingGoal.value = goal;
  showGoalForm.value = true;
}

async function deleteGoal() {
  if (!deletingGoal.value) return;
  try {
    await goalItems.remove(deletingGoal.value.id);
    showDeleteGoal.value = false;
    deletingGoal.value = null;
    await loadGoals();
  } catch (e: any) {
    error.value = e?.message || 'Failed to delete goal';
  }
}

function confirmDeleteGoal(goal: any) {
  deletingGoal.value = goal;
  showDeleteGoal.value = true;
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

const projectStatusColors: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-400',
  draft: 'bg-yellow-500/15 text-yellow-400',
  archived: 'bg-neutral-500/15 text-neutral-400',
};

const { isOrgManagerOrAbove } = useOrgRole();

const goalProgress = computed(() => {
  if (!goals.value.length) return 0;
  return Math.round(goals.value.reduce((sum, g) => sum + (g.progress || 0), 0) / goals.value.length);
});

onMounted(loadTeam);
</script>

<template>
  <div class="p-6 max-w-5xl mx-auto">
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
      <!-- Header -->
      <div class="flex items-center gap-3 mb-6">
        <NuxtLink
          to="/organization/teams"
          class="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        >
          <Icon name="lucide:arrow-left" class="w-5 h-5" />
        </NuxtLink>
        <div class="flex items-center gap-3">
          <div
            v-if="team.icon"
            class="w-10 h-10 rounded-xl overflow-hidden bg-muted"
          >
            <img
              :src="`${config.public.directusUrl}/assets/${typeof team.icon === 'string' ? team.icon : team.icon.id}?key=avatar`"
              :alt="team.name"
              class="w-full h-full object-cover"
            />
          </div>
          <div
            v-else
            class="w-10 h-10 rounded-xl bg-muted/60 flex items-center justify-center text-lg font-semibold text-muted-foreground"
          >
            {{ (team.name || '?')[0].toUpperCase() }}
          </div>
          <div>
            <h1 class="text-xl font-semibold">{{ team.name }}</h1>
            <p class="text-sm text-muted-foreground">{{ members.length }} members</p>
          </div>
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

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Left: Main content -->
        <div class="lg:col-span-2 space-y-6">
          <!-- Description -->
          <div v-if="team.description" class="ios-card p-5">
            <h3 class="font-medium text-sm mb-2 flex items-center gap-2">
              <Icon name="lucide:info" class="w-4 h-4 text-muted-foreground" />
              About
            </h3>
            <p class="text-sm text-muted-foreground leading-relaxed">{{ team.description }}</p>
          </div>

          <!-- Goals -->
          <div class="ios-card p-5">
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-medium text-sm flex items-center gap-2">
                <Icon name="lucide:target" class="w-4 h-4 text-muted-foreground" />
                Goals
                <span v-if="goals.length" class="text-xs text-muted-foreground/60">{{ goalProgress }}% avg</span>
              </h3>
              <Button type="button" variant="outline" size="sm" @click="editingGoal = null; showGoalForm = true">
                <Icon name="lucide:plus" class="w-3.5 h-3.5 mr-1" />
                Add Goal
              </Button>
            </div>

            <div v-if="showGoalForm" class="mb-4 p-4 bg-muted/20 rounded-xl">
              <TeamsGoalForm
                :goal="editingGoal"
                :saving="goalSaving"
                @save="handleGoalSave"
                @cancel="showGoalForm = false; editingGoal = null"
              />
            </div>

            <div v-if="goals.length" class="space-y-2">
              <TeamsGoalItem
                v-for="goal in goals"
                :key="goal.id"
                :goal="goal"
                @edit="editGoal"
                @delete="confirmDeleteGoal"
              />
            </div>
            <div v-else-if="!showGoalForm" class="text-center py-6 text-sm text-muted-foreground">
              No goals set yet. Add a goal to track team progress.
            </div>
          </div>

          <!-- Team Members -->
          <div class="ios-card p-5">
            <h3 class="font-medium text-sm mb-3 flex items-center gap-2">
              <Icon name="lucide:users" class="w-4 h-4 text-muted-foreground" />
              Members
              <span class="text-xs text-muted-foreground/60 ml-auto">{{ members.length }}</span>
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
            <h3 class="font-medium text-sm mb-3 flex items-center gap-2">
              <Icon name="lucide:ticket" class="w-4 h-4 text-muted-foreground" />
              Tickets
              <span class="text-xs text-muted-foreground/60 ml-auto">{{ ticketStats.total }}</span>
            </h3>
            <div class="space-y-2.5 text-sm">
              <div class="flex justify-between">
                <span class="text-muted-foreground">Pending</span>
                <span class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-yellow-500/15 text-yellow-400">
                  {{ ticketStats.pending }}
                </span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">Scheduled</span>
                <span class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-blue-500/15 text-blue-400">
                  {{ ticketStats.scheduled }}
                </span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">In Progress</span>
                <span class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-purple-500/15 text-purple-400">
                  {{ ticketStats.inProgress }}
                </span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">Completed</span>
                <span class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-emerald-500/15 text-emerald-400">
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
            <h3 class="font-medium text-sm mb-3 flex items-center gap-2">
              <Icon name="lucide:folder" class="w-4 h-4 text-muted-foreground" />
              Projects
              <span class="text-xs text-muted-foreground/60 ml-auto">{{ projects.length }}</span>
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
                  :class="projectStatusColors[project.status] || 'bg-muted text-muted-foreground'"
                >
                  {{ project.status }}
                </span>
              </div>
            </div>
          </div>

          <!-- Team Info -->
          <div class="ios-card p-5">
            <h3 class="font-medium text-sm mb-3 flex items-center gap-2">
              <Icon name="lucide:info" class="w-4 h-4 text-muted-foreground" />
              Details
            </h3>
            <div class="space-y-2.5 text-sm">
              <div class="flex justify-between">
                <span class="text-muted-foreground">Organization</span>
                <span>{{ team.organization?.name || '—' }}</span>
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
    </template>

    <!-- Delete Goal Confirmation -->
    <Teleport to="body">
      <div
        v-if="showDeleteGoal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        @click.self="showDeleteGoal = false"
      >
        <div class="ios-card w-full max-w-md mx-4 p-6 shadow-xl">
          <div class="flex items-start gap-3 mb-4">
            <div class="flex items-center justify-center w-10 h-10 rounded-full bg-destructive/10 shrink-0">
              <Icon name="lucide:alert-triangle" class="w-5 h-5 text-destructive" />
            </div>
            <div>
              <h3 class="font-semibold">Delete Goal</h3>
              <p class="text-sm text-muted-foreground mt-1">
                Delete <strong>{{ deletingGoal?.title }}</strong>? This cannot be undone.
              </p>
            </div>
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" @click="showDeleteGoal = false">Cancel</Button>
            <Button variant="destructive" size="sm" @click="deleteGoal">Delete</Button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
