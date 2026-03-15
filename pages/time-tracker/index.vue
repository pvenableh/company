<script setup lang="ts">
import type { TimeEntry } from '~/types/directus';
import { Button } from '~/components/ui/button';
import {
  format,
  startOfWeek,
  endOfWeek,
  isToday as dateFnsIsToday,
  parseISO,
} from 'date-fns';

definePageMeta({ middleware: ['auth'] });

const {
  isTimerRunning,
  restoreTimer,
  getTimeEntries,
  createManualEntry,
  updateTimeEntry,
  deleteTimeEntry,
  formatDuration,
} = useTimeTracker();

const { selectedClient } = useClients();

// ── State ───────────────────────────────────────────────────────
const allEntries = ref<TimeEntry[]>([]);
const total = ref(0);
const loading = ref(true);
const activeTab = ref<'today' | 'week' | 'all'>('today');
const showManualEntry = ref(false);
const editingEntry = ref<TimeEntry | null>(null);
const page = ref(1);
const limit = 50;
const hasMore = computed(() => page.value * limit < total.value);

// ── Tabs ────────────────────────────────────────────────────────
const tabs = [
  { key: 'today' as const, label: 'Today' },
  { key: 'week' as const, label: 'This Week' },
  { key: 'all' as const, label: 'All Entries' },
];

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

async function handleSave(data: any) {
  try {
    if (editingEntry.value) {
      await updateTimeEntry(editingEntry.value.id, data);
    } else {
      await createManualEntry(data);
    }
    closeForm();
    await fetchEntries();
  } catch (err) {
    console.error('Failed to save time entry:', err);
  }
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

function switchTab(tab: 'today' | 'week' | 'all') {
  activeTab.value = tab;
  page.value = 1;
  fetchEntries();
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
      </div>
      <Button variant="outline" size="sm" @click="showManualEntry = true">
        <Icon name="lucide:plus" class="w-4 h-4 mr-1" />
        Manual Entry
      </Button>
    </div>

    <!-- Active Timer / Start Form -->
    <div class="mb-6">
      <TimeTrackerActiveTimer v-if="isTimerRunning" @stopped="fetchEntries" />
      <TimeTrackerStartForm v-else @started="fetchEntries" />
    </div>

    <!-- Stats -->
    <TimeTrackerStats :entries="allEntries" class="mb-6" />

    <!-- Tab Bar -->
    <div class="flex gap-1 mb-6 bg-muted/30 rounded-lg p-1 w-fit">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="text-sm px-3 py-1.5 rounded-lg transition-colors"
        :class="
          activeTab === tab.key
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground'
        "
        @click="switchTab(tab.key)"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="flex flex-col items-center justify-center py-24 gap-3">
      <Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
      <p class="text-sm text-muted-foreground">Loading entries...</p>
    </div>

    <!-- Empty State -->
    <div
      v-else-if="!allEntries.length"
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

    <!-- Entries List -->
    <template v-else>
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
            @edit="editEntry"
            @delete="handleDelete"
          />
        </div>
      </div>

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
    </template>

    <!-- Manual Entry Modal -->
    <Teleport to="body">
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
    </Teleport>
  </div>
</template>
