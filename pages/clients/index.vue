<script setup lang="ts">
import type { Client } from '~/types/directus';
import { Button } from '~/components/ui/button';
import { useDebounceFn } from '@vueuse/core';
import VueDraggable from 'vuedraggable';

definePageMeta({ middleware: ['auth'] });

const router = useRouter();
const config = useRuntimeConfig();
const { getClients, updateClient, updateClientSort, deleteClient: doDelete } = useClients();

// All fetched clients
const allClients = ref<Client[]>([]);
// Active/prospect clients — regular ref for VueDraggable compatibility
const activeClientsList = ref<Client[]>([]);
const total = ref(0);
const loading = ref(true);
const search = ref('');
const showCreateModal = ref(false);
const creating = ref(false);
const showInactive = ref(false);

// ── Active / Inactive split ─────────────────────────────────────────────────
const activeStatuses = ['active', 'prospect'];

function isActiveStatus(status: string | undefined | null): boolean {
  return activeStatuses.includes(status || '');
}

const inactiveClients = computed(() =>
  allClients.value.filter(c => !isActiveStatus(c.status))
);

/** Re-split allClients into active/inactive refs */
function splitClients() {
  activeClientsList.value = allClients.value.filter(c => isActiveStatus(c.status));
}

// ── Sorting ──────────────────────────────────────────────────────────────────
const sortBy = ref('sort,name');

const sortOptions = [
  { label: 'Custom Order', value: 'sort,name' },
  { label: 'Name A→Z', value: 'name' },
  { label: 'Name Z→A', value: '-name' },
  { label: 'Newest First', value: '-date_created' },
  { label: 'Recently Updated', value: '-date_updated' },
];

const isCustomOrder = computed(() => sortBy.value === 'sort,name');
const isDragging = ref(false);
const savingOrder = ref(false);

const fetchData = async () => {
  loading.value = true;
  try {
    const result = await getClients({
      search: search.value || undefined,
      sort: sortBy.value.split(','),
      limit: 200,
      page: 1,
    });
    allClients.value = result.data;
    total.value = result.total;
    splitClients();
  } finally {
    loading.value = false;
  }
};

const debouncedFetch = useDebounceFn(fetchData, 300);

function viewClient(client: Client) {
  if (isDragging.value) return;
  router.push(`/clients/${client.id}`);
}

async function handleDelete(client: Client) {
  if (!confirm(`Delete ${client.name}?`)) return;
  await doDelete(client.id);
  await fetchData();
}

const togglingIds = ref<Set<string>>(new Set());

async function toggleStatus(client: Client, newStatus: string) {
  const oldStatus = client.status;
  // Optimistic update — card moves between sections instantly
  client.status = newStatus;

  // Move between active/inactive lists
  if (isActiveStatus(newStatus) && !isActiveStatus(oldStatus)) {
    // Inactive → Active: add to activeClientsList
    activeClientsList.value = [...activeClientsList.value, client];
  } else if (!isActiveStatus(newStatus) && isActiveStatus(oldStatus)) {
    // Active → Inactive: remove from activeClientsList
    activeClientsList.value = activeClientsList.value.filter(c => c.id !== client.id);
  }

  togglingIds.value.add(client.id);
  try {
    await updateClient(client.id, { status: newStatus });
  } catch {
    // Revert
    client.status = oldStatus;
    splitClients();
  } finally {
    togglingIds.value.delete(client.id);
  }
}

const { createClient } = useClients();

async function handleCreate(data: any) {
  creating.value = true;
  try {
    await createClient(data);
    showCreateModal.value = false;
    await fetchData();
  } finally {
    creating.value = false;
  }
}

function getLogoUrl(client: Client): string | null {
  if (!client.logo) return null;
  const fileId = typeof client.logo === 'string' ? client.logo : client.logo?.id;
  if (!fileId) return null;
  // Use fit=contain to preserve aspect ratio (no cropping)
  return `${config.public.directusUrl}/assets/${fileId}?key=medium-contain`;
}

function getInitial(name: string): string {
  return name?.charAt(0)?.toUpperCase() || '?';
}

function getPrimaryContactName(client: Client): string | null {
  if (!client.primary_contact || typeof client.primary_contact === 'string') return null;
  const c = client.primary_contact as any;
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || null;
}

function getStatusLabel(status: string): string {
  if (status === 'prospect') return 'Prospect';
  if (status === 'churned') return 'Churned';
  if (status === 'inactive') return 'Inactive';
  return '';
}

// ── Activity Counts ──────────────────────────────────────────────────────────
const { selectedOrg } = useOrganization();
const projectItems = useDirectusItems('projects');
const ticketItems = useDirectusItems('tickets');

const activityCounts = ref<Record<string, { projects: number; tickets: number }>>({});

async function fetchActivityCounts() {
  if (!selectedOrg.value) return;

  try {
    const [projectData, ticketData] = await Promise.all([
      projectItems.aggregate({
        aggregate: { count: ['id'] },
        groupBy: ['client'],
        filter: { organization: { _eq: selectedOrg.value } },
      }),
      ticketItems.aggregate({
        aggregate: { count: ['id'] },
        groupBy: ['client'],
        filter: { organization: { _eq: selectedOrg.value } },
      }),
    ]);

    const counts: Record<string, { projects: number; tickets: number }> = {};

    for (const row of (projectData || [])) {
      const clientId = row.client as string;
      if (clientId) {
        if (!counts[clientId]) counts[clientId] = { projects: 0, tickets: 0 };
        counts[clientId].projects = Number(row.count?.id || row.count) || 0;
      }
    }

    for (const row of (ticketData || [])) {
      const clientId = row.client as string;
      if (clientId) {
        if (!counts[clientId]) counts[clientId] = { projects: 0, tickets: 0 };
        counts[clientId].tickets = Number(row.count?.id || row.count) || 0;
      }
    }

    activityCounts.value = counts;
  } catch (err) {
    console.error('Failed to fetch activity counts:', err);
  }
}

function getClientActivity(clientId: string) {
  return activityCounts.value[clientId] || { projects: 0, tickets: 0 };
}

function getActivityLevel(clientId: string): 'high' | 'medium' | 'low' | 'none' {
  const activity = getClientActivity(clientId);
  const total = activity.projects + activity.tickets;
  if (total === 0) return 'none';

  const allTotals = Object.values(activityCounts.value)
    .map(a => a.projects + a.tickets)
    .filter(t => t > 0)
    .sort((a, b) => a - b);

  if (!allTotals.length) return 'low';

  const p75 = allTotals[Math.floor(allTotals.length * 0.75)] || 1;
  const p25 = allTotals[Math.floor(allTotals.length * 0.25)] || 0;

  if (total >= p75) return 'high';
  if (total > p25) return 'medium';
  return 'low';
}

const activityColors: Record<string, string> = {
  high: 'text-emerald-500',
  medium: 'text-amber-500',
  low: 'text-muted-foreground/60',
  none: 'text-muted-foreground/30',
};

// ── Drag-and-Drop ────────────────────────────────────────────────────────────
function onDragStart() {
  isDragging.value = true;
}

async function handleDragEnd() {
  isDragging.value = false;
  savingOrder.value = true;
  try {
    await Promise.all(
      activeClientsList.value.map((client, index) =>
        updateClientSort(client.id, index)
      )
    );
  } catch (err) {
    console.error('Failed to save client order:', err);
    await fetchData();
  } finally {
    savingOrder.value = false;
  }
}

function onSortChange() {
  fetchData();
}

onMounted(() => {
  fetchData();
  fetchActivityCounts();
});
</script>

<template>
  <div class="p-6 max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-xl font-semibold">Clients</h1>
        <p class="text-sm text-muted-foreground">
          {{ activeClientsList.length }} active<span v-if="inactiveClients.length">, {{ inactiveClients.length }} inactive</span>
        </p>
      </div>
      <Button size="sm" @click="showCreateModal = true">
        <Icon name="lucide:plus" class="w-4 h-4 mr-1" />
        Add Client
      </Button>
    </div>

    <!-- Filters -->
    <div class="flex gap-3 mb-6 flex-wrap">
      <input
        v-model="search"
        type="search"
        placeholder="Search clients..."
        class="flex-1 min-w-48 rounded-md border bg-background px-3 py-2 text-sm"
        @input="debouncedFetch"
      />
      <select
        v-model="sortBy"
        @change="onSortChange"
        class="rounded-md border bg-background px-3 py-2 text-sm w-48"
      >
        <option v-for="opt in sortOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
      </select>
    </div>

    <!-- Saving order indicator -->
    <div v-if="savingOrder" class="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
      <Icon name="lucide:loader-2" class="w-4 h-4 animate-spin" />
      Saving order...
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="flex flex-col items-center justify-center py-24 gap-3">
      <Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
      <p class="text-sm text-muted-foreground">Loading clients...</p>
    </div>

    <!-- Empty State -->
    <div v-else-if="!allClients.length" class="flex flex-col items-center justify-center py-24 gap-4">
      <Icon name="lucide:building-2" class="w-12 h-12 text-muted-foreground/40" />
      <div class="text-center">
        <p class="text-sm font-medium text-muted-foreground">No clients found</p>
        <p class="text-xs text-muted-foreground/70 mt-1">
          {{ search ? 'Try adjusting your search.' : 'Add your first client to get started.' }}
        </p>
      </div>
      <Button v-if="!search" size="sm" @click="showCreateModal = true">
        <Icon name="lucide:plus" class="w-4 h-4 mr-1" />
        Add Client
      </Button>
    </div>

    <template v-else>
      <!-- ═══════════ ACTIVE CLIENTS ═══════════ -->
      <VueDraggable
        v-if="activeClientsList.length"
        v-model="activeClientsList"
        item-key="id"
        :disabled="!isCustomOrder"
        handle=".drag-handle"
        ghost-class="opacity-50"
        chosen-class="ring-2 ring-[var(--cyan)]"
        drag-class="shadow-xl"
        :animation="200"
        :force-fallback="true"
        class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
        @start="onDragStart"
        @end="handleDragEnd"
      >
        <template #item="{ element: client }">
          <div
            class="ios-card p-5 cursor-pointer hover:ring-1 hover:ring-white/10 transition-all relative"
            @click="viewClient(client)"
          >
            <div class="flex items-start gap-3 mb-3">
              <!-- Drag Handle -->
              <div
                v-if="isCustomOrder"
                class="drag-handle shrink-0 flex items-center justify-center w-5 self-stretch -ml-2 cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground transition-colors"
                @click.stop.prevent
                @mousedown.stop
              >
                <Icon name="lucide:grip-vertical" class="w-4 h-4" />
              </div>

              <!-- Logo / Initial -->
              <div class="shrink-0">
                <img
                  v-if="getLogoUrl(client)"
                  :src="getLogoUrl(client)!"
                  :alt="client.name"
                  class="w-10 h-10 rounded-lg object-contain bg-white"
                />
                <div
                  v-else
                  class="w-10 h-10 rounded-lg bg-muted/60 flex items-center justify-center text-sm font-semibold text-muted-foreground"
                >
                  {{ getInitial(client.name) }}
                </div>
              </div>
              <div class="min-w-0 flex-1">
                <h3 class="text-sm font-medium truncate">{{ client.name }}</h3>
                <span
                  v-if="client.status === 'prospect'"
                  class="inline-block text-[9px] uppercase tracking-wider font-medium text-amber-500 mt-0.5"
                >
                  Prospect
                </span>
              </div>
              <StatusSwitch
                :model-value="client.status || 'inactive'"
                :loading="togglingIds.has(client.id)"
                @update:model-value="toggleStatus(client, $event)"
              />
            </div>

            <!-- Details -->
            <div class="space-y-1.5 text-xs text-muted-foreground">
              <div v-if="getPrimaryContactName(client)" class="flex items-center gap-1.5">
                <Icon name="lucide:user" class="w-3.5 h-3.5 shrink-0" />
                <span class="truncate">{{ getPrimaryContactName(client) }}</span>
              </div>
              <div v-if="client.website" class="flex items-center gap-1.5">
                <Icon name="lucide:globe" class="w-3.5 h-3.5 shrink-0" />
                <a
                  :href="client.website"
                  target="_blank"
                  class="truncate hover:text-foreground transition-colors"
                  @click.stop
                >
                  {{ client.website.replace(/^https?:\/\//, '') }}
                </a>
              </div>
            </div>

            <!-- Tags -->
            <div v-if="client.tags?.length" class="flex flex-wrap gap-1 mt-3">
              <span
                v-for="tag in client.tags.slice(0, 3)"
                :key="tag"
                class="inline-flex items-center rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground"
              >
                {{ tag }}
              </span>
              <span v-if="client.tags.length > 3" class="text-[10px] text-muted-foreground/60 self-center">
                +{{ client.tags.length - 3 }}
              </span>
            </div>

            <!-- Activity Indicators -->
            <div
              v-if="getClientActivity(client.id).projects > 0 || getClientActivity(client.id).tickets > 0"
              class="flex items-center gap-3 mt-3 pt-3 border-t border-border/30"
            >
              <div
                class="flex items-center gap-1 text-[10px]"
                :class="activityColors[getActivityLevel(client.id)]"
                :title="`${getClientActivity(client.id).projects} projects`"
              >
                <Icon name="lucide:folder" class="w-3 h-3" />
                <span class="font-medium">{{ getClientActivity(client.id).projects }}</span>
              </div>
              <div
                class="flex items-center gap-1 text-[10px]"
                :class="activityColors[getActivityLevel(client.id)]"
                :title="`${getClientActivity(client.id).tickets} tickets`"
              >
                <Icon name="lucide:ticket" class="w-3 h-3" />
                <span class="font-medium">{{ getClientActivity(client.id).tickets }}</span>
              </div>
            </div>
          </div>
        </template>
      </VueDraggable>

      <!-- No active clients message (when search returns only inactive) -->
      <div v-else-if="inactiveClients.length" class="text-center py-12">
        <p class="text-sm text-muted-foreground">No active clients match your search.</p>
      </div>

      <!-- ═══════════ INACTIVE / CHURNED CLIENTS ═══════════ -->
      <div v-if="inactiveClients.length" class="mt-8">
        <button
          class="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4 group"
          @click="showInactive = !showInactive"
        >
          <Icon
            name="lucide:chevron-right"
            class="w-4 h-4 transition-transform duration-200"
            :class="{ 'rotate-90': showInactive }"
          />
          <span class="font-medium">Inactive &amp; Churned</span>
          <span class="text-xs bg-muted/60 px-2 py-0.5 rounded-full">{{ inactiveClients.length }}</span>
        </button>

        <Transition
          enter-active-class="transition-all duration-300 ease-out"
          enter-from-class="opacity-0 -translate-y-2 max-h-0"
          enter-to-class="opacity-100 translate-y-0 max-h-[2000px]"
          leave-active-class="transition-all duration-200 ease-in"
          leave-from-class="opacity-100 translate-y-0 max-h-[2000px]"
          leave-to-class="opacity-0 -translate-y-2 max-h-0"
        >
          <div v-show="showInactive" class="overflow-hidden">
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div
                v-for="client in inactiveClients"
                :key="client.id"
                class="ios-card p-5 cursor-pointer hover:ring-1 hover:ring-white/10 transition-all opacity-60 hover:opacity-90"
                @click="viewClient(client)"
              >
                <div class="flex items-start gap-3 mb-3">
                  <!-- Logo / Initial -->
                  <div class="shrink-0">
                    <img
                      v-if="getLogoUrl(client)"
                      :src="getLogoUrl(client)!"
                      :alt="client.name"
                      class="w-10 h-10 rounded-lg object-contain bg-white grayscale"
                    />
                    <div
                      v-else
                      class="w-10 h-10 rounded-lg bg-muted/40 flex items-center justify-center text-sm font-semibold text-muted-foreground/50"
                    >
                      {{ getInitial(client.name) }}
                    </div>
                  </div>
                  <div class="min-w-0 flex-1">
                    <h3 class="text-sm font-medium truncate text-muted-foreground">{{ client.name }}</h3>
                    <span class="inline-block text-[9px] uppercase tracking-wider font-medium text-muted-foreground/60 mt-0.5">
                      {{ getStatusLabel(client.status || 'inactive') }}
                    </span>
                  </div>
                  <StatusSwitch
                    :model-value="client.status || 'inactive'"
                    :loading="togglingIds.has(client.id)"
                    @update:model-value="toggleStatus(client, $event)"
                  />
                </div>

                <!-- Details -->
                <div class="space-y-1.5 text-xs text-muted-foreground/60">
                  <div v-if="getPrimaryContactName(client)" class="flex items-center gap-1.5">
                    <Icon name="lucide:user" class="w-3.5 h-3.5 shrink-0" />
                    <span class="truncate">{{ getPrimaryContactName(client) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </template>

    <!-- Create Modal -->
    <Teleport to="body">
      <div v-if="showCreateModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" @click.self="showCreateModal = false">
        <div class="ios-card shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto p-6">
          <h2 class="font-semibold mb-4">New Client</h2>
          <ClientsClientForm :saving="creating" @save="handleCreate" @cancel="showCreateModal = false" />
        </div>
      </div>
    </Teleport>
  </div>
</template>
