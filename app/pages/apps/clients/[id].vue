<script setup lang="ts">
import type { Client } from '~~/shared/directus';
import { Button } from '~/components/ui/button';
import { CONNECTION_ROLE_LABELS } from '~/composables/useContactConnections';

definePageMeta({ layout: 'apps', middleware: ['auth'] });
useHead({ title: 'Client Details | Earnest' });

const route = useRoute();
const router = useRouter();
const config = useRuntimeConfig();
const clientId = route.params.id as string;

const { getClient } = useClients();
const { setEntity, clearEntity, sidebarOpen, closeSidebar } = useEntityPageContext();
const { getStatusBadgeClasses } = useStatusStyle();

const projectItemsApi = useDirectusItems('projects');
const invoiceItemsApi = useDirectusItems('invoices');
const channelItemsApi = useDirectusItems('channels');
const contactItemsApi = useDirectusItems('contacts');
const { listForClient: listConnectionsForClient, getAncestorClientIds } = useContactConnections();

const client = ref<Client | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const showEditModal = ref(false);

const relatedContacts = computed<any[]>(() => {
  const c = (client.value as any)?.contacts;
  return Array.isArray(c) ? c : [];
});
const directConnections = computed<any[]>(() => {
  const list = (client.value as any)?.partner_connections;
  return Array.isArray(list) ? list : [];
});

const relatedProjects = ref<any[]>([]);
const relatedInvoices = ref<any[]>([]);
const relatedChannels = ref<any[]>([]);
const inheritedConnections = ref<Array<{ connection: any; inheritedFromId: string; inheritedFromName: string }>>([]);
const inheritedContacts = ref<Array<{ contact: any; inheritedFromId: string; inheritedFromName: string }>>([]);

type TabKey = 'activity' | 'contacts' | 'projects' | 'invoices' | 'partners' | 'messages';
const tabs: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: 'activity', label: 'Activity', icon: 'lucide:activity' },
  { key: 'contacts', label: 'Contacts', icon: 'lucide:users' },
  { key: 'projects', label: 'Projects', icon: 'lucide:folder-kanban' },
  { key: 'invoices', label: 'Invoices', icon: 'lucide:file-text' },
  { key: 'partners', label: 'Partners', icon: 'lucide:network' },
  { key: 'messages', label: 'Messages', icon: 'lucide:message-square' },
];

// Initial tab from `?tab=` query — defaults to Activity.
const initialTab: TabKey = (() => {
  const v = route.query.tab;
  return typeof v === 'string' && tabs.some(t => t.key === v) ? (v as TabKey) : 'activity';
})();
const activeTab = ref<TabKey>(initialTab);

watch(activeTab, (next) => {
  router.replace({ query: { ...route.query, tab: next === 'activity' ? undefined : next } });
});

async function loadClient() {
  loading.value = true;
  error.value = null;
  try {
    client.value = await getClient(clientId);
    await loadRelated();
  } catch (e: any) {
    error.value = e?.message || 'Failed to load client';
  } finally {
    loading.value = false;
  }
}

async function loadRelated() {
  const [projects, invoices, channels] = await Promise.all([
    projectItemsApi.list({
      filter: { client: { _eq: clientId } },
      fields: ['id', 'title', 'status', 'date_created'],
      sort: ['-date_created'],
      limit: -1,
    }).catch(() => []),
    invoiceItemsApi.list({
      filter: { client: { _eq: clientId } },
      fields: ['id', 'invoice_code', 'status', 'total_amount', 'invoice_date', 'due_date'],
      sort: ['-invoice_date'],
      limit: -1,
    }).catch(() => []),
    channelItemsApi.list({
      filter: { client: { _eq: clientId } },
      fields: [
        'id', 'name', 'date_created',
        'project.id', 'project.title',
        'ticket.id', 'ticket.title',
      ],
      sort: ['name'],
      limit: -1,
    }).catch(() => []),
  ]);
  relatedProjects.value = projects as any[];
  relatedInvoices.value = invoices as any[];
  relatedChannels.value = channels as any[];
  await Promise.all([loadInheritedConnections(), loadInheritedContacts()]);
}

async function loadInheritedConnections() {
  inheritedConnections.value = [];
  try {
    const ancestors = await getAncestorClientIds(clientId, 3);
    for (const ancestor of ancestors) {
      const conns = await listConnectionsForClient(ancestor.id);
      for (const c of conns as any[]) {
        inheritedConnections.value.push({
          connection: c,
          inheritedFromId: ancestor.id,
          inheritedFromName: ancestor.name,
        });
      }
    }
  } catch {
    inheritedConnections.value = [];
  }
}

async function loadInheritedContacts() {
  inheritedContacts.value = [];
  try {
    const ancestors = await getAncestorClientIds(clientId, 3);
    for (const ancestor of ancestors) {
      const rows = await contactItemsApi.list({
        filter: { client: { _eq: ancestor.id } },
        fields: ['id', 'first_name', 'last_name', 'email', 'phone', 'title', 'category', 'is_billing_contact'],
        limit: -1,
      }).catch(() => []);
      for (const c of rows as any[]) {
        inheritedContacts.value.push({
          contact: c,
          inheritedFromId: ancestor.id,
          inheritedFromName: ancestor.name,
        });
      }
    }
  } catch {
    inheritedContacts.value = [];
  }
}

type MergedContact = {
  contact: any;
  source: 'direct' | 'inherited';
  inheritedFromId?: string | null;
  inheritedFromName?: string | null;
  isBilling: boolean;
};

const mergedContacts = computed<MergedContact[]>(() => {
  const direct: MergedContact[] = relatedContacts.value.map((c) => ({
    contact: c,
    source: 'direct' as const,
    isBilling: !!c.is_billing_contact,
  }));
  const inherited: MergedContact[] = inheritedContacts.value.map(({ contact, inheritedFromId, inheritedFromName }) => ({
    contact,
    source: 'inherited' as const,
    inheritedFromId,
    inheritedFromName,
    isBilling: !!contact.is_billing_contact,
  }));
  return [...direct, ...inherited].sort((a, b) => {
    if (a.isBilling !== b.isBilling) return a.isBilling ? -1 : 1;
    if (a.source !== b.source) return a.source === 'direct' ? -1 : 1;
    return 0;
  });
});

const totalContactCount = computed(() => relatedContacts.value.length + inheritedContacts.value.length);
const totalPartnerCount = computed(() => directConnections.value.length + inheritedConnections.value.length);

function getLogoUrl(c: Client): string | null {
  if (!c.logo) return null;
  const fileId = typeof c.logo === 'string' ? c.logo : c.logo?.id;
  if (!fileId) return null;
  return `${config.public.directusUrl}/assets/${fileId}?key=medium-contain`;
}

function getInitial(name: string): string {
  return name?.charAt(0)?.toUpperCase() || '?';
}

function fmtCurrency(n: number | string | null | undefined): string {
  const num = Number(n);
  if (!Number.isFinite(num)) return '—';
  return num.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString();
  } catch {
    return '—';
  }
}

// ── Slide-over: contact details ─────────────────────────────────────────────
const slideOverContactId = ref<string | null>(null);
const slideOverContact = ref<any>(null);
const slideOverLoading = ref(false);
const slideOverOpen = computed({
  get: () => !!slideOverContactId.value,
  set: (v: boolean) => {
    if (!v) {
      slideOverContactId.value = null;
      slideOverContact.value = null;
    }
  },
});

// ── Activity feed (Phase 7 Track B) ─────────────────────────────────────────
type ActivityFilter = 'all' | 'meetings' | 'money' | 'projects' | 'tickets';
interface ActivityRow {
  id: string;
  kind: string;
  ts: string;
  title: string;
  subtitle?: string | null;
  href?: string | null;
  icon: string;
}

const activityRows = ref<ActivityRow[]>([]);
const activityLoading = ref(false);
const activityNextOffset = ref<number | null>(0);
const activityFilter = ref<ActivityFilter>('all');
const activityFilterChips: Array<{ key: ActivityFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'meetings', label: 'Meetings' },
  { key: 'money', label: 'Money' },
  { key: 'projects', label: 'Projects' },
  { key: 'tickets', label: 'Tickets' },
];

async function fetchActivity(reset = false) {
  if (activityLoading.value) return;
  if (!reset && activityNextOffset.value === null) return;
  activityLoading.value = true;
  try {
    const offset = reset ? 0 : (activityNextOffset.value ?? 0);
    const res: any = await $fetch(`/api/apps/clients/${clientId}/activity`, {
      query: { offset, filter: activityFilter.value },
    });
    if (reset) activityRows.value = [];
    activityRows.value.push(...(res?.rows ?? []));
    activityNextOffset.value = res?.nextOffset ?? null;
  } catch (err) {
    console.error('[apps/clients/activity] fetch failed', err);
  } finally {
    activityLoading.value = false;
  }
}

watch([activeTab, activityFilter], ([tab]) => {
  if (tab === 'activity') {
    fetchActivity(true);
  }
}, { immediate: true });

function activityWhen(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const ms = Date.now() - d.getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

async function openContactSlideOver(contactId: string) {
  slideOverContactId.value = contactId;
  slideOverLoading.value = true;
  slideOverContact.value = null;
  try {
    slideOverContact.value = await contactItemsApi.get(contactId, {
      fields: [
        '*',
        'client.id', 'client.name',
      ],
    });
  } catch (err) {
    console.error('Failed to load contact:', err);
  } finally {
    slideOverLoading.value = false;
  }
}

function onClientUpdated(updated: Client) {
  client.value = updated;
  loadRelated();
}

function onClientDeleted() {
  router.push('/apps/clients');
}

onMounted(loadClient);

watch(client, (c) => {
  if (c) setEntity('client', c.id as string, c.name || 'Client');
}, { immediate: true });

onUnmounted(() => clearEntity());
</script>

<template>
  <div class="apps-page">
    <AppHeader :title="client?.name || 'Client'" back-label="Clients" :show-back="true">
      <template #actions>
        <button
          v-if="client"
          class="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-border text-xs font-medium text-primary hover:bg-primary/10 hover:border-primary/30 transition-colors"
          @click="sidebarOpen = true"
        >
          <EarnestIcon class="w-3.5 h-3.5" />
          <span class="hidden sm:inline">Ask Earnest</span>
        </button>
        <button
          v-if="client"
          class="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors"
          @click="showEditModal = true"
        >
          <Icon name="lucide:pencil" class="w-3.5 h-3.5" />
          <span class="hidden sm:inline">Edit</span>
        </button>
      </template>
    </AppHeader>

    <LayoutPageContainer>
      <!-- Loading -->
      <div v-if="loading" class="flex flex-col items-center justify-center py-24 gap-3">
        <Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
        <p class="text-sm text-muted-foreground">Loading client...</p>
      </div>

      <!-- Error -->
      <div v-else-if="error && !client" class="flex flex-col items-center justify-center py-24 gap-4">
        <Icon name="lucide:alert-circle" class="w-10 h-10 text-destructive" />
        <p class="text-sm text-destructive">{{ error }}</p>
        <Button size="sm" @click="loadClient">
          <Icon name="lucide:refresh-cw" class="w-4 h-4 mr-1" />
          Retry
        </Button>
      </div>

      <!-- Detail -->
      <template v-else-if="client">
        <!-- Identity strip -->
        <div class="flex items-center gap-3 mb-5">
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
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <h1 class="text-lg font-semibold truncate">{{ client.name }}</h1>
              <span
                v-if="client.account_state"
                class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize"
                :class="getStatusBadgeClasses(client.account_state)"
              >
                {{ client.account_state }}
              </span>
            </div>
            <p v-if="client.website" class="text-xs text-muted-foreground truncate">
              <a :href="client.website" target="_blank" class="hover:text-foreground">
                {{ client.website.replace(/^https?:\/\//, '') }}
              </a>
            </p>
          </div>
        </div>

        <!-- Tabs -->
        <div class="flex flex-wrap gap-1.5 mb-5">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            class="inline-flex items-center gap-2 h-8 px-3.5 rounded-full text-xs font-medium border transition-colors"
            :class="activeTab === tab.key
              ? 'bg-primary text-primary-foreground border-primary'
              : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/60'"
            @click="activeTab = tab.key"
          >
            <Icon :name="tab.icon" class="w-3.5 h-3.5" />
            {{ tab.label }}
            <span v-if="tab.key !== 'activity'" class="text-[10px] opacity-70 ml-0.5">
              {{ tab.key === 'contacts' ? totalContactCount
                  : tab.key === 'projects' ? relatedProjects.length
                  : tab.key === 'invoices' ? relatedInvoices.length
                  : tab.key === 'partners' ? totalPartnerCount
                  : relatedChannels.length }}
            </span>
          </button>
        </div>

        <!-- Tab content -->
        <div class="ios-card p-4 sm:p-6">
          <!-- Activity feed -->
          <div v-if="activeTab === 'activity'">
            <!-- Filter chips -->
            <div class="flex items-center gap-1 rounded-full border border-border bg-card p-0.5 mb-4 w-fit">
              <button
                v-for="chip in activityFilterChips"
                :key="chip.key"
                type="button"
                class="inline-flex items-center rounded-full px-3 py-0.5 text-[11px] font-medium transition-colors"
                :class="activityFilter === chip.key ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'"
                @click="activityFilter = chip.key"
              >
                {{ chip.label }}
              </button>
            </div>

            <div v-if="activityLoading && !activityRows.length" class="text-sm text-muted-foreground text-center py-10">
              Loading activity…
            </div>

            <div v-else-if="!activityRows.length" class="text-sm text-muted-foreground text-center py-10">
              No activity for this filter yet.
            </div>

            <div v-else class="space-y-px">
              <component
                :is="row.href ? 'NuxtLink' : 'div'"
                v-for="row in activityRows"
                :key="row.id"
                :to="row.href || undefined"
                class="flex items-center gap-3 h-12 px-3 hover:bg-muted/40 border-b border-border/30 last:border-b-0 transition-colors group"
              >
                <Icon :name="row.icon" class="w-4 h-4 text-muted-foreground shrink-0" />
                <div class="flex-1 min-w-0 flex items-center gap-2">
                  <p class="text-sm font-medium truncate">{{ row.title }}</p>
                  <span v-if="row.subtitle" class="text-[11px] text-muted-foreground truncate hidden sm:inline">
                    · {{ row.subtitle }}
                  </span>
                </div>
                <span class="text-[11px] text-muted-foreground shrink-0">{{ activityWhen(row.ts) }}</span>
                <Icon
                  v-if="row.href"
                  name="lucide:chevron-right"
                  class="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0"
                />
              </component>

              <div v-if="activityNextOffset !== null" class="pt-3 text-center">
                <button
                  type="button"
                  :disabled="activityLoading"
                  class="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-60"
                  @click="fetchActivity(false)"
                >
                  <Icon v-if="activityLoading" name="lucide:loader-2" class="w-3 h-3 animate-spin" />
                  Load more
                </button>
              </div>
            </div>
          </div>

          <!-- Contacts -->
          <div v-else-if="activeTab === 'contacts'">
            <div v-if="!mergedContacts.length" class="text-sm text-muted-foreground text-center py-10">
              No contacts linked to this client.
            </div>
            <div v-else class="space-y-px">
              <button
                v-for="row in mergedContacts"
                :key="`${row.source}-${row.contact.id}`"
                type="button"
                class="flex w-full items-center gap-3 h-12 px-3 hover:bg-muted/40 border-b border-border/30 last:border-b-0 transition-colors group text-left"
                @click="openContactSlideOver(row.contact.id)"
              >
                <span
                  class="w-1.5 h-1.5 rounded-full shrink-0"
                  :class="row.isBilling ? 'bg-success' : row.source === 'direct' ? 'bg-primary/60' : 'bg-muted-foreground/40'"
                />
                <div class="flex-1 min-w-0 flex items-center gap-2">
                  <p class="text-sm font-medium truncate">{{ row.contact.first_name }} {{ row.contact.last_name }}</p>
                  <span
                    v-if="row.contact.title"
                    class="text-[11px] text-muted-foreground truncate hidden sm:inline"
                  >· {{ row.contact.title }}</span>
                </div>
                <span
                  v-if="row.contact.email"
                  class="hidden md:inline text-[11px] text-muted-foreground font-mono truncate max-w-[200px]"
                >{{ row.contact.email }}</span>
                <span
                  v-if="row.isBilling"
                  class="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-success/15 text-success shrink-0"
                >Billing</span>
                <span
                  v-if="row.source === 'inherited' && row.inheritedFromName"
                  class="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-warning/15 text-warning shrink-0"
                >
                  <Icon name="lucide:corner-up-left" class="w-2.5 h-2.5" />
                  via {{ row.inheritedFromName }}
                </span>
                <Icon name="lucide:chevron-right" class="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
              </button>
            </div>
          </div>

          <!-- Projects -->
          <div v-else-if="activeTab === 'projects'">
            <div v-if="!relatedProjects.length" class="text-sm text-muted-foreground text-center py-10">
              No projects linked to this client.
            </div>
            <div v-else class="space-y-px">
              <NuxtLink
                v-for="project in relatedProjects"
                :key="project.id"
                :to="`/projects/${project.id}`"
                class="flex items-center gap-3 h-12 px-3 hover:bg-muted/40 border-b border-border/30 last:border-b-0 transition-colors group"
                :class="project.status === 'completed' || project.status === 'archived' ? 'opacity-60' : ''"
              >
                <span class="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0" />
                <p class="flex-1 text-sm font-medium truncate">{{ project.title }}</p>
                <span
                  v-if="project.status"
                  class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0"
                  :class="getStatusBadgeClasses(project.status)"
                >
                  {{ project.status }}
                </span>
                <Icon name="lucide:chevron-right" class="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
              </NuxtLink>
            </div>
          </div>

          <!-- Invoices -->
          <div v-else-if="activeTab === 'invoices'">
            <div v-if="!relatedInvoices.length" class="text-sm text-muted-foreground text-center py-10">
              No invoices yet for this client.
            </div>
            <div v-else class="space-y-px">
              <NuxtLink
                v-for="inv in relatedInvoices"
                :key="inv.id"
                :to="`/invoices/${inv.id}`"
                class="flex items-center gap-3 h-12 px-3 hover:bg-muted/40 border-b border-border/30 last:border-b-0 transition-colors group"
              >
                <span class="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0" />
                <div class="flex-1 min-w-0 flex items-center gap-2">
                  <p class="text-sm font-medium truncate font-mono">{{ inv.invoice_code || inv.id }}</p>
                  <span class="text-[11px] text-muted-foreground hidden sm:inline">
                    · {{ fmtDate(inv.invoice_date) }}
                  </span>
                </div>
                <span class="text-xs font-medium shrink-0">{{ fmtCurrency(inv.total_amount) }}</span>
                <span
                  v-if="inv.status"
                  class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0"
                  :class="getStatusBadgeClasses(inv.status)"
                >
                  {{ inv.status }}
                </span>
                <Icon name="lucide:chevron-right" class="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
              </NuxtLink>
            </div>
          </div>

          <!-- Partners -->
          <div v-else-if="activeTab === 'partners'">
            <div v-if="!totalPartnerCount" class="text-sm text-muted-foreground text-center py-10">
              No partners or connectors linked to this client.
            </div>
            <div v-else class="space-y-px">
              <NuxtLink
                v-for="conn in directConnections"
                :key="`direct-${conn.id}`"
                :to="`/contacts/${conn.contact?.id || ''}`"
                class="flex items-center gap-3 h-12 px-3 hover:bg-muted/40 border-b border-border/30 last:border-b-0 transition-colors group"
              >
                <span class="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
                <div class="flex-1 min-w-0 flex items-center gap-2">
                  <p class="text-sm font-medium truncate">{{ conn.contact?.first_name }} {{ conn.contact?.last_name }}</p>
                  <span class="text-[11px] text-muted-foreground truncate">
                    · {{ CONNECTION_ROLE_LABELS[conn.role as keyof typeof CONNECTION_ROLE_LABELS] || conn.role }}
                  </span>
                </div>
                <span
                  v-if="conn.introduced_by"
                  class="text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0"
                  :class="conn.introduced_by === 'partner' ? 'bg-violet-500/15 text-violet-500' : 'bg-info/15 text-info'"
                >
                  {{ conn.introduced_by === 'partner' ? 'intro → us' : 'intro ← us' }}
                </span>
                <Icon name="lucide:chevron-right" class="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
              </NuxtLink>
              <NuxtLink
                v-for="({ connection: conn, inheritedFromName }) in inheritedConnections"
                :key="`inherited-${conn.id}`"
                :to="`/contacts/${conn.contact?.id || ''}`"
                class="flex items-center gap-3 h-12 px-3 hover:bg-muted/40 border-b border-border/30 last:border-b-0 transition-colors group opacity-75"
              >
                <span class="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                <div class="flex-1 min-w-0 flex items-center gap-2">
                  <p class="text-sm font-medium truncate">{{ conn.contact?.first_name }} {{ conn.contact?.last_name }}</p>
                  <span class="text-[11px] text-muted-foreground truncate">
                    · {{ CONNECTION_ROLE_LABELS[conn.role as keyof typeof CONNECTION_ROLE_LABELS] || conn.role }}
                  </span>
                </div>
                <span class="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-warning/15 text-warning shrink-0">
                  <Icon name="lucide:corner-up-left" class="w-2.5 h-2.5" />
                  via {{ inheritedFromName }}
                </span>
                <Icon name="lucide:chevron-right" class="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
              </NuxtLink>
            </div>
          </div>

          <!-- Messages (channels mirror) -->
          <div v-else-if="activeTab === 'messages'">
            <div v-if="!relatedChannels.length" class="text-sm text-muted-foreground text-center py-10">
              No channels tagged to this client.
            </div>
            <div v-else class="space-y-px">
              <NuxtLink
                v-for="channel in relatedChannels"
                :key="channel.id"
                :to="`/channels/${channel.name}`"
                class="flex items-center gap-3 h-12 px-3 hover:bg-muted/40 border-b border-border/30 last:border-b-0 transition-colors group"
              >
                <span class="text-muted-foreground/40 text-sm shrink-0">#</span>
                <p class="flex-1 text-sm font-medium truncate">{{ channel.name }}</p>
                <span
                  v-if="channel.project?.title"
                  class="hidden md:inline-flex items-center gap-1 text-[11px] text-muted-foreground truncate max-w-[160px]"
                >
                  <Icon name="lucide:folder" class="w-3 h-3 shrink-0" />
                  {{ channel.project.title }}
                </span>
                <span
                  v-else-if="channel.ticket?.title"
                  class="hidden md:inline-flex items-center gap-1 text-[11px] text-muted-foreground truncate max-w-[160px]"
                >
                  <Icon name="lucide:ticket" class="w-3 h-3 shrink-0" />
                  {{ channel.ticket.title }}
                </span>
                <Icon name="lucide:chevron-right" class="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
              </NuxtLink>
            </div>
          </div>
        </div>
      </template>

      <!-- Edit modal -->
      <ClientsFormModal
        v-if="client"
        v-model="showEditModal"
        :client="client"
        @updated="onClientUpdated"
        @deleted="onClientDeleted"
      />

      <!-- Contextual AI Sidebar -->
      <ClientOnly>
        <AIContextualSidebar
          v-if="sidebarOpen && client"
          entity-type="client"
          :entity-id="client.id"
          :entity-label="client.name || 'Client'"
          @close="closeSidebar"
        />
        <Transition name="overlay">
          <div v-if="sidebarOpen" class="fixed inset-0 bg-black/20 z-40" @click="closeSidebar" />
        </Transition>
      </ClientOnly>
    </LayoutPageContainer>

    <!-- Slide-over: contact details (teleported into apps shell root) -->
    <ClientOnly>
      <Teleport to="#app-slide-over-root">
        <AppSlideOver
          v-model="slideOverOpen"
          :title="slideOverContact ? `${slideOverContact.first_name || ''} ${slideOverContact.last_name || ''}`.trim() || 'Contact' : 'Contact'"
        >
          <div v-if="slideOverLoading" class="flex flex-col items-center justify-center py-12 gap-3">
            <Icon name="lucide:loader-2" class="w-6 h-6 text-muted-foreground animate-spin" />
            <p class="text-xs text-muted-foreground">Loading contact...</p>
          </div>

          <div v-else-if="slideOverContact" class="space-y-5">
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 rounded-full bg-muted/60 flex items-center justify-center text-sm font-semibold text-muted-foreground shrink-0">
                {{ (slideOverContact.first_name || '?').charAt(0) }}{{ (slideOverContact.last_name || '').charAt(0) }}
              </div>
              <div class="min-w-0">
                <p class="text-base font-semibold truncate">
                  {{ slideOverContact.first_name }} {{ slideOverContact.last_name }}
                </p>
                <p v-if="slideOverContact.title || slideOverContact.company" class="text-xs text-muted-foreground truncate">
                  {{ [slideOverContact.title, slideOverContact.company].filter(Boolean).join(' · ') }}
                </p>
              </div>
            </div>

            <div class="space-y-2.5 text-sm">
              <div v-if="slideOverContact.email" class="flex items-center gap-2">
                <Icon name="lucide:mail" class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <a :href="`mailto:${slideOverContact.email}`" class="font-mono text-xs hover:text-primary truncate">
                  {{ slideOverContact.email }}
                </a>
              </div>
              <div v-if="slideOverContact.phone" class="flex items-center gap-2">
                <Icon name="lucide:phone" class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <a :href="`tel:${slideOverContact.phone}`" class="text-xs hover:text-primary">
                  {{ slideOverContact.phone }}
                </a>
              </div>
              <div v-if="slideOverContact.client?.name" class="flex items-center gap-2">
                <Icon name="lucide:building-2" class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span class="text-xs">{{ slideOverContact.client.name }}</span>
              </div>
              <div v-if="slideOverContact.category" class="flex items-center gap-2">
                <Icon name="lucide:tag" class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span class="text-xs capitalize">{{ slideOverContact.category }}</span>
              </div>
            </div>

            <div v-if="slideOverContact.notes" class="space-y-1 pt-3 border-t border-border/30">
              <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Notes</p>
              <p class="text-sm whitespace-pre-wrap">{{ slideOverContact.notes }}</p>
            </div>

            <div class="pt-3 border-t border-border/30">
              <NuxtLink
                :to="`/contacts/${slideOverContactId}`"
                class="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Open full contact page
                <Icon name="lucide:external-link" class="w-3 h-3" />
              </NuxtLink>
            </div>
          </div>

          <div v-else class="text-sm text-muted-foreground py-10 text-center">
            Could not load contact.
          </div>
        </AppSlideOver>
      </Teleport>
    </ClientOnly>
  </div>
</template>

<style scoped>
.apps-page {
  @apply flex flex-col min-h-full;
}
</style>
