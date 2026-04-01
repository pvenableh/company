<script setup lang="ts">
import type { TimeEntry } from '~/types/directus';
import { Button } from '~/components/ui/button';
import { openTimerDockPanel } from '~/composables/useTimeTrackerModal';
import {
  format,
  startOfWeek,
  endOfWeek,
  isToday as dateFnsIsToday,
  parseISO,
} from 'date-fns';

definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Time Tracker | Earnest' });

const {
  isTimerRunning,
  restoreTimer,
  getTimeEntries,
  deleteTimeEntry,
  formatDuration,
} = useTimeTracker();

const { selectedClient, currentClient } = useClients();
const { isOrgManagerOrAbove } = useOrgRole();

// ── State ───────────────────────────────────────────────────────
const allEntries = ref<TimeEntry[]>([]);
const total = ref(0);
const loading = ref(true);
const activeTab = ref<'today' | 'week' | 'all' | 'team' | 'reports'>('week');
const showManualEntry = ref(false);
const editingEntry = ref<TimeEntry | null>(null);
const page = ref(1);
const limit = 50;
const hasMore = computed(() => page.value * limit < total.value);

// Client context label
const clientLabel = computed(() => {
  if (!currentClient.value || currentClient.value.id === 'org') return null;
  return currentClient.value.name || null;
});

// ── Tabs ────────────────────────────────────────────────────────
const tabs = computed(() => {
  const base = [
    { key: 'today' as const, label: 'Today' },
    { key: 'week' as const, label: 'This Week' },
    { key: 'all' as const, label: 'All Entries' },
  ];
  if (isOrgManagerOrAbove.value) {
    base.push({ key: 'team' as const, label: 'Team' });
  }
  base.push({ key: 'reports' as const, label: 'Reports' });
  return base;
});

// ── Date Filters ────────────────────────────────────────────────
function getDateFilters(): { dateFrom?: string; dateTo?: string } {
  const now = new Date();
  if (activeTab.value === 'today') {
    const todayStr = format(now, 'yyyy-MM-dd');
    return { dateFrom: todayStr, dateTo: todayStr };
  }
  if (activeTab.value === 'week') {
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    return {
      dateFrom: format(weekStart, 'yyyy-MM-dd'),
      dateTo: format(weekEnd, 'yyyy-MM-dd'),
    };
  }
  return {};
}

// ── Fetch ───────────────────────────────────────────────────────
async function fetchEntries() {
  loading.value = true;
  try {
    const dateFilters = getDateFilters();
    const result = await getTimeEntries({
      ...dateFilters,
      status: 'completed',
      sort: ['-date', '-start_time'],
      limit: activeTab.value === 'all' ? limit : 200,
      page: activeTab.value === 'all' ? page.value : 1,
    });
    allEntries.value = result.data;
    total.value = result.total;
  } catch (err) {
    console.error('Failed to fetch time entries:', err);
  } finally {
    loading.value = false;
  }
}

// ── Grouped Entries ─────────────────────────────────────────────
interface DateGroup {
  date: string;
  label: string;
  totalMinutes: number;
  entries: TimeEntry[];
}

const groupedEntries = computed<DateGroup[]>(() => {
  const groups = new Map<string, TimeEntry[]>();

  for (const entry of allEntries.value) {
    const dateKey = entry.date || format(new Date(entry.start_time), 'yyyy-MM-dd');
    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    groups.get(dateKey)!.push(entry);
  }

  const result: DateGroup[] = [];
  for (const [dateKey, entries] of groups) {
    const parsed = parseISO(dateKey);
    const isEntryToday = dateFnsIsToday(parsed);
    const dayName = isEntryToday ? 'Today' : format(parsed, 'EEEE');
    const dateLabel = format(parsed, 'MMM d, yyyy');

    const totalMinutes = entries.reduce(
      (sum, e) => sum + (e.duration_minutes || 0),
      0
    );

    result.push({
      date: dateKey,
      label: `${dayName}, ${dateLabel}`,
      totalMinutes,
      entries,
    });
  }

  return result.sort((a, b) => b.date.localeCompare(a.date));
});

// ── Actions ─────────────────────────────────────────────────────
function editEntry(entry: TimeEntry) {
  editingEntry.value = entry;
  showManualEntry.value = true;
}

function closeForm() {
  showManualEntry.value = false;
  editingEntry.value = null;
}

async function handleSave() {
  closeForm();
  await fetchEntries();
}

async function handleDelete(entry: TimeEntry) {
  if (!confirm('Delete this time entry?')) return;
  try {
    await deleteTimeEntry(entry.id);
    await fetchEntries();
  } catch (err) {
    console.error('Failed to delete time entry:', err);
  }
}

function switchTab(tab: typeof activeTab.value) {
  activeTab.value = tab;
  page.value = 1;
  if (tab !== 'reports' && tab !== 'team') {
    fetchEntries();
  }
}

// ── Lifecycle ───────────────────────────────────────────────────
onMounted(() => {
  restoreTimer();
  fetchEntries();
});

watch(() => selectedClient.value, () => {
  fetchEntries();
});
</script>

<template>
  <div class="p-4 md:p-6 max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-xl font-semibold">
          Time Tracker
          <span
            v-if="total > 0"
            class="ml-2 text-xs bg-muted/60 px-2 py-0.5 rounded-full font-medium text-muted-foreground"
          >
            {{ total }}
          </span>
        </h1>
        <!-- Client context -->
        <p v-if="clientLabel" class="text-xs text-muted-foreground mt-0.5">
          Viewing entries for <span class="font-medium text-foreground">{{ clientLabel }}</span>
        </p>
      </div>
      <div class="flex items-center gap-2">
        <Button variant="outline" size="sm" @click="openTimerDockPanel()">
          <Icon name="lucide:timer" class="w-4 h-4 mr-1" />
          Start Timer
        </Button>
        <Button variant="outline" size="sm" @click="showManualEntry = true">
          <Icon name="lucide:plus" class="w-4 h-4 mr-1" />
          Manual Entry
        </Button>
      </div>
    </div>

    <!-- Stats -->
    <TimeTrackerStats :entries="allEntries" class="mb-6" />

    <!-- Tab Bar -->
    <div class="inline-flex items-center gap-1 rounded-xl bg-muted/50 p-1 border border-border mb-6">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] uppercase tracking-wider font-semibold transition-all duration-200"
        :class="
          activeTab === tab.key
            ? 'bg-card text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        "
        @click="switchTab(tab.key)"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Team Tab (Manager+ only) -->
    <LazyTimeTrackerTeamView v-if="activeTab === 'team'" />

    <!-- Reports Tab -->
    <LazyTimeTrackerReport v-if="activeTab === 'reports'" :team-mode="isOrgManagerOrAbove" />

    <!-- Loading State -->
    <div
      v-else-if="loading && activeTab !== 'team' && activeTab !== 'reports'"
      class="flex flex-col items-center justify-center py-24 gap-3"
    >
      <Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
      <p class="text-sm text-muted-foreground">Loading entries...</p>
    </div>

    <!-- Empty State -->
    <div
      v-else-if="!allEntries.length && activeTab !== 'team' && activeTab !== 'reports'"
      class="flex flex-col items-center justify-center py-24 gap-4"
    >
      <Icon name="lucide:clock" class="w-12 h-12 text-muted-foreground/40" />
      <div class="text-center">
        <p class="text-sm font-medium text-muted-foreground">No time entries</p>
        <p class="text-xs text-muted-foreground/70 mt-1">
          Start a timer or add a manual entry to begin tracking.
        </p>
      </div>
      <Button size="sm" @click="showManualEntry = true">
        <Icon name="lucide:plus" class="w-4 h-4 mr-1" />
        Manual Entry
      </Button>
    </div>

    <!-- Entries List (Today / This Week / All) -->
    <div
      v-else-if="activeTab !== 'team' && activeTab !== 'reports'"
      class="min-h-[400px]"
    >
      <TransitionGroup name="entry-list" tag="div">
        <div v-for="group in groupedEntries" :key="group.date" class="mb-6">
          <!-- Date Header -->
          <div class="flex items-center justify-between mb-3 px-1">
            <h3 class="text-sm font-medium text-muted-foreground">{{ group.label }}</h3>
            <span class="text-xs text-muted-foreground">
              {{ formatDuration(group.totalMinutes) }}
            </span>
          </div>

          <!-- Entries -->
          <div class="space-y-2">
            <TimeTrackerEntryCard
              v-for="entry in group.entries"
              :key="entry.id"
              :entry="entry"
              :show-user="activeTab === 'all'"
              @edit="editEntry"
              @delete="handleDelete"
            />
          </div>
        </div>
      </TransitionGroup>

      <!-- Pagination (All tab only) -->
      <div v-if="activeTab === 'all'" class="flex justify-between items-center mt-4">
        <p class="text-sm text-muted-foreground">
          Showing {{ allEntries.length }} of {{ total }}
        </p>
        <div class="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            :disabled="page === 1"
            @click="page--; fetchEntries()"
          >
            <Icon name="lucide:chevron-left" class="w-4 h-4" />
          </Button>
          <span class="text-sm px-3 py-1">{{ page }}</span>
          <Button
            variant="outline"
            size="sm"
            :disabled="!hasMore"
            @click="page++; fetchEntries()"
          >
            <Icon name="lucide:chevron-right" class="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>

    <!-- Manual Entry Modal -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div
          v-if="showManualEntry"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          @click.self="closeForm"
        >
          <div class="ios-card shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto p-6">
            <h2 class="font-semibold mb-4">
              {{ editingEntry ? 'Edit Entry' : 'Manual Entry' }}
            </h2>
            <TimeTrackerEntryForm
              :show="showManualEntry"
              :entry="editingEntry"
              @save="handleSave"
              @cancel="closeForm"
            />
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
/* Entry list transitions */
.entry-list-enter-active,
.entry-list-leave-active {
  transition: all 0.3s ease;
}
.entry-list-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.entry-list-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
.entry-list-move {
  transition: transform 0.3s ease;
}

/* Modal transitions */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
</style>
