<script setup lang="ts">
import type { Client } from '~/types/directus';
import { Button } from '~/components/ui/button';
import { useDebounceFn } from '@vueuse/core';
import VueDraggable from 'vuedraggable';

definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Clients | Earnest' });

const router = useRouter();
const config = useRuntimeConfig();
const { getClients, updateClient, updateClientSort, deleteClient: doDelete } = useClients();

// All fetched clients
const allClients = ref<Client[]>([]);
const total = ref(0);
const loading = ref(true);
const search = ref('');
const showCreateModal = ref(false);
const creating = ref(false);

// ── Active / Inactive split ─────────────────────────────────────────────────
const activeStatuses = ['active', 'prospect'];

function isActiveStatus(status: string | undefined | null): boolean {
  return activeStatuses.includes(status || '');
}

// Separate mutable arrays for VueDraggable
const activeClientsList = ref<Client[]>([]);
const inactiveClientsList = ref<Client[]>([]);

/** Re-split allClients into active/inactive refs */
function splitClients() {
  activeClientsList.value = allClients.value.filter(c => isActiveStatus(c.status));
  inactiveClientsList.value = allClients.value.filter(c => !isActiveStatus(c.status));
}

const isDragging = ref(false);
const savingOrder = ref(false);

const fetchData = async () => {
  loading.value = true;
  try {
    const result = await getClients({
      search: search.value || undefined,
      sort: ['sort', 'name'],
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
  if (status === 'active') return 'Active';
  return status || '';
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

// ── Kanban Drag-and-Drop ─────────────────────────────────────────────────────
function onDragStart() {
  isDragging.value = true;
}

async function handleActiveChange(evt: any) {
  isDragging.value = false;

  // An item was added to the active column from inactive
  if (evt.added) {
    const client = evt.added.element as Client;
    savingOrder.value = true;
    try {
      await updateClient(client.id, { status: 'active' });
      client.status = 'active';
    } catch {
      // Revert on failure
      await fetchData();
    } finally {
      savingOrder.value = false;
    }
    return;
  }

  // Items were reordered within the active column
  if (evt.moved) {
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
}

async function handleInactiveChange(evt: any) {
  isDragging.value = false;

  // An item was added to the inactive column from active
  if (evt.added) {
    const client = evt.added.element as Client;
    savingOrder.value = true;
    try {
      await updateClient(client.id, { status: 'inactive' });
      client.status = 'inactive';
    } catch {
      // Revert on failure
      await fetchData();
    } finally {
      savingOrder.value = false;
    }
  }
}

function handleDragEnd() {
  isDragging.value = false;
}

onMounted(() => {
  fetchData();
  fetchActivityCounts();
});
</script>

<template>
  <div class="p-4 md:p-6 max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-xl font-semibold">Clients</h1>
        <p class="text-sm text-muted-foreground">
          {{ activeClientsList.length }} active<span v-if="inactiveClientsList.length">, {{ inactiveClientsList.length }} inactive</span>
        </p>
      </div>
      <Button size="sm" @click="showCreateModal = true">
        <Icon name="lucide:plus" class="w-4 h-4 mr-1" />
        Add Client
      </Button>
    </div>

    <!-- Search -->
    <div class="flex gap-3 mb-6">
      <input
        v-model="search"
        type="search"
        placeholder="Search clients..."
        class="flex-1 min-w-48 rounded-md border bg-background px-3 py-2 text-sm"
        @input="debouncedFetch"
      />
    </div>

    <!-- Saving order indicator -->
    <div v-if="savingOrder" class="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
      <Icon name="lucide:loader-2" class="w-4 h-4 animate-spin" />
      Saving...
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

    <!-- ═══════════ KANBAN BOARD ═══════════ -->
    <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-6">

      <!-- ── Active Column ──────────────────────────────────────────────── -->
      <div class="flex flex-col">
        <div class="flex items-center gap-2 mb-3 px-1">
          <span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
          <h2 class="text-sm font-semibold uppercase tracking-wide">Active</h2>
          <span class="text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full font-medium">
            {{ activeClientsList.length }}
          </span>
        </div>

        <div class="rounded-xl border border-dashed border-emerald-500/20 bg-emerald-500/[0.02] p-3 min-h-[200px] flex-1">
          <VueDraggable
            v-model="activeClientsList"
            item-key="id"
            group="clients"
            handle=".drag-handle"
            ghost-class="opacity-40"
            chosen-class="ring-2 ring-emerald-500/40"
            drag-class="shadow-xl"
            :animation="200"
            :force-fallback="true"
            class="space-y-3 min-h-[120px]"
            @start="onDragStart"
            @end="handleDragEnd"
            @change="handleActiveChange"
          >
            <template #item="{ element: client }">
              <div
                class="ios-card p-4 cursor-pointer hover:ring-1 hover:ring-white/10 transition-all relative group"
                @click="viewClient(client)"
              >
                <div class="flex items-start gap-3">
                  <!-- Drag Handle -->
                  <div
                    class="drag-handle shrink-0 flex items-center justify-center w-5 self-stretch -ml-1 cursor-grab active:cursor-grabbing text-muted-foreground/20 hover:text-muted-foreground/60 transition-colors"
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
                    <div v-if="getPrimaryContactName(client)" class="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                      <Icon name="lucide:user" class="w-3 h-3 shrink-0" />
                      <span class="truncate">{{ getPrimaryContactName(client) }}</span>
                    </div>
                  </div>
                </div>

                <!-- Tags -->
                <div v-if="client.tags?.length" class="flex flex-wrap gap-1 mt-2.5 ml-8">
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
                  class="flex items-center gap-3 mt-2.5 ml-8"
                >
                  <div
                    class="flex items-center gap-1 text-[10px]"
                    :class="activityColors[getActivityLevel(client.id)]"
                  >
                    <Icon name="lucide:folder" class="w-3 h-3" />
                    <span class="font-medium">{{ getClientActivity(client.id).projects }}</span>
                  </div>
                  <div
                    class="flex items-center gap-1 text-[10px]"
                    :class="activityColors[getActivityLevel(client.id)]"
                  >
                    <Icon name="lucide:ticket" class="w-3 h-3" />
                    <span class="font-medium">{{ getClientActivity(client.id).tickets }}</span>
                  </div>
                </div>
              </div>
            </template>
          </VueDraggable>

          <!-- Empty active column -->
          <div v-if="!activeClientsList.length" class="flex flex-col items-center justify-center py-12 text-muted-foreground/50">
            <Icon name="lucide:arrow-left-right" class="w-8 h-8 mb-2" />
            <p class="text-xs">Drag clients here to activate</p>
          </div>
        </div>
      </div>

      <!-- ── Inactive Column ────────────────────────────────────────────── -->
      <div class="flex flex-col">
        <div class="flex items-center gap-2 mb-3 px-1">
          <span class="w-2.5 h-2.5 rounded-full bg-neutral-400 dark:bg-neutral-500"></span>
          <h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Inactive</h2>
          <span class="text-xs bg-muted/60 text-muted-foreground px-2 py-0.5 rounded-full font-medium">
            {{ inactiveClientsList.length }}
          </span>
        </div>

        <div class="rounded-xl border border-dashed border-border/40 bg-muted/[0.02] p-3 min-h-[200px] flex-1">
          <VueDraggable
            v-model="inactiveClientsList"
            item-key="id"
            group="clients"
            handle=".drag-handle"
            ghost-class="opacity-40"
            chosen-class="ring-2 ring-neutral-400/40"
            drag-class="shadow-xl"
            :animation="200"
            :force-fallback="true"
            class="space-y-3 min-h-[120px]"
            @start="onDragStart"
            @end="handleDragEnd"
            @change="handleInactiveChange"
          >
            <template #item="{ element: client }">
              <div
                class="ios-card p-4 cursor-pointer hover:ring-1 hover:ring-white/10 transition-all opacity-60 hover:opacity-90 group"
                @click="viewClient(client)"
              >
                <div class="flex items-start gap-3">
                  <!-- Drag Handle -->
                  <div
                    class="drag-handle shrink-0 flex items-center justify-center w-5 self-stretch -ml-1 cursor-grab active:cursor-grabbing text-muted-foreground/20 hover:text-muted-foreground/60 transition-colors"
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
                </div>

                <!-- Contact -->
                <div v-if="getPrimaryContactName(client)" class="flex items-center gap-1.5 mt-2 ml-8 text-xs text-muted-foreground/60">
                  <Icon name="lucide:user" class="w-3 h-3 shrink-0" />
                  <span class="truncate">{{ getPrimaryContactName(client) }}</span>
                </div>
              </div>
            </template>
          </VueDraggable>

          <!-- Empty inactive column -->
          <div v-if="!inactiveClientsList.length" class="flex flex-col items-center justify-center py-12 text-muted-foreground/30">
            <Icon name="lucide:archive" class="w-8 h-8 mb-2" />
            <p class="text-xs">No inactive clients</p>
          </div>
        </div>
      </div>
    </div>

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
