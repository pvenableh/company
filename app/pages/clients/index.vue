<script setup lang="ts">
import type { Client } from '~~/shared/directus';
import { Button } from '~/components/ui/button';
import { useDebounceFn } from '@vueuse/core';

definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Clients | Earnest' });

const router = useRouter();
const config = useRuntimeConfig();
const { getClients, deleteClient: doDelete } = useClients();

const allClients = ref<Client[]>([]);
const total = ref(0);
const loading = ref(true);
const search = ref('');
const showCreateModal = ref(false);
const deleteTarget = ref<Client | null>(null);

// ── Status Tabs ──────────────────────────────────────────────────────────────
// Tabs filter by `account_state` (relationship state) for Active/Prospects/Inactive/Churned,
// and by lifecycle `status` for Archived.
const activeTab = ref('active');
const tabs = [
  { label: 'Active', value: 'active', color: 'bg-emerald-500', kind: 'accountState' as const },
  { label: 'Prospects', value: 'prospect', color: 'bg-amber-500', kind: 'accountState' as const },
  { label: 'Inactive', value: 'inactive', color: 'bg-neutral-400', kind: 'accountState' as const },
  { label: 'Churned', value: 'churned', color: 'bg-red-500', kind: 'accountState' as const },
  { label: 'Archived', value: 'archived', color: 'bg-zinc-400', kind: 'status' as const },
];

const tabItems = computed(() => tabs.map((t) => ({
  key: t.value,
  label: t.label,
  dotColor: t.color,
  count: tabCounts.value[t.value] ?? null,
})));

function tabFilter(value: string): { status?: string; accountState?: string } {
  const tab = tabs.find((t) => t.value === value);
  if (!tab) return {};
  return tab.kind === 'status' ? { status: value } : { accountState: value };
}

const { getStatusBadgeClasses } = useStatusStyle();

// ── Sorting ──────────────────────────────────────────────────────────────────
const sortBy = ref('sort,name');
const sortOptions = [
  { label: 'Custom Order', value: 'sort,name' },
  { label: 'Name (A→Z)', value: 'name' },
  { label: 'Name (Z→A)', value: '-name' },
  { label: 'Recently Created', value: '-date_created' },
];

// ── Tab counts ───────────────────────────────────────────────────────────────
const tabCounts = ref<Record<string, number>>({});

async function fetchTabCounts() {
  try {
    const results = await Promise.all(
      tabs.map(tab =>
        getClients({ ...tabFilter(tab.value), limit: 1, page: 1 })
      )
    );
    const counts: Record<string, number> = {};
    tabs.forEach((tab, i) => {
      counts[tab.value] = results[i].total;
    });
    tabCounts.value = counts;
  } catch {
    // Non-fatal
  }
}

// ── Data Fetching ────────────────────────────────────────────────────────────
const fetchData = async () => {
  loading.value = true;
  try {
    const sortFields = sortBy.value.split(',');
    const result = await getClients({
      search: search.value || undefined,
      ...tabFilter(activeTab.value),
      sort: sortFields,
      limit: 200,
      page: 1,
    });
    allClients.value = result.data;
    total.value = result.total;
  } finally {
    loading.value = false;
  }
};

const debouncedFetch = useDebounceFn(fetchData, 300);

function switchTab(tab: string) {
  activeTab.value = tab;
  fetchData();
}

function viewClient(client: Client) {
  router.push(`/clients/${client.id}`);
}

async function onClientCreated() {
  await Promise.all([fetchData(), fetchTabCounts()]);
}

async function confirmDelete() {
  if (!deleteTarget.value) return;
  try {
    await doDelete(deleteTarget.value.id);
    allClients.value = allClients.value.filter(c => c.id !== deleteTarget.value!.id);
    total.value = Math.max(0, total.value - 1);
    await fetchTabCounts();
  } catch (err) {
    console.error('Failed to delete client:', err);
  } finally {
    deleteTarget.value = null;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
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

onMounted(() => {
  fetchData();
  fetchTabCounts();
  fetchActivityCounts();
  if (router.currentRoute.value.query.new === '1') {
    showCreateModal.value = true;
    router.replace({ query: {} });
  }
});
</script>

<template>
  <LayoutPageContainer>
    <LayoutPageHeader title="Clients" :subtitle="`${total} ${activeTab}`">
      <template #actions>
        <Button size="sm" @click="showCreateModal = true">
          <Icon name="lucide:plus" class="w-4 h-4 mr-1" />
          Add Client
        </Button>
      </template>
    </LayoutPageHeader>

    <!-- Status Tabs -->
    <UTabs
      v-model="activeTab"
      :items="tabItems"
      class="mb-6 w-fit"
      @change="fetchData"
    />

    <!-- Filters -->
    <div class="flex gap-3 mb-6 flex-wrap items-center">
      <input
        v-model="search"
        type="search"
        placeholder="Search clients..."
        class="flex-1 min-w-48 rounded-md border bg-background px-3 py-2 text-sm"
        @input="debouncedFetch"
      />
      <select
        v-model="sortBy"
        @change="fetchData"
        class="rounded-md border bg-background px-3 py-2 text-sm w-48"
      >
        <option v-for="opt in sortOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
      </select>
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
        <p class="text-sm font-medium text-muted-foreground">No {{ activeTab }} clients found</p>
        <p class="text-xs text-muted-foreground/70 mt-1">
          {{ search ? 'Try adjusting your search.' : 'No clients with this status yet.' }}
        </p>
      </div>
      <Button v-if="!search && activeTab === 'active'" size="sm" @click="showCreateModal = true">
        <Icon name="lucide:plus" class="w-4 h-4 mr-1" />
        Add Client
      </Button>
    </div>

    <!-- Table -->
    <div v-else class="ios-card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-border/50">
              <th class="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Client</th>
              <th class="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Status</th>
              <th class="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Contact</th>
              <th class="text-center py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Projects</th>
              <th class="text-center py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Tickets</th>
              <th class="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Tags</th>
              <th class="text-right py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider w-24"></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="client in allClients"
              :key="client.id"
              class="border-b border-border/30 last:border-b-0 hover:bg-muted/20 cursor-pointer transition-colors"
              :class="{ 'opacity-50': client.account_state === 'inactive' || client.account_state === 'churned' || client.status === 'archived' }"
              @click="viewClient(client)"
            >
              <!-- Client Name + Logo -->
              <td class="py-3 px-4">
                <div class="flex items-center gap-3">
                  <div class="shrink-0">
                    <img
                      v-if="getLogoUrl(client)"
                      :src="getLogoUrl(client)!"
                      :alt="client.name"
                      class="w-8 h-8 rounded-lg object-contain bg-white"
                    />
                    <div
                      v-else
                      class="w-8 h-8 rounded-lg bg-muted/60 flex items-center justify-center text-xs font-semibold text-muted-foreground"
                    >
                      {{ getInitial(client.name) }}
                    </div>
                  </div>
                  <span class="font-medium truncate max-w-[200px]">{{ client.name }}</span>
                </div>
              </td>

              <!-- Status -->
              <td class="py-3 px-4">
                <span
                  class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize"
                  :class="getStatusBadgeClasses(client.account_state || 'active')"
                >
                  {{ client.account_state || 'active' }}
                </span>
              </td>

              <!-- Primary Contact -->
              <td class="py-3 px-4 text-muted-foreground">
                {{ getPrimaryContactName(client) || '—' }}
              </td>

              <!-- Projects -->
              <td class="py-3 px-4 text-center text-muted-foreground">
                {{ getClientActivity(client.id).projects }}
              </td>

              <!-- Tickets -->
              <td class="py-3 px-4 text-center text-muted-foreground">
                {{ getClientActivity(client.id).tickets }}
              </td>

              <!-- Tags -->
              <td class="py-3 px-4">
                <div v-if="client.tags?.length" class="flex flex-wrap gap-1">
                  <span
                    v-for="tag in client.tags.slice(0, 2)"
                    :key="tag"
                    class="inline-flex items-center rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {{ tag }}
                  </span>
                  <span v-if="client.tags.length > 2" class="text-[10px] text-muted-foreground/60 self-center">
                    +{{ client.tags.length - 2 }}
                  </span>
                </div>
                <span v-else class="text-muted-foreground/40">—</span>
              </td>

              <!-- Actions -->
              <td class="py-3 px-4 text-right" @click.stop>
                <div class="flex items-center justify-end gap-1">
                  <NuxtLink :to="`/clients/${client.id}`">
                    <Button variant="ghost" size="sm" class="h-7 text-xs">Edit</Button>
                  </NuxtLink>
                  <button
                    class="p-1.5 rounded-md text-muted-foreground/50 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Delete client"
                    @click="deleteTarget = client"
                  >
                    <Icon name="lucide:trash-2" class="w-3.5 h-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Create Modal -->
    <ClientsFormModal v-model="showCreateModal" @created="onClientCreated" />

    <!-- Delete Confirmation Dialog -->
    <Teleport to="body">
      <div
        v-if="deleteTarget"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        @click.self="deleteTarget = null"
      >
        <div class="ios-card shadow-xl w-full max-w-sm mx-4 p-6">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center shrink-0">
              <Icon name="lucide:trash-2" class="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h2 class="font-semibold">Delete Client</h2>
              <p class="text-sm text-muted-foreground">{{ deleteTarget.name }}</p>
            </div>
          </div>
          <p class="text-sm text-muted-foreground mb-5">
            This will permanently delete the client and remove all associations. This action cannot be undone.
          </p>
          <div class="flex justify-end gap-2">
            <Button variant="outline" size="sm" @click="deleteTarget = null">Cancel</Button>
            <Button variant="destructive" size="sm" @click="confirmDelete">Delete</Button>
          </div>
        </div>
      </div>
    </Teleport>
  </LayoutPageContainer>
</template>
