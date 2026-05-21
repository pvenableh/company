<script setup lang="ts">
/**
 * Time floor surface — the Time tracker UI mounted inline on /apps/work
 * (floor `time`). Modernised in retainer/social Phase 2 (2026-05-18) with
 * Clean-Gantt fonts, cg-card-compact stat strip, and pill-segmented tabs
 * that pick up the Work app accent.
 *
 * Owns its own data (entries, selection, modals). The floating timer dock
 * + Start/Manual Entry modals stay globally mounted via the apps layout —
 * this component only owns the listing UI.
 */
import type { TimeEntry } from '~~/shared/directus';
import { openTimerDockPanel } from '~/composables/useTimeTrackerModal';
import {
  format,
  startOfWeek,
  endOfWeek,
  isToday as dateFnsIsToday,
  parseISO,
} from 'date-fns';

const {
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
const activeTab = ref<'today' | 'week' | 'all' | 'team' | 'reports'>('reports');
const showManualEntry = ref(false);
const editingEntry = ref<TimeEntry | null>(null);
const page = ref(1);
const limit = 50;
const hasMore = computed(() => page.value * limit < total.value);

const clientLabel = computed(() => {
  if (!currentClient.value || currentClient.value.id === 'org') return null;
  return currentClient.value.name || null;
});

// ── Tabs ────────────────────────────────────────────────────────
type TabKey = 'today' | 'week' | 'all' | 'team' | 'reports';
const tabs = computed<Array<{ key: TabKey; label: string; icon: string }>>(() => {
  const base: Array<{ key: TabKey; label: string; icon: string }> = [
    { key: 'reports', label: 'Reports', icon: 'lucide:bar-chart-3' },
    { key: 'today', label: 'Today', icon: 'lucide:sun' },
    { key: 'week', label: 'This Week', icon: 'lucide:calendar-days' },
    { key: 'all', label: 'All Entries', icon: 'lucide:list' },
  ];
  if (isOrgManagerOrAbove.value) {
    base.push({ key: 'team', label: 'Team', icon: 'lucide:users' });
  }
  return base;
});

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
    console.error('[TimeSurface] fetch failed', err);
  } finally {
    loading.value = false;
  }
}

// ── Grouped entries ─────────────────────────────────────────────
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
    if (!groups.has(dateKey)) groups.set(dateKey, []);
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
      0,
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
    console.error('[TimeSurface] delete failed', err);
  }
}

function switchTab(tab: TabKey) {
  activeTab.value = tab;
  page.value = 1;
  selectedIds.clear();
  if (tab !== 'reports' && tab !== 'team') {
    fetchEntries();
  }
}

// ── Multi-select for invoice generation ─────────────────────────
const selectedIds = reactive(new Set<string | number>());
const showInvoiceModal = ref(false);

function toggleSelection(entry: TimeEntry) {
  if (selectedIds.has(entry.id)) selectedIds.delete(entry.id);
  else selectedIds.add(entry.id);
}

const unbilledBillableEntries = computed(() =>
  allEntries.value.filter((e) => e.billable && !e.billed),
);

function selectAllUnbilled() {
  for (const e of unbilledBillableEntries.value) selectedIds.add(e.id);
}

const selectedEntries = computed(() =>
  allEntries.value.filter((e) => selectedIds.has(e.id)),
);

const selectedTotalMinutes = computed(() =>
  selectedEntries.value.reduce((sum, e) => sum + (e.duration_minutes || 0), 0),
);

const selectedRevenue = computed(() =>
  selectedEntries.value.reduce((sum, e) => {
    if (!e.billable) return sum;
    const hours = (Number(e.duration_minutes) || 0) / 60;
    const rate = Number(e.hourly_rate) || 0;
    return sum + hours * rate;
  }, 0),
);

function formatHoursLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatRevenue(value: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

const invoiceSlide = useAppSlideOver('invoice');
async function handleInvoiceCreated(invoiceId: string) {
  showInvoiceModal.value = false;
  selectedIds.clear();
  await fetchEntries();
  if (invoiceId) invoiceSlide.open(invoiceId);
}

onMounted(() => {
  restoreTimer();
  fetchEntries();
});

watch(() => selectedClient.value, () => {
  fetchEntries();
});
</script>

<template>
  <div>
    <!-- Toolbar: client context + Start Timer / Manual Entry -->
    <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
      <p v-if="clientLabel" class="cg-text-child text-muted-foreground">
        Viewing entries for <span class="font-medium text-foreground">{{ clientLabel }}</span>
      </p>
      <span v-else />
      <div class="flex items-center gap-1.5 ml-auto">
        <UiActionButton icon="lucide:timer" @click="openTimerDockPanel()">
          <span class="hidden sm:inline">Start Timer</span>
        </UiActionButton>
        <UiActionButton icon="lucide:plus" variant="primary" @click="showManualEntry = true">
          <span class="hidden sm:inline">Manual Entry</span>
        </UiActionButton>
      </div>
    </div>

    <!-- Stats strip -->
    <TimeTrackerStats :entries="allEntries" class="mb-5" />

    <!-- Pill tabs -->
    <div class="time-tabs" role="tablist" aria-label="Time tracker sections">
      <div class="time-tabs__scroller">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          type="button"
          role="tab"
          :aria-selected="activeTab === tab.key"
          class="time-tabs__item"
          :class="{ 'time-tabs__item--active': activeTab === tab.key }"
          @click="switchTab(tab.key)"
        >
          <Icon :name="tab.icon" class="time-tabs__icon" />
          <span class="time-tabs__label">{{ tab.label }}</span>
          <span
            v-if="tab.key === 'all' && total > 0"
            class="time-tabs__count"
          >{{ total }}</span>
        </button>
      </div>
    </div>

    <!-- Team Tab -->
    <LazyTimeTrackerTeamView v-if="activeTab === 'team'" />

    <!-- Reports Tab -->
    <LazyTimeTrackerReport v-else-if="activeTab === 'reports'" :team-mode="isOrgManagerOrAbove" />

    <!-- Loading -->
    <div
      v-else-if="loading"
      class="flex flex-col items-center justify-center py-24 gap-3"
    >
      <Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
      <p class="cg-text-child text-muted-foreground">Loading entries…</p>
    </div>

    <!-- Empty -->
    <div
      v-else-if="!allEntries.length"
      class="flex flex-col items-center justify-center py-24 gap-4"
    >
      <Icon name="lucide:clock" class="w-12 h-12 text-muted-foreground/40" />
      <div class="text-center">
        <p class="text-sm font-medium text-muted-foreground">No time entries</p>
        <p class="cg-text-child text-muted-foreground/70 mt-1">
          Start a timer or add a manual entry to begin tracking.
        </p>
      </div>
      <UiActionButton icon="lucide:plus" variant="primary" @click="showManualEntry = true">
        Manual Entry
      </UiActionButton>
    </div>

    <!-- Entries list -->
    <div v-else class="min-h-[400px]">
      <!-- Selection toolbar -->
      <div
        v-if="unbilledBillableEntries.length > 0 || selectedIds.size > 0"
        class="flex items-center justify-end gap-2 mb-3"
      >
        <UiActionButton
          v-if="unbilledBillableEntries.length > 0 && selectedIds.size === 0"
          @click="selectAllUnbilled"
        >
          Select All Unbilled ({{ unbilledBillableEntries.length }})
        </UiActionButton>
        <UiActionButton
          v-if="selectedIds.size > 0"
          @click="selectedIds.clear()"
        >
          Clear ({{ selectedIds.size }})
        </UiActionButton>
      </div>

      <TransitionGroup name="entry-list" tag="div">
        <div v-for="group in groupedEntries" :key="group.date" class="mb-6">
          <div class="flex items-center justify-between mb-2 px-1">
            <h3 class="cg-text-header">{{ group.label }}</h3>
            <span class="cg-text-child text-muted-foreground tabular-nums">
              {{ formatDuration(group.totalMinutes) }}
            </span>
          </div>
          <div class="space-y-2">
            <TimeTrackerEntryCard
              v-for="entry in group.entries"
              :key="entry.id"
              :entry="entry"
              :show-user="activeTab === 'all'"
              selectable
              :selected="selectedIds.has(entry.id)"
              @select="toggleSelection"
              @edit="editEntry"
              @delete="handleDelete"
            />
          </div>
        </div>
      </TransitionGroup>

      <!-- Selection action bar -->
      <Teleport to="body">
        <Transition name="slide-up">
          <div
            v-if="selectedIds.size > 0"
            class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-card border border-border shadow-xl rounded-2xl px-5 py-3"
          >
            <span class="cg-text-primary">{{ selectedIds.size }} entries selected</span>
            <span class="cg-text-child text-muted-foreground">
              {{ formatHoursLabel(selectedTotalMinutes) }} · ${{ formatRevenue(selectedRevenue) }}
            </span>
            <UiActionButton icon="lucide:file-text" variant="primary" @click="showInvoiceModal = true">
              Generate Invoice
            </UiActionButton>
            <UiActionButton icon="lucide:x" @click="selectedIds.clear()" />
          </div>
        </Transition>
      </Teleport>

      <Teleport to="body">
        <TimeTrackerInvoiceFromTimeModal
          v-if="showInvoiceModal"
          :entries="selectedEntries"
          @close="showInvoiceModal = false"
          @created="handleInvoiceCreated"
        />
      </Teleport>

      <!-- Pagination -->
      <div v-if="activeTab === 'all'" class="flex justify-between items-center mt-4">
        <p class="cg-text-child text-muted-foreground">
          Showing {{ allEntries.length }} of {{ total }}
        </p>
        <div class="flex gap-2">
          <UiActionButton
            icon="lucide:chevron-left"
            :disabled="page === 1"
            @click="page--; fetchEntries()"
          />
          <span class="cg-text-child px-3 py-1">{{ page }}</span>
          <UiActionButton
            icon="lucide:chevron-right"
            :disabled="!hasMore"
            @click="page++; fetchEntries()"
          />
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
@reference "~/assets/css/tailwind.css";

/* Pill-segmented tab strip — mirrors AppFloorStrip's active-pill gradient
 * so this floor reads as part of the same family. Local accent fallback
 * matches the apps shell vars. */
.time-tabs {
  @apply mb-5 flex;
  --accent-h: var(--app-accent-h, 220);
  --accent-s: var(--app-accent-s, 10%);
  --accent-l: var(--app-accent-l, 48%);
}

.time-tabs__scroller {
  @apply inline-flex items-center gap-1 rounded-full
    border border-border bg-card p-0.5
    overflow-x-auto max-w-full;
  scrollbar-width: none;
}

.time-tabs__scroller::-webkit-scrollbar {
  display: none;
}

.time-tabs__item {
  @apply inline-flex items-center gap-1.5 rounded-full
    px-3 py-1 text-xs font-medium whitespace-nowrap
    text-muted-foreground transition-all duration-200
    ease-[cubic-bezier(0.16,1,0.3,1)];
}

.time-tabs__item:hover {
  @apply text-foreground;
  background: hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.08);
}

.time-tabs__icon {
  @apply size-3.5 shrink-0;
  stroke-width: 1.85;
}

.time-tabs__label {
  @apply leading-none;
}

.time-tabs__count {
  @apply ml-1 inline-flex items-center justify-center min-w-[18px] px-1
    rounded-full bg-muted/60 text-[10px] font-semibold leading-[16px]
    text-muted-foreground;
}

.time-tabs__item--active {
  color: white;
  background: linear-gradient(
    135deg,
    hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 8%)),
    hsl(var(--accent-h) var(--accent-s) var(--accent-l))
  );
  box-shadow:
    0 1px 0 0 hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 14%) / 0.5) inset,
    0 4px 10px -6px hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.55);
}

.time-tabs__item--active:hover {
  color: white;
}

.time-tabs__item--active .time-tabs__count {
  @apply bg-white/20 text-white;
}

:global(html[data-chip-mode='neutral']) .time-tabs__item--active,
:global(html[data-surface='glass']) .time-tabs__item--active {
  background: linear-gradient(
    135deg,
    hsl(var(--primary) / 0.92),
    hsl(var(--primary))
  );
  box-shadow:
    0 1px 0 0 hsl(var(--primary) / 0.4) inset,
    0 4px 10px -6px hsl(var(--primary) / 0.55);
}

:global(html[data-chip-mode='neutral']) .time-tabs__item:hover,
:global(html[data-surface='glass']) .time-tabs__item:hover {
  background: hsl(var(--primary) / 0.08);
}

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

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}
.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translate(-50%, 20px);
}
</style>
