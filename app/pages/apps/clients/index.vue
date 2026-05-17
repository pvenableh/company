<script setup lang="ts">
import type { Client } from '~~/shared/directus';
import type { Contact } from '~~/shared/email/contacts';
import { Button } from '~/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/components/ui/dropdown-menu';
import { useDebounceFn } from '@vueuse/core';
import { CONNECTION_ROLE_LABELS } from '~/composables/useContactConnections';
import VueDraggable from 'vuedraggable';

definePageMeta({ layout: 'apps', middleware: ['auth'] });
useHead({ title: 'Clients | Earnest' });

const router = useRouter();
const route = useRoute();
const config = useRuntimeConfig();

// ── View segmented control ─────────────────────────────────────────────────
// Segments are people-noun lenses. Each one can render its own layout —
// simple list/table for clients/contacts/partners, dashboard-shaped for
// Card Desk and Intelligence. The page wrapper stays the same; the body
// switches via v-if/v-else-if blocks below.
type ViewKey = 'clients' | 'contacts' | 'partners' | 'carddesk' | 'intelligence';
const VIEW_KEYS: ViewKey[] = ['clients', 'contacts', 'partners', 'carddesk', 'intelligence'];

const initialView: ViewKey = (() => {
  const v = route.query.view;
  return typeof v === 'string' && VIEW_KEYS.includes(v as ViewKey) ? (v as ViewKey) : 'clients';
})();
const view = ref<ViewKey>(initialView);

watch(view, (next) => {
  router.replace({ query: { ...route.query, view: next === 'clients' ? undefined : next } });
});

const segments: Array<{ key: ViewKey; label: string; icon: string }> = [
  { key: 'clients', label: 'By Client', icon: 'lucide:building-2' },
  { key: 'contacts', label: 'All Contacts', icon: 'lucide:users' },
  { key: 'partners', label: 'Partners', icon: 'lucide:network' },
  { key: 'carddesk', label: 'Card Desk', icon: 'lucide:contact' },
  { key: 'intelligence', label: 'Intelligence', icon: 'earnest' },
];

// ── Intelligence data ──────────────────────────────────────────────────────
const { intelligence, intelligenceLoading, fetchIntelligence } = useCRMIntelligence();

// ── Clients data ───────────────────────────────────────────────────────────
const {
  getClients,
  deleteClient: doDelete,
  updateClient,
  updateClientSort,
  clientsSortMode,
  setClientsSortMode,
} = useClients();
const { getStatusBadgeClasses } = useStatusStyle();
const { selectedOrg } = useOrganization();

// Persisted "View as Table / Board" toggle (per-user). Stored client-side
// only — power users tend to lock in one or the other and switch is rare.
const clientsViewMode = useCookie<'table' | 'board'>('clients-view-mode', { default: () => 'table' });

// Drag-and-drop is only active in manual sort mode + table view; in activity
// mode the rows are ordered by `-date_updated` and reordering would be a lie.
const canDragSort = computed(
  () => clientsSortMode.value === 'manual' && clientsViewMode.value === 'table',
);

const STATUS_QUICK_OPTIONS: Array<{ value: 'active' | 'prospect' | 'inactive' | 'archived'; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'prospect', label: 'Prospect' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'archived', label: 'Archived' },
];

async function changeClientStatus(
  client: Client,
  next: 'active' | 'prospect' | 'inactive' | 'archived',
) {
  const patch: Partial<Client> = {};
  if (next === 'archived') {
    patch.status = 'archived' as Client['status'];
  } else {
    patch.account_state = next;
    if (client.status === 'archived') patch.status = 'published' as Client['status'];
  }
  // Optimistic local update so the row reflects the new bucket immediately;
  // the next fetch reconciles authoritative state.
  Object.assign(client, patch);
  try {
    await updateClient(client.id as string, patch);
  } finally {
    fetchClients();
  }
}

function onBoardUpdate(payload: { id: string; account_state?: Client['account_state']; status?: string }) {
  const c = allClients.value.find((x) => x.id === payload.id);
  if (!c) return;
  const next = payload.status === 'archived'
    ? 'archived'
    : (payload.account_state || 'active');
  changeClientStatus(c, next as 'active' | 'prospect' | 'inactive' | 'archived');
}

const allClients = ref<Client[]>([]);
const clientsTotal = ref(0);
const clientsLoading = ref(true);
const clientSearch = ref('');
const showCreateClientModal = ref(false);
const deleteTarget = ref<Client | null>(null);

const clientTabs = [
  { label: 'Active', value: 'active', color: 'bg-success', kind: 'accountState' as const },
  { label: 'Prospects', value: 'prospect', color: 'bg-warning', kind: 'accountState' as const },
  { label: 'Inactive', value: 'inactive', color: 'bg-neutral-400', kind: 'accountState' as const },
  { label: 'Archived', value: 'archived', color: 'bg-zinc-400', kind: 'status' as const },
];
const activeClientTab = ref('active');

function clientTabFilter(value: string): { status?: string; accountState?: string } {
  const tab = clientTabs.find((t) => t.value === value);
  if (!tab) return {};
  // Archived tab filters by `status`. The lifecycle tabs (active/prospect/
  // inactive) filter by `account_state` AND require `status='published'` so
  // a client that was archived without also flipping account_state doesn't
  // leak into the Active list.
  return tab.kind === 'status'
    ? { status: value }
    : { accountState: value, status: 'published' };
}

async function fetchClients() {
  clientsLoading.value = true;
  try {
    // Board view needs every column populated, so skip the per-tab filter
    // when in board mode — drag-and-drop crosses all four columns.
    const filter = clientsViewMode.value === 'board' ? {} : clientTabFilter(activeClientTab.value);
    const result = await getClients({
      search: clientSearch.value || undefined,
      ...filter,
      // No `sort` — let useClients honor the shared clientsSortMode so the
      // page table, header dropdown, and every form pull from one source.
      limit: 200,
      page: 1,
    });
    allClients.value = result.data;
    clientsTotal.value = result.total;
  } finally {
    clientsLoading.value = false;
  }
}

// Persist drag order: walk the current visible order and PATCH only the rows
// whose `sort` value no longer matches their position. Sort step is 10 so we
// have headroom to splice new rows between existing ones later if needed.
async function onSortDragEnd() {
  if (!canDragSort.value) return;
  const updates: Array<{ id: string; sort: number }> = [];
  allClients.value.forEach((c, idx) => {
    const next = (idx + 1) * 10;
    if (c.sort !== next) {
      c.sort = next;
      updates.push({ id: c.id as string, sort: next });
    }
  });
  if (!updates.length) return;
  try {
    await Promise.all(updates.map((u) => updateClientSort(u.id, u.sort)));
  } catch (err) {
    console.error('Failed to persist client order:', err);
    fetchClients();
  }
}

// When the user flips Recent ↔ Manual, refetch with the new sort direction.
watch(clientsSortMode, () => {
  fetchClients();
});

// Board view fetches with an empty filter (all status columns). Switching
// back to Table without a refetch would leave `allClients` populated with
// archived rows that the active tab filter would have excluded.
watch(clientsViewMode, () => {
  fetchClients();
});

const debouncedFetchClients = useDebounceFn(fetchClients, 300);

function viewClient(client: Client) {
  router.push(`/apps/clients/${client.id}`);
}

async function onClientCreated() {
  await fetchClients();
}

async function confirmDelete() {
  if (!deleteTarget.value) return;
  try {
    await doDelete(deleteTarget.value.id);
    allClients.value = allClients.value.filter((c) => c.id !== deleteTarget.value!.id);
    clientsTotal.value = Math.max(0, clientsTotal.value - 1);
  } catch (err) {
    console.error('Failed to delete client:', err);
  } finally {
    deleteTarget.value = null;
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

// ── Activity counts (projects/tickets per client) ──────────────────────────
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
      const id = row.client as string;
      if (!id) continue;
      if (!counts[id]) counts[id] = { projects: 0, tickets: 0 };
      counts[id].projects = Number(row.count?.id || row.count) || 0;
    }
    for (const row of (ticketData || [])) {
      const id = row.client as string;
      if (!id) continue;
      if (!counts[id]) counts[id] = { projects: 0, tickets: 0 };
      counts[id].tickets = Number(row.count?.id || row.count) || 0;
    }
    activityCounts.value = counts;
  } catch (err) {
    console.error('Failed to fetch activity counts:', err);
  }
}

function getClientActivity(clientId: string) {
  return activityCounts.value[clientId] || { projects: 0, tickets: 0 };
}

// ── Contacts data ──────────────────────────────────────────────────────────
const { getContacts } = useContacts();
const contacts = ref<Contact[]>([]);
const contactsTotal = ref(0);
const contactsLoading = ref(true);
const contactSearch = ref('');
const contactsLimit = 50;
const contactsPage = ref(1);
const contactsHasMore = computed(() => contactsPage.value * contactsLimit < contactsTotal.value);
const showCreateContactModal = ref(false);

async function fetchContacts() {
  contactsLoading.value = true;
  try {
    const result = await getContacts({
      search: contactSearch.value || undefined,
      limit: contactsLimit,
      page: contactsPage.value,
    });
    contacts.value = result.data;
    contactsTotal.value = result.total;
  } finally {
    contactsLoading.value = false;
  }
}

const debouncedFetchContacts = useDebounceFn(() => {
  contactsPage.value = 1;
  fetchContacts();
}, 300);

// ── Partners data (contact_connections) ────────────────────────────────────
const connectionItems = useDirectusItems('contact_connections');
type PartnerRow = {
  id: string | number;
  role: string;
  introduced_by?: string | null;
  contact: any;
  client: any;
};
const partners = ref<PartnerRow[]>([]);
const partnersLoading = ref(true);
const partnerSearch = ref('');

async function fetchPartners() {
  partnersLoading.value = true;
  try {
    if (!selectedOrg.value) {
      partners.value = [];
      return;
    }
    const rows = (await connectionItems.list({
      filter: { client: { organization: { _eq: selectedOrg.value } } },
      fields: [
        'id', 'role', 'introduced_by', 'date_created',
        'contact.id', 'contact.first_name', 'contact.last_name', 'contact.email', 'contact.company', 'contact.category',
        'client.id', 'client.name', 'client.logo',
      ],
      sort: ['-date_created'],
      limit: -1,
    })) as PartnerRow[];
    partners.value = rows;
  } catch (err) {
    console.error('Failed to fetch partners:', err);
    partners.value = [];
  } finally {
    partnersLoading.value = false;
  }
}

const filteredPartners = computed(() => {
  const q = partnerSearch.value.trim().toLowerCase();
  if (!q) return partners.value;
  return partners.value.filter((p) => {
    const name = `${p.contact?.first_name || ''} ${p.contact?.last_name || ''}`.toLowerCase();
    const company = (p.contact?.company || '').toLowerCase();
    const email = (p.contact?.email || '').toLowerCase();
    const clientName = (p.client?.name || '').toLowerCase();
    const role = CONNECTION_ROLE_LABELS[p.role as keyof typeof CONNECTION_ROLE_LABELS]?.toLowerCase() || '';
    return name.includes(q) || company.includes(q) || email.includes(q) || clientName.includes(q) || role.includes(q);
  });
});

// ── Lifecycle ──────────────────────────────────────────────────────────────
onMounted(() => {
  fetchClients();
  fetchActivityCounts();
  if (router.currentRoute.value.query.new === '1') {
    showCreateClientModal.value = true;
    router.replace({ query: {} });
  }
});

let contactsLoaded = false;
let partnersLoaded = false;
let intelligenceLoaded = false;

watch(view, (next) => {
  if (next === 'contacts' && !contactsLoaded) {
    contactsLoaded = true;
    fetchContacts();
  }
  if (next === 'partners' && !partnersLoaded) {
    partnersLoaded = true;
    fetchPartners();
  }
  if (next === 'intelligence' && !intelligenceLoaded) {
    intelligenceLoaded = true;
    fetchIntelligence();
  }
}, { immediate: true });
</script>

<template>
  <div class="apps-page">
    <AppHeader title="Clients" app-id="clients">
      <template #actions>
        <Button v-if="view === 'clients'" size="sm" @click="showCreateClientModal = true">
          <Icon name="lucide:plus" class="w-4 h-4 mr-1" />
          Add Client
        </Button>
        <Button v-else-if="view === 'contacts'" size="sm" @click="showCreateContactModal = true">
          <Icon name="lucide:plus" class="w-4 h-4 mr-1" />
          Add Contact
        </Button>
      </template>
    </AppHeader>

    <LayoutPageContainer>
      <AppFloorStrip v-model="view" :items="segments" aria-label="Clients sections" />

      <AppIntroCard app-id="clients" />
      <GoalsRelatedGoalsCard :categories="['growth', 'retention']" title="Goals in this lens" />

      <!-- ── Clients view ─────────────────────────────────────────────── -->
      <template v-if="view === 'clients'">
        <div class="flex items-center justify-between gap-3 mb-5 flex-wrap">
          <UTabs
            v-if="clientsViewMode === 'table'"
            v-model="activeClientTab"
            :items="clientTabs.map((t) => ({ key: t.value, label: t.label, dotColor: t.color }))"
            class="w-fit"
            @change="fetchClients"
          />
          <div v-else class="text-xs text-muted-foreground">Drag a card to change its status.</div>
          <div class="flex items-center gap-2">
            <!-- Shared sort mode — also drives the header client dropdown and
                 every other surface that lists clients. -->
            <div
              class="inline-flex items-center gap-0.5 p-0.5 bg-muted/40 rounded-full text-[12px] font-medium"
              :title="clientsSortMode === 'activity' ? 'Sorted by most recently updated' : 'Sorted by manual drag-and-drop order'"
            >
              <button
                type="button"
                class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-colors"
                :class="clientsSortMode === 'activity' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
                @click="setClientsSortMode('activity')"
              >
                <Icon name="lucide:activity" class="w-3.5 h-3.5" />
                Recent
              </button>
              <button
                type="button"
                class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-colors"
                :class="clientsSortMode === 'manual' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
                @click="setClientsSortMode('manual')"
              >
                <Icon name="lucide:grip-vertical" class="w-3.5 h-3.5" />
                Manual
              </button>
            </div>

            <div class="inline-flex items-center gap-0.5 p-0.5 bg-muted/40 rounded-full text-[12px] font-medium">
              <button
                type="button"
                class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-colors"
                :class="clientsViewMode === 'table' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
                @click="clientsViewMode = 'table'"
              >
                <Icon name="lucide:list" class="w-3.5 h-3.5" />
                Table
              </button>
              <button
                type="button"
                class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-colors"
                :class="clientsViewMode === 'board' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
                @click="clientsViewMode = 'board'; activeClientTab = 'active'; fetchClients()"
              >
                <Icon name="lucide:columns-3" class="w-3.5 h-3.5" />
                Board
              </button>
            </div>
          </div>
        </div>

        <div class="flex gap-3 mb-5 flex-wrap items-center">
          <input
            v-model="clientSearch"
            type="search"
            placeholder="Search clients..."
            class="flex-1 min-w-48 rounded-md border bg-background px-3 py-2 text-sm"
            @input="debouncedFetchClients"
          />
        </div>

        <ClientsBoard
          v-if="clientsViewMode === 'board'"
          :clients="allClients"
          :loading="clientsLoading"
          @view="viewClient"
          @update="onBoardUpdate"
        />

        <div v-else-if="clientsLoading" class="flex flex-col items-center justify-center py-24 gap-3">
          <Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
          <p class="text-sm text-muted-foreground">Loading clients...</p>
        </div>

        <div v-else-if="!allClients.length" class="flex flex-col items-center justify-center py-24 gap-4">
          <Icon name="lucide:building-2" class="w-12 h-12 text-muted-foreground/40" />
          <div class="text-center">
            <p class="text-sm font-medium text-muted-foreground">No {{ activeClientTab }} clients found</p>
            <p class="text-xs text-muted-foreground/70 mt-1">
              {{ clientSearch ? 'Try adjusting your search.' : 'No clients with this status yet.' }}
            </p>
          </div>
          <Button v-if="!clientSearch && activeClientTab === 'active'" size="sm" @click="showCreateClientModal = true">
            <Icon name="lucide:plus" class="w-4 h-4 mr-1" />
            Add Client
          </Button>
        </div>

        <div v-else class="ios-card overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-border/50">
                  <th v-if="canDragSort" class="w-8 px-2" aria-label="Drag handle" />
                  <th class="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Client</th>
                  <th class="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Status</th>
                  <th class="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Contact</th>
                  <th class="text-center py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Projects</th>
                  <th class="text-center py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Tickets</th>
                  <th class="text-right py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider w-24"></th>
                </tr>
              </thead>
              <VueDraggable
                v-model="allClients"
                tag="tbody"
                item-key="id"
                handle=".client-row-drag-handle"
                :disabled="!canDragSort"
                ghost-class="clients-table__ghost"
                chosen-class="clients-table__chosen"
                drag-class="clients-table__drag"
                @end="onSortDragEnd"
              >
                <template #item="{ element: client }">
                <tr
                  :key="client.id"
                  class="border-b border-border/30 last:border-b-0 hover:bg-muted/20 cursor-pointer transition-colors"
                  :class="{ 'opacity-50': client.account_state === 'inactive' || client.status === 'archived' }"
                  @click="viewClient(client)"
                >
                  <td
                    v-if="canDragSort"
                    class="client-row-drag-handle w-8 px-2 text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing"
                    title="Drag to reorder"
                    @click.stop
                  >
                    <Icon name="lucide:grip-vertical" class="w-4 h-4" />
                  </td>
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
                  <td class="py-3 px-4" @click.stop>
                    <DropdownMenu>
                      <DropdownMenuTrigger as-child>
                        <button
                          type="button"
                          class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize hover:opacity-80"
                          :class="getStatusBadgeClasses(client.status === 'archived' ? 'archived' : (client.account_state || 'active'))"
                          :title="`Change status (current: ${client.status === 'archived' ? 'archived' : (client.account_state || 'active')})`"
                        >
                          {{ client.status === 'archived' ? 'archived' : (client.account_state || 'active') }}
                          <Icon name="lucide:chevron-down" class="w-3 h-3 opacity-60" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" class="w-40">
                        <DropdownMenuItem
                          v-for="opt in STATUS_QUICK_OPTIONS"
                          :key="opt.value"
                          @select="changeClientStatus(client, opt.value)"
                        >
                          <span
                            class="w-2 h-2 rounded-full mr-2"
                            :class="opt.value === 'active' ? 'bg-success'
                              : opt.value === 'prospect' ? 'bg-warning'
                              : opt.value === 'inactive' ? 'bg-neutral-400'
                              : 'bg-zinc-400'"
                          />
                          {{ opt.label }}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                  <td class="py-3 px-4 text-muted-foreground">
                    {{ getPrimaryContactName(client) || '—' }}
                  </td>
                  <td class="py-3 px-4 text-center text-muted-foreground">
                    {{ getClientActivity(client.id).projects }}
                  </td>
                  <td class="py-3 px-4 text-center text-muted-foreground">
                    {{ getClientActivity(client.id).tickets }}
                  </td>
                  <td class="py-3 px-4 text-right" @click.stop>
                    <div class="flex items-center justify-end gap-1">
                      <button
                        class="p-1.5 rounded-md text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="Delete client"
                        @click="deleteTarget = client"
                      >
                        <Icon name="lucide:trash-2" class="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
                </template>
              </VueDraggable>
            </table>
          </div>
        </div>
      </template>

      <!-- ── Contacts view ────────────────────────────────────────────── -->
      <template v-else-if="view === 'contacts'">
        <div class="flex gap-3 mb-5 flex-wrap items-center">
          <input
            v-model="contactSearch"
            type="search"
            placeholder="Search name, email, company..."
            class="flex-1 min-w-48 rounded-md border bg-background px-3 py-2 text-sm"
            @input="debouncedFetchContacts"
          />
        </div>

        <ContactsContactTable
          :contacts="contacts"
          :loading="contactsLoading"
          @edit="(c) => router.push(`/contacts/${c.id}`)"
        />

        <div class="flex justify-between items-center mt-4">
          <p class="text-sm text-muted-foreground">
            Showing {{ contacts.length }} of {{ contactsTotal }}
          </p>
          <div class="flex gap-2">
            <Button variant="outline" size="sm" :disabled="contactsPage === 1" @click="contactsPage--; fetchContacts()">
              <Icon name="lucide:chevron-left" class="w-4 h-4" />
            </Button>
            <span class="text-sm px-3 py-1">{{ contactsPage }}</span>
            <Button variant="outline" size="sm" :disabled="!contactsHasMore" @click="contactsPage++; fetchContacts()">
              <Icon name="lucide:chevron-right" class="w-4 h-4" />
            </Button>
          </div>
        </div>
      </template>

      <!-- ── Partners view ────────────────────────────────────────────── -->
      <template v-else-if="view === 'partners'">
        <div class="flex gap-3 mb-5 flex-wrap items-center">
          <input
            v-model="partnerSearch"
            type="search"
            placeholder="Search partners by name, company, role, or client..."
            class="flex-1 min-w-48 rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>

        <div v-if="partnersLoading" class="flex flex-col items-center justify-center py-24 gap-3">
          <Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
          <p class="text-sm text-muted-foreground">Loading partners...</p>
        </div>

        <div v-else-if="!filteredPartners.length" class="flex flex-col items-center justify-center py-24 gap-4">
          <Icon name="lucide:network" class="w-12 h-12 text-muted-foreground/40" />
          <p class="text-sm text-muted-foreground">
            {{ partnerSearch ? 'No partners match your search.' : 'No partner connections yet.' }}
          </p>
        </div>

        <div v-else class="ios-card overflow-hidden divide-y divide-border/30">
          <NuxtLink
            v-for="row in filteredPartners"
            :key="row.id"
            :to="`/contacts/${row.contact?.id || ''}`"
            class="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors group"
          >
            <span class="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <p class="text-sm font-medium truncate">
                  {{ row.contact?.first_name }} {{ row.contact?.last_name }}
                </p>
                <span class="text-[11px] text-muted-foreground truncate">
                  · {{ CONNECTION_ROLE_LABELS[row.role as keyof typeof CONNECTION_ROLE_LABELS] || row.role }}
                </span>
                <span v-if="row.contact?.company" class="text-[11px] text-muted-foreground truncate hidden sm:inline">
                  · {{ row.contact.company }}
                </span>
              </div>
            </div>
            <NuxtLink
              v-if="row.client?.id"
              :to="`/apps/clients/${row.client.id}`"
              class="hidden md:inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground shrink-0"
              @click.stop
            >
              <Icon name="lucide:building-2" class="w-3 h-3" />
              {{ row.client.name }}
            </NuxtLink>
            <span
              v-if="row.introduced_by"
              class="text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0"
              :class="row.introduced_by === 'partner' ? 'bg-violet-500/15 text-violet-500' : 'bg-info/15 text-info'"
            >
              {{ row.introduced_by === 'partner' ? 'intro → us' : 'intro ← us' }}
            </span>
            <Icon name="lucide:chevron-right" class="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
          </NuxtLink>
        </div>
      </template>

      <!-- ── Card Desk view ───────────────────────────────────────────── -->
      <!-- Dashboard-shaped segment: hero stats + XP bar + filterable
           contacts + editable detail panel. Same component the
           standalone /carddesk route renders, so deep links and
           bookmarks still work. -->
      <template v-else-if="view === 'carddesk'">
        <CardDeskDashboard />
      </template>

      <!-- ── Intelligence view ────────────────────────────────────────── -->
      <template v-else-if="view === 'intelligence'">
        <ClientsIntelligenceView :data="intelligence" :loading="intelligenceLoading" />
      </template>

      <!-- Create Client modal -->
      <ClientsFormModal v-model="showCreateClientModal" @created="onClientCreated" />

      <!-- Create Contact modal -->
      <ContactsFormModal v-model="showCreateContactModal" @created="contactsPage = 1; fetchContacts()" />

      <!-- Delete client confirmation -->
      <Teleport to="body">
        <div
          v-if="deleteTarget"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          @click.self="deleteTarget = null"
        >
          <div class="ios-card shadow-xl w-full max-w-sm mx-4 p-6">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 rounded-full bg-destructive/15 flex items-center justify-center shrink-0">
                <Icon name="lucide:trash-2" class="w-5 h-5 text-destructive" />
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
  </div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.apps-page {
  @apply flex flex-col min-h-full;
}

.clients-table__ghost {
  @apply opacity-30;
}
.clients-table__chosen {
  @apply bg-muted/30;
}
.clients-table__drag {
  @apply shadow-lg;
}
</style>
