<script setup lang="ts">
import type { Client } from '~~/shared/directus';
import type { Contact } from '~~/shared/email/contacts';
import { Button } from '~/components/ui/button';
import { useDebounceFn } from '@vueuse/core';
import { CONNECTION_ROLE_LABELS } from '~/composables/useContactConnections';

definePageMeta({ layout: 'apps', middleware: ['auth'] });
useHead({ title: 'Clients | Earnest' });

const router = useRouter();
const route = useRoute();
const config = useRuntimeConfig();

// ── View segmented control ─────────────────────────────────────────────────
type ViewKey = 'clients' | 'contacts' | 'partners';
const VIEW_KEYS: ViewKey[] = ['clients', 'contacts', 'partners'];

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
];

// ── Clients data ───────────────────────────────────────────────────────────
const { getClients, deleteClient: doDelete } = useClients();
const { getStatusBadgeClasses } = useStatusStyle();
const { selectedOrg } = useOrganization();

const allClients = ref<Client[]>([]);
const clientsTotal = ref(0);
const clientsLoading = ref(true);
const clientSearch = ref('');
const showCreateClientModal = ref(false);
const deleteTarget = ref<Client | null>(null);

const clientTabs = [
  { label: 'Active', value: 'active', color: 'bg-emerald-500', kind: 'accountState' as const },
  { label: 'Prospects', value: 'prospect', color: 'bg-amber-500', kind: 'accountState' as const },
  { label: 'Inactive', value: 'inactive', color: 'bg-neutral-400', kind: 'accountState' as const },
  { label: 'Churned', value: 'churned', color: 'bg-red-500', kind: 'accountState' as const },
  { label: 'Archived', value: 'archived', color: 'bg-zinc-400', kind: 'status' as const },
];
const activeClientTab = ref('active');

function clientTabFilter(value: string): { status?: string; accountState?: string } {
  const tab = clientTabs.find((t) => t.value === value);
  if (!tab) return {};
  return tab.kind === 'status' ? { status: value } : { accountState: value };
}

async function fetchClients() {
  clientsLoading.value = true;
  try {
    const result = await getClients({
      search: clientSearch.value || undefined,
      ...clientTabFilter(activeClientTab.value),
      sort: ['sort', 'name'],
      limit: 200,
      page: 1,
    });
    allClients.value = result.data;
    clientsTotal.value = result.total;
  } finally {
    clientsLoading.value = false;
  }
}

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

watch(view, (next) => {
  if (next === 'contacts' && !contactsLoaded) {
    contactsLoaded = true;
    fetchContacts();
  }
  if (next === 'partners' && !partnersLoaded) {
    partnersLoaded = true;
    fetchPartners();
  }
}, { immediate: true });
</script>

<template>
  <div class="apps-page">
    <AppHeader title="Clients">
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

      <!-- ── Clients view ─────────────────────────────────────────────── -->
      <template v-if="view === 'clients'">
        <UTabs
          v-model="activeClientTab"
          :items="clientTabs.map((t) => ({ key: t.value, label: t.label, dotColor: t.color }))"
          class="mb-5 w-fit"
          @change="fetchClients"
        />

        <div class="flex gap-3 mb-5 flex-wrap items-center">
          <input
            v-model="clientSearch"
            type="search"
            placeholder="Search clients..."
            class="flex-1 min-w-48 rounded-md border bg-background px-3 py-2 text-sm"
            @input="debouncedFetchClients"
          />
        </div>

        <div v-if="clientsLoading" class="flex flex-col items-center justify-center py-24 gap-3">
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
                  <th class="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Client</th>
                  <th class="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Status</th>
                  <th class="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Contact</th>
                  <th class="text-center py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Projects</th>
                  <th class="text-center py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Tickets</th>
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
                  <td class="py-3 px-4">
                    <span
                      class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize"
                      :class="getStatusBadgeClasses(client.account_state || 'active')"
                    >
                      {{ client.account_state || 'active' }}
                    </span>
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
      <template v-else>
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
              :class="row.introduced_by === 'partner' ? 'bg-violet-500/15 text-violet-500' : 'bg-sky-500/15 text-sky-500'"
            >
              {{ row.introduced_by === 'partner' ? 'intro → us' : 'intro ← us' }}
            </span>
            <Icon name="lucide:chevron-right" class="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
          </NuxtLink>
        </div>
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
  </div>
</template>

<style scoped>
.apps-page {
  @apply flex flex-col min-h-full;
}
</style>
