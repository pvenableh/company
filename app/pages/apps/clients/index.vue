<script setup lang="ts">
import type { Client } from '~~/shared/directus';
import type { Contact } from '~~/shared/email/contacts';
import type { LeadStage } from '~~/shared/leads';
import { Button } from '~/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui/tooltip';
import { useDebounceFn } from '@vueuse/core';
import VueDraggable from 'vuedraggable';

definePageMeta({ layout: 'apps', middleware: ['auth'] });
useHead({ title: 'People | Earnest' });

const router = useRouter();
const route = useRoute();
const config = useRuntimeConfig();

// ── View segmented control ─────────────────────────────────────────────────
// Segments are people-noun lenses. Each one can render its own layout —
// simple list/table for clients/contacts/partners, dashboard-shaped for
// Card Desk and Intelligence. The page wrapper stays the same; the body
// switches via v-if/v-else-if blocks below.
type ViewKey = 'clients' | 'contacts' | 'leads' | 'carddesk' | 'intelligence';
const VIEW_KEYS: ViewKey[] = ['clients', 'contacts', 'leads', 'carddesk', 'intelligence'];

const initialView: ViewKey = (() => {
  const v = route.query.view;
  if (typeof v === 'string' && VIEW_KEYS.includes(v as ViewKey)) return v as ViewKey;
  // Contacts-scoped filters in the URL imply Contacts view — keeps marketing's
  // Segments shortcuts and any deep-linked filter URL landing on the right tab.
  if (route.query.category || route.query.status || route.query.subview) return 'contacts';
  return 'clients';
})();
const view = ref<ViewKey>(initialView);

// Directional left/right slide when switching views — matches Money/Marketing/
// Organization/Work apps (see useDirectionalFloorTransition).
const floorTransition = useDirectionalFloorTransition(VIEW_KEYS, view);

watch(view, (next) => {
  router.replace({ query: { ...route.query, view: next === 'clients' ? undefined : next } });
});

const segments: Array<{ key: ViewKey; label: string; icon: string }> = [
  { key: 'clients', label: 'Clients', icon: 'lucide:building-2' },
  { key: 'contacts', label: 'Contacts', icon: 'lucide:users' },
  { key: 'leads', label: 'Leads', icon: 'lucide:trending-up' },
  { key: 'carddesk', label: 'Card Desk', icon: 'lucide:contact' },
  { key: 'intelligence', label: 'Intelligence', icon: 'earnest' },
];

// ── Intelligence data ──────────────────────────────────────────────────────
const { intelligence, intelligenceLoading, fetchIntelligence } = useCRMIntelligence();

// ── Leads data ─────────────────────────────────────────────────────────────
// Lifted from the standalone /leads page so the Leads tab here is the
// canonical home. /leads now redirects in.
const { getLeads, getLeadStats } = useLeads();
const { isOrgManagerOrAbove } = useOrgRole();

const leadViewCookie = useCookie('leadView', { default: () => 'board' });
const leadActiveView = ref(leadViewCookie.value || 'board');
watch(leadActiveView, (val) => { leadViewCookie.value = val; });
const leadViewOptions = [
  { value: 'board', label: 'Board', icon: 'lucide:columns-3' },
  { value: 'grid', label: 'Grid', icon: 'lucide:layout-grid' },
];

const allLeads = ref<any[]>([]);
const leadStats = ref({
  total: 0,
  by_stage: {} as Record<LeadStage, number>,
  avg_score: 0,
  pipeline_value: 0,
  new_this_week: 0,
});
const leadsLoading = ref(true);
const leadSearch = ref('');
const leadStageFilter = ref('');
const leadPriorityFilter = ref('');

// Manual "New Lead" creation from the Grid view. The Board view has its own
// create button inside LeadsPipelineBoard; the Grid had no way to add a lead.
const showLeadForm = ref(false);
function handleLeadCreated() {
  showLeadForm.value = false;
  fetchLeadsData();
}

async function fetchLeadsData() {
  leadsLoading.value = true;
  try {
    const [leadsResult, statsResult] = await Promise.all([
      getLeads({
        search: leadSearch.value || undefined,
        stage: (leadStageFilter.value || undefined) as LeadStage | undefined,
        priority: leadPriorityFilter.value || undefined,
      } as any),
      getLeadStats(),
    ]);
    allLeads.value = leadsResult as any[];
    leadStats.value = statsResult;
  } catch (e) {
    console.error('[apps/clients] Failed to load leads:', e);
  } finally {
    leadsLoading.value = false;
  }
}

const debouncedLeadSearch = useDebounceFn(() => fetchLeadsData(), 300);
watch(leadSearch, () => debouncedLeadSearch());
watch([leadStageFilter, leadPriorityFilter], () => fetchLeadsData());

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

// Sort-by-rating is a client-side overlay on top of the server sort — ratings
// come from useClientScores (not a Directus column), so we reorder the fetched
// list in place (VueDraggable-safe) and disable drag while it's on.
const sortByRating = ref(false);
const { getScore, load: loadClientScores, scores: clientScores } = useClientScores();
const RATING_RANK: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, F: 4 };

function applyRatingSort() {
  if (!sortByRating.value) return;
  allClients.value = [...allClients.value].sort((a, b) => {
    const sa = getScore(a.id as string);
    const sb = getScore(b.id as string);
    const ra = sa ? RATING_RANK[sa.rating] ?? 9 : 9;
    const rb = sb ? RATING_RANK[sb.rating] ?? 9 : 9;
    if (ra !== rb) return ra - rb;                    // A → F
    return (sb?.revenue || 0) - (sa?.revenue || 0);   // tie-break: revenue desc
  });
}
function enableRatingSort() {
  sortByRating.value = true;
  loadClientScores(selectedOrg.value).then(applyRatingSort);
}
// Re-apply when the scores arrive (async) or the list refetches.
watch(clientScores, () => applyRatingSort(), { deep: true });

// Drag-and-drop is only active in manual sort mode + table view; in activity or
// rating mode the rows are ordered for us and reordering would be a lie.
const canDragSort = computed(
  () => clientsSortMode.value === 'manual' && clientsViewMode.value === 'table' && !sortByRating.value,
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
    applyRatingSort();
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

// Reactive CRUD wiring (universal iOS sweep primitive #7). Subscribe to
// the clients store so any mutation — from the slide-over panel, an inline
// table edit, a child component's modal — triggers a list refresh +
// optimistic row patch within ~200ms of the write.
const clientsStore = useEntityStore<Client>('clients');
clientsStore.onChange((event) => {
  if (event.op === 'update' && event.item) {
    const idx = allClients.value.findIndex((c) => c.id === event.id);
    if (idx >= 0) {
      // Optimistic patch — drop into the rendered list before the debounced
      // refresh below reconciles with the authoritative server state.
      allClients.value.splice(idx, 1, { ...allClients.value[idx], ...event.item });
    }
  } else if (event.op === 'remove') {
    allClients.value = allClients.value.filter((c) => c.id !== event.id);
  }
  // External notifyEntityChange callers already trigger the store's own
  // debounced refresh; we just hook our local list to the event so the
  // page can refetch with its own filter/sort context.
  debouncedFetchClients();
});

// Open the client as an iOS-style slide-over via the universal stack.
// Direct deep-links to `/apps/clients/<id>` still render the full page
// (the route wrapper mounts `<AppsPanelsClientDetailPanel>` for that case).
const clientSlide = useAppSlideOver('client');
function viewClient(client: Client) {
  if (!client?.id) return;
  clientSlide.open(String(client.id));
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
const { fetchCardDeskPromotedIds } = useCardDesk();
// Inner toggle for the Contacts tab: List vs Insights (charts-driven view).
// Routed via `?subview=insights` so the segmented control survives a reload.
const contactsSubview = ref<'list' | 'insights'>(
  route.query.subview === 'insights' ? 'insights' : 'list',
);
watch(contactsSubview, (next) => {
  router.replace({ query: { ...route.query, subview: next === 'insights' ? 'insights' : undefined } });
});

const contacts = ref<Contact[]>([]);
const contactsTotal = ref(0);
const contactsLoading = ref(true);
const contactSearch = ref('');
// Contacts-list filters are routed via `?category=` and `?status=` so
// marketing's Segments shortcuts and any reload preserves the selection.
const VALID_CONTACT_CATEGORIES = new Set<Contact['category']>([
  'client', 'prospect', 'partner', 'architect', 'developer', 'hospitality', 'media',
]);
const initialContactCategory: Contact['category'] | '' = (() => {
  const q = route.query.category;
  return typeof q === 'string' && VALID_CONTACT_CATEGORIES.has(q as Contact['category'])
    ? (q as Contact['category'])
    : '';
})();
const initialContactStatus: string = typeof route.query.status === 'string' ? route.query.status : '';
const contactsFilterStatus = ref(initialContactStatus);
const contactsFilterCategory = ref<Contact['category'] | ''>(initialContactCategory);
const contactsLimit = 50;
const contactsPage = ref(1);
const contactsHasMore = computed(() => contactsPage.value * contactsLimit < contactsTotal.value);
const showCreateContactModal = ref(false);

// FK-backed Card Desk pill set — drives the orange "Card Desk" badge in
// the ContactTable when a row was promoted from a deck card.
const cardDeskContactIds = ref<Set<string>>(new Set());

const contactCategoryChips: Array<{ value: Contact['category'] | ''; label: string }> = [
  { value: '', label: 'All' },
  { value: 'client', label: 'Clients' },
  { value: 'prospect', label: 'Prospects' },
  { value: 'partner', label: 'Partners' },
  { value: 'architect', label: 'Architects' },
  { value: 'developer', label: 'Developers' },
  { value: 'hospitality', label: 'Hospitality' },
  { value: 'media', label: 'Media' },
];
const contactCategoryItems = computed(() => contactCategoryChips.map((c) => ({
  key: c.value || 'all',
  label: c.label,
})));

const contactSlide = useAppSlideOver('contact');
function openContact(c: { id: string }, ev?: MouseEvent) {
  if (!c?.id) return;
  const target = ev?.currentTarget as HTMLElement | null;
  const row = target?.closest('.contact-row, tr, .ios-card') as HTMLElement | null;
  const flipFrom = row ? flipPayloadFrom(row) : flipPayloadFrom(target);
  contactSlide.open(String(c.id), { flipFrom });
}

const leadSlide = useAppSlideOver('lead');
const automationsSlide = useAppSlideOver('lead-automations');
function openLead(lead: { id: string | number }, ev?: MouseEvent) {
  if (!lead?.id) return;
  const target = ev?.currentTarget as HTMLElement | null;
  const flipFrom = flipPayloadFrom(target);
  leadSlide.open(String(lead.id), { flipFrom });
}

async function fetchContacts() {
  contactsLoading.value = true;
  try {
    const result = await getContacts({
      search: contactSearch.value || undefined,
      status: contactsFilterStatus.value || undefined,
      category: contactsFilterCategory.value || undefined,
      limit: contactsLimit,
      page: contactsPage.value,
    });
    contacts.value = result.data;
    contactsTotal.value = result.total;
  } finally {
    contactsLoading.value = false;
  }
}

function selectContactCategory(value: Contact['category'] | '') {
  // Single source of truth — the watch below handles URL sync + refetch.
  contactsFilterCategory.value = value;
}

const debouncedFetchContacts = useDebounceFn(() => {
  contactsPage.value = 1;
  fetchContacts();
}, 300);

watch(contactsFilterCategory, (next) => {
  router.replace({ query: { ...route.query, category: next || undefined } });
  contactsPage.value = 1;
  fetchContacts();
});
watch(contactsFilterStatus, (next) => {
  router.replace({ query: { ...route.query, status: next || undefined } });
  contactsPage.value = 1;
  fetchContacts();
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
let leadsLoaded = false;
let intelligenceLoaded = false;

watch(view, (next) => {
  if (next === 'contacts' && !contactsLoaded) {
    contactsLoaded = true;
    fetchContacts();
    // Single-field query; empty perms yield an empty Set — fire-and-forget.
    fetchCardDeskPromotedIds().then((set) => { cardDeskContactIds.value = set; });
  }
  if (next === 'leads' && !leadsLoaded) {
    leadsLoaded = true;
    fetchLeadsData();
  }
  if (next === 'intelligence' && !intelligenceLoaded) {
    intelligenceLoaded = true;
    fetchIntelligence();
  }
}, { immediate: true });
</script>

<template>
  <div class="apps-page">
    <AppHeader title="People" app-id="clients">
      <template #actions>
        <Button v-if="view === 'clients'" size="sm" @click="showCreateClientModal = true">
          <Icon name="lucide:plus" class="w-4 h-4 mr-1" />
          Add Client
        </Button>
        <Button v-else-if="view === 'contacts'" size="sm" @click="showCreateContactModal = true">
          <Icon name="lucide:plus" class="w-4 h-4 mr-1" />
          Add Contact
        </Button>
        <TooltipProvider v-if="view === 'leads' && isOrgManagerOrAbove" :delay-duration="200">
          <Tooltip>
            <TooltipTrigger as-child>
              <Button variant="outline" size="sm" @click="automationsSlide.open('_')">
                <Icon name="lucide:zap" class="w-4 h-4 mr-1" />
                Automations
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" :side-offset="8" class="max-w-xs text-xs leading-snug">
              Set up rules that fire when a lead is created or its stage changes — auto-assign to a teammate, send a follow-up email, create a task, schedule a check-in. Org-manager only.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </template>
    </AppHeader>

    <LayoutPageContainer>
      <AppFloorStrip v-model="view" :items="segments" aria-label="Clients sections" />

      <AppIntroCard app-id="clients" />
      <GoalsRelatedGoalsCard :categories="['growth', 'retention']" title="Goals in this lens" />

      <Transition :name="floorTransition" mode="out-in">
      <div :key="view">
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
                :class="!sortByRating && clientsSortMode === 'activity' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
                @click="sortByRating = false; setClientsSortMode('activity')"
              >
                <Icon name="lucide:activity" class="w-3.5 h-3.5" />
                Recent
              </button>
              <button
                type="button"
                class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-colors"
                :class="!sortByRating && clientsSortMode === 'manual' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
                @click="sortByRating = false; setClientsSortMode('manual')"
              >
                <Icon name="lucide:grip-vertical" class="w-3.5 h-3.5" />
                Manual
              </button>
              <button
                type="button"
                class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-colors"
                :class="sortByRating ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
                title="Sort by Earnest client rating (A → F)"
                @click="enableRatingSort()"
              >
                <EarnestIcon class="w-3.5 h-3.5" />
                Rating
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
            class="flex-1 min-w-48 rounded-full border bg-background px-3 py-2 text-sm"
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
                      <ClientsClientRatingBadge :client-id="client.id" size="xs" />
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
        <!-- Inner List | Insights toggle (universal pill style) -->
        <div class="mb-4 flex items-center gap-1 rounded-full border border-border bg-card p-0.5 w-fit">
          <button
            type="button"
            class="rounded-full px-3 py-1 text-xs font-medium transition-colors"
            :class="contactsSubview === 'list' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'"
            @click="contactsSubview = 'list'"
          >
            <Icon name="lucide:list" class="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
            List
          </button>
          <button
            type="button"
            class="rounded-full px-3 py-1 text-xs font-medium transition-colors"
            :class="contactsSubview === 'insights' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'"
            @click="contactsSubview = 'insights'"
          >
            <Icon name="lucide:bar-chart-3" class="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
            Insights
          </button>
        </div>

        <ContactsInsightsView v-if="contactsSubview === 'insights'" />

        <template v-else>
        <!-- Category tabs — same UTabs strip used on the standalone /contacts -->
        <UTabs
          :model-value="contactsFilterCategory || 'all'"
          :items="contactCategoryItems"
          class="mb-3 w-fit"
          @update:model-value="(v) => selectContactCategory(v === 'all' ? '' : (v as Contact['category']))"
        />

        <!-- Search + status filter -->
        <div class="flex gap-3 mb-5 flex-wrap items-center">
          <input
            v-model="contactSearch"
            type="search"
            placeholder="Search name, email, company..."
            class="flex-1 min-w-48 rounded-full border bg-background px-3 py-2 text-sm"
            @input="debouncedFetchContacts"
          />
          <select
            v-model="contactsFilterStatus"
            class="rounded-md border bg-background px-3 py-2 text-sm w-36"
          >
            <option value="">All Statuses</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
            <option value="unsubscribed">Unsubscribed</option>
          </select>
        </div>

        <ContactsContactTable
          :contacts="contacts"
          :loading="contactsLoading"
          :card-desk-contact-ids="cardDeskContactIds"
          quick-edit
          @edit="openContact"
          @patched="fetchContacts"
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
        </template> <!-- /contacts list subview -->
      </template>

      <!-- Partners removed as a top-level segment 2026-05-18 — partner-network
           rollup lives on the Intelligence tab (Partner ROI card) and per-
           contact connection detail lives on /contacts/[id]. The Contacts
           tab's category=partner filter is the everyday distinct-people view. -->

      <!-- ── Leads view ───────────────────────────────────────────────── -->
      <!-- Lifted in from the standalone /leads page. Stats hero + Board/Grid
           toggle + filters. /leads/[id] and /leads/automations stay as their
           own routes; this tab is just the list. -->
      <template v-else-if="view === 'leads'">

        <!-- Board | Grid toggle (universal pill style) -->
        <div class="mb-6 flex items-center gap-1 rounded-full border border-border bg-card p-0.5 w-fit">
          <button
            v-for="opt in leadViewOptions"
            :key="opt.value"
            type="button"
            class="rounded-full px-3 py-1 text-xs font-medium transition-colors"
            :class="leadActiveView === opt.value ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'"
            @click="leadActiveView = opt.value"
          >
            <Icon :name="opt.icon" class="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
            {{ opt.label }}
          </button>
        </div>

        <div v-show="leadActiveView === 'board'">
          <LeadsPipelineBoard />
        </div>

        <div v-show="leadActiveView !== 'board'">
          <div class="flex justify-end mb-3">
            <UiActionButton icon="lucide:plus" @click="showLeadForm = true">
              New Lead
            </UiActionButton>
          </div>
          <LeadsLeadFilters
            v-model:search="leadSearch"
            v-model:stage="leadStageFilter"
            v-model:priority="leadPriorityFilter"
            class="mb-4"
            @clear="fetchLeadsData"
          />
          <div v-if="leadsLoading" class="flex items-center justify-center py-20">
            <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
          <div v-else-if="allLeads.length" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <LeadsLeadCard
              v-for="lead in allLeads"
              :key="lead.id"
              :lead="lead"
              @click="openLead"
            />
          </div>
          <div v-else class="text-center py-20">
            <UIcon name="i-heroicons-inbox" class="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p class="text-muted-foreground">No leads found</p>
            <p class="text-xs text-muted-foreground/70 mt-1">Leads from your website forms will appear here</p>
            <div class="mt-4">
              <UiActionButton icon="lucide:plus" @click="showLeadForm = true">
                New Lead
              </UiActionButton>
            </div>
          </div>
        </div>

        <!-- Manual lead creation (Grid view) -->
        <LeadsFormModal
          v-model="showLeadForm"
          :organization-id="selectedOrg"
          @created="handleLeadCreated"
        />
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
      </div>
      </Transition>

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
