<script setup lang="ts">
import type { Client, ContactConnection } from '~~/shared/directus';
import { Button } from '~/components/ui/button';
import { CONNECTION_ROLE_LABELS } from '~/composables/useContactConnections';

definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Client Details | Earnest' });

const route = useRoute();
const router = useRouter();
const config = useRuntimeConfig();
const clientId = route.params.id as string;

const { getClient, updateClient } = useClients();
const { setEntity, clearEntity, sidebarOpen, closeSidebar } = useEntityPageContext();
const { getStatusBadgeClasses } = useStatusStyle();

const projectItemsApi = useDirectusItems('projects');
const ticketItemsApi = useDirectusItems('tickets');
const { listForClient: listConnectionsForClient, getAncestorClientIds } = useContactConnections();

const client = ref<Client | null>(null);
const relatedContacts = computed<any[]>(() => {
  const contacts = (client.value as any)?.contacts;
  return Array.isArray(contacts) ? contacts : [];
});
const relatedProjects = ref<any[]>([]);
const relatedTickets = ref<any[]>([]);
const directConnections = computed<any[]>(() => {
  const list = (client.value as any)?.partner_connections;
  return Array.isArray(list) ? list : [];
});
const inheritedConnections = ref<Array<{ connection: any; inheritedFromId: string; inheritedFromName: string }>>([]);
const inheritedContacts = ref<Array<{ contact: any; inheritedFromId: string; inheritedFromName: string }>>([]);
const contactItemsApi = useDirectusItems('contacts');
const loading = ref(true);
const saving = ref(false);
const showEditModal = ref(false);
const error = ref<string | null>(null);
const activeTab = ref<'contacts' | 'partners' | 'projects' | 'tickets' | 'social'>('contacts');
const toast = useToast();

// --- Logo Upload ---
const { processUpload, uploadFilesWithProgress, startUpload, resetUploadState, isUploading: logoUploading } = useFileUpload();
const clientLogoInput = ref<HTMLInputElement | null>(null);

const onClientLogoSelected = async (event: Event) => {
	const file = (event.target as HTMLInputElement).files?.[0];
	if (!file || !client.value?.id) return;

	startUpload();
	try {
		const result = await processUpload([file]);
		if (!result.success) {
			toast.add({ title: 'Error', description: result.errors[0], color: 'red' });
			return;
		}
		// Route logo to client's own folder
		const clientFolder = client.value.folder
			? (typeof client.value.folder === 'object' ? (client.value.folder as any).id : client.value.folder)
			: null;
		if (clientFolder) result.formData.append('folder', clientFolder);
		const uploaded = await uploadFilesWithProgress(result.formData);
		const fileId = uploaded?.id || uploaded?.[0]?.id;
		if (fileId) {
			await updateClient(client.value.id as string, { logo: fileId });
			toast.add({ title: 'Success', description: 'Logo updated', color: 'green' });
			await loadClient();
		}
	} catch (err) {
		console.error('Logo upload failed:', err);
		toast.add({ title: 'Error', description: 'Failed to upload logo', color: 'red' });
	} finally {
		resetUploadState();
		if (clientLogoInput.value) clientLogoInput.value.value = '';
	}
};

async function loadRelated() {
  // Contacts now sourced from client.contacts O2M inverse projected in getClient().
  const [projects, tickets] = await Promise.all([
    projectItemsApi.list({
      filter: { client: { _eq: clientId } },
      fields: ['id', 'title', 'status'],
      limit: -1,
    }).catch(() => []),
    ticketItemsApi.list({
      filter: { client: { _eq: clientId } },
      fields: ['id', 'title', 'status'],
      limit: -1,
    }).catch(() => []),
  ]);
  relatedProjects.value = projects;
  relatedTickets.value = tickets;
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

async function loadClient() {
  loading.value = true;
  error.value = null;
  try {
    client.value = await getClient(clientId);
    await loadRelated();
    await resolveEffectiveBilling();
  } catch (e: any) {
    error.value = e?.message || 'Failed to load client';
  } finally {
    loading.value = false;
  }
}

async function handleUpdate(data: Partial<Client>) {
  saving.value = true;
  error.value = null;
  try {
    await updateClient(clientId, data);
    client.value = await getClient(clientId);
    await Promise.all([resolveIndustryName(), loadRelated()]);
  } catch (e: any) {
    error.value = e?.message || 'Failed to update client';
  } finally {
    saving.value = false;
  }
}

async function onClientUpdated(updated: Client) {
  client.value = updated;
  await Promise.all([resolveIndustryName(), loadRelated(), resolveEffectiveBilling()]);
}

function onClientDeleted() {
  router.push('/clients');
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

const totalPartnerCount = computed(() => directConnections.value.length + inheritedConnections.value.length);
const totalContactCount = computed(() => relatedContacts.value.length + inheritedContacts.value.length);

// Resolve effective billing by walking parent_client up to depth 3.
// At each level, returns first match where billing_email or billing_contacts exists.
const effectiveBilling = ref<{
  source: 'self' | 'inherited';
  fromId: string | null;
  fromName: string | null;
  bill_to: string | null;
  email: string | null;
  address: string | null;
  terms: string | null;
} | null>(null);

const PAYMENT_TERMS_LABELS: Record<string, string> = {
  due_on_receipt: 'Due on receipt',
  net_15: 'Net 15',
  net_30: 'Net 30',
  net_45: 'Net 45',
  net_60: 'Net 60',
};

const clientItemsApi = useDirectusItems('clients');

async function resolveEffectiveBilling() {
  effectiveBilling.value = null;
  if (!client.value) return;

  const fetchLevel = (id: string) => clientItemsApi.get(id, {
    fields: [
      'id', 'name', 'billing_email', 'billing_name', 'billing_address',
      'billing_contacts', 'payment_terms',
      'contacts.id', 'contacts.email', 'contacts.first_name', 'contacts.last_name', 'contacts.is_billing_contact',
    ],
  }) as Promise<any>;

  const ancestors = await getAncestorClientIds(clientId, 3);
  const chain: Array<{ id: string; name: string; data: any }> = [];
  // Self first
  const self = await fetchLevel(clientId).catch(() => null);
  if (self) chain.push({ id: clientId, name: self.name || client.value.name || '', data: self });
  for (const a of ancestors) {
    const data = await fetchLevel(a.id).catch(() => null);
    if (data) chain.push({ id: a.id, name: a.name, data });
  }

  for (let i = 0; i < chain.length; i++) {
    const level = chain[i];
    const data = level.data;
    const legacy = Array.isArray(data.billing_contacts)
      ? data.billing_contacts.find((c: any) => c.email?.trim())
      : null;
    const flagged = Array.isArray(data.contacts)
      ? data.contacts.find((c: any) => c.is_billing_contact && c.email?.trim())
      : null;
    if (!legacy && !flagged && !data.billing_email) continue;

    const primaryEmail = legacy?.email
      || (flagged?.email)
      || data.billing_email
      || null;
    const primaryName = legacy?.name
      || (flagged ? `${flagged.first_name || ''} ${flagged.last_name || ''}`.trim() : null)
      || data.billing_name
      || null;

    effectiveBilling.value = {
      source: i === 0 ? 'self' : 'inherited',
      fromId: i === 0 ? null : level.id,
      fromName: i === 0 ? null : level.name,
      bill_to: primaryName,
      email: primaryEmail,
      address: data.billing_address || null,
      terms: data.payment_terms ? (PAYMENT_TERMS_LABELS[data.payment_terms] || data.payment_terms) : null,
    };
    return;
  }
}

// Merged contacts list: direct + inherited, billing-first sort.
type MergedContact = {
  contact: any;
  source: 'direct' | 'inherited';
  inheritedFromId?: string | null;
  inheritedFromName?: string | null;
  isBilling: boolean;
};

const mergedContacts = computed<MergedContact[]>(() => {
  const direct: MergedContact[] = relatedContacts.value.map(c => ({
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
  const all = [...direct, ...inherited];
  // Billing first, then direct, then inherited
  return all.sort((a, b) => {
    if (a.isBilling !== b.isBilling) return a.isBilling ? -1 : 1;
    if (a.source !== b.source) return a.source === 'direct' ? -1 : 1;
    return 0;
  });
});

// Add Existing Contact modal state
const showAddExistingModal = ref(false);

async function onContactAttached() {
  showAddExistingModal.value = false;
  await loadClient();
}

const tabs = [
  { key: 'contacts', label: 'Contacts', icon: 'lucide:users' },
  { key: 'partners', label: 'Partners', icon: 'lucide:hub' },
  { key: 'projects', label: 'Projects', icon: 'lucide:folder-kanban' },
  { key: 'tickets', label: 'Tickets', icon: 'lucide:ticket' },
  { key: 'social', label: 'Social', icon: 'lucide:share-2' },
] as const;

// Social accounts assigned to this client
import type { SocialAccountPublic } from '~~/shared/social';
const socialAccounts = ref<SocialAccountPublic[]>([]);
async function loadSocialAccounts() {
  try {
    const res = await $fetch<{ data: SocialAccountPublic[] }>('/api/social/accounts', {
      query: { client: route.params.id as string },
    });
    socialAccounts.value = res?.data || [];
  } catch {
    socialAccounts.value = [];
  }
}

const platformIconFor: Record<string, string> = {
  instagram: 'lucide:instagram',
  tiktok: 'lucide:music',
  linkedin: 'lucide:linkedin',
  facebook: 'lucide:facebook',
  threads: 'lucide:at-sign',
};

const { isOrgAdminOrAbove } = useOrgRole();

// Resolve industry name (handles both expanded object and raw ID)
const industryItems = useDirectusItems('industries');
const industryName = ref<string | null>(null);

async function resolveIndustryName() {
  if (!client.value?.industry) { industryName.value = null; return; }
  if (typeof client.value.industry === 'object' && (client.value.industry as any)?.name) {
    industryName.value = (client.value.industry as any).name;
    return;
  }
  // It's a raw ID string — fetch the name
  try {
    const ind = await industryItems.get(client.value.industry as string, { fields: ['id', 'name'] });
    industryName.value = (ind as any)?.name || null;
  } catch { industryName.value = null; }
}

// Primary contact editing
const showContactPicker = ref(false);

async function setPrimaryContact(contactId: string | null) {
  saving.value = true;
  try {
    await updateClient(clientId, { primary_contact: contactId } as any);
    client.value = await getClient(clientId);
    showContactPicker.value = false;
  } catch (e: any) {
    error.value = e?.message || 'Failed to update primary contact';
  } finally {
    saving.value = false;
  }
}

// Tag management from sidebar
const newSidebarTag = ref('');
async function addSidebarTag() {
  const tag = newSidebarTag.value.trim().toLowerCase();
  if (!tag || !client.value) return;
  const currentTags = [...(client.value.tags || [])];
  if (currentTags.includes(tag)) { newSidebarTag.value = ''; return; }
  currentTags.push(tag);
  await handleUpdate({ tags: currentTags } as any);
  newSidebarTag.value = '';
}

async function removeSidebarTag(tag: string) {
  if (!client.value) return;
  const currentTags = (client.value.tags || []).filter((t: string) => t !== tag);
  await handleUpdate({ tags: currentTags } as any);
}

onMounted(async () => {
  await loadClient();
  await resolveIndustryName();
  await loadSocialAccounts();
});

// Register entity context for dock AI button awareness
watch(client, (c) => {
  if (c) setEntity('client', c.id, c.name || 'Client');
}, { immediate: true });
onUnmounted(() => clearEntity());
</script>

<template>
  <LayoutPageContainer>
    <!-- Loading State -->
    <div v-if="loading" class="flex flex-col items-center justify-center py-24 gap-3">
      <Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
      <p class="text-sm text-muted-foreground">Loading client...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="error && !client" class="flex flex-col items-center justify-center py-24 gap-4">
      <Icon name="lucide:alert-circle" class="w-10 h-10 text-destructive" />
      <p class="text-sm text-destructive">{{ error }}</p>
      <div class="flex gap-2">
        <NuxtLink to="/clients">
          <Button variant="outline" size="sm">
            <Icon name="lucide:arrow-left" class="w-4 h-4 mr-1" />
            Back to Clients
          </Button>
        </NuxtLink>
        <Button size="sm" @click="loadClient">
          <Icon name="lucide:refresh-cw" class="w-4 h-4 mr-1" />
          Retry
        </Button>
      </div>
    </div>

    <!-- Client Detail -->
    <template v-else-if="client">
      <!-- Back link -->
      <NuxtLink
        to="/clients"
        class="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors mt-4 mb-2"
      >
        <Icon name="lucide:chevron-left" class="w-3 h-3" />
        Clients
      </NuxtLink>

      <!-- Header -->
      <div class="flex items-center justify-between mb-5">
        <div class="flex items-center gap-2.5">
          <div class="shrink-0 relative group">
            <img
              v-if="getLogoUrl(client)"
              :src="getLogoUrl(client)!"
              :alt="client.name"
              class="w-8 h-8 rounded-lg object-contain"
            />
            <div
              v-else
              class="w-8 h-8 rounded-lg bg-muted/60 flex items-center justify-center text-xs font-semibold text-muted-foreground"
            >
              {{ getInitial(client.name) }}
            </div>
            <button
              class="absolute inset-0 w-8 h-8 rounded-lg bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors cursor-pointer"
              :disabled="logoUploading"
              @click="clientLogoInput?.click()"
            >
              <Icon
                :name="logoUploading ? 'lucide:loader-2' : 'lucide:camera'"
                :class="['w-3.5 h-3.5 text-white opacity-0 group-hover:opacity-100 transition-opacity', logoUploading && 'animate-spin opacity-100']"
              />
            </button>
            <input
              ref="clientLogoInput"
              type="file"
              accept="image/*"
              class="hidden"
              @change="onClientLogoSelected"
            />
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h1 class="text-base font-semibold">{{ client.name }}</h1>
              <span
                v-if="client.account_state"
                class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize"
                :class="getStatusBadgeClasses(client.account_state)"
              >
                {{ client.account_state }}
              </span>
            </div>
            <p v-if="client.industry" class="text-xs text-muted-foreground">{{ industryName || '\u2014' }}</p>
          </div>
        </div>
        <div class="flex items-center gap-1.5">
          <button
            class="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-border text-xs font-medium text-primary hover:bg-primary/10 hover:border-primary/30 transition-colors"
            @click="sidebarOpen = true"
          >
            <Icon name="lucide:sparkles" class="w-3.5 h-3.5" />
            <span class="hidden sm:inline">Ask Earnest</span>
          </button>
          <button
            class="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors"
            @click="showEditModal = true"
          >
            <Icon name="lucide:pencil" class="w-3.5 h-3.5" />
            <span class="hidden sm:inline">Edit</span>
          </button>
        </div>
      </div>

      <!-- Inline error banner -->
      <div
        v-if="error"
        class="mb-4 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
      >
        <Icon name="lucide:alert-circle" class="w-4 h-4 shrink-0" />
        {{ error }}
        <button class="ml-auto text-destructive/60 hover:text-destructive" @click="error = null">
          <Icon name="lucide:x" class="w-4 h-4" />
        </button>
      </div>

      <!-- AI Notices -->
      <ClientOnly>
        <AIProactiveNotices entity-type="client" :entity-id="client.id" />
      </ClientOnly>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Main -->
        <div class="lg:col-span-2 space-y-6">
          <!-- Client Details summary -->
          <div class="ios-card p-6 space-y-4">
            <div class="flex items-start justify-between">
              <h2 class="text-[10px] uppercase tracking-wider text-muted-foreground">Client Details</h2>
            </div>

            <div class="grid grid-cols-2 gap-4 text-sm">
              <div class="space-y-1">
                <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Name</p>
                <p class="font-medium">{{ client.name }}</p>
              </div>
              <div class="space-y-1">
                <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Website</p>
                <a
                  v-if="client.website"
                  :href="client.website"
                  target="_blank"
                  class="text-primary hover:underline text-xs break-all"
                >
                  {{ client.website.replace(/^https?:\/\//, '') }}
                </a>
                <p v-else class="text-muted-foreground">&mdash;</p>
              </div>
              <div class="space-y-1">
                <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Industry</p>
                <p>{{ industryName || '\u2014' }}</p>
              </div>
              <div v-if="client.slug" class="space-y-1">
                <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Slug</p>
                <p class="font-mono text-xs text-muted-foreground">{{ client.slug }}</p>
              </div>
            </div>

            <!-- Billing contacts -->
            <div
              v-if="Array.isArray(client.billing_contacts) && client.billing_contacts.length"
              class="pt-3 border-t border-border/30 space-y-1.5"
            >
              <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Billing Contacts</p>
              <div class="space-y-1">
                <div
                  v-for="(contact, i) in (client.billing_contacts as any[])"
                  :key="i"
                  class="flex items-center gap-2 text-sm"
                >
                  <span class="font-medium">{{ contact.name || 'Unnamed' }}</span>
                  <span v-if="contact.email" class="text-xs text-muted-foreground">{{ contact.email }}</span>
                  <span
                    v-if="i === 0"
                    class="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary/15 text-primary"
                  >TO</span>
                  <span
                    v-else
                    class="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground"
                  >CC</span>
                </div>
              </div>
            </div>

            <!-- Notes -->
            <div v-if="client.notes" class="pt-3 border-t border-border/30 space-y-1">
              <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Notes</p>
              <p class="text-sm whitespace-pre-wrap text-muted-foreground">{{ client.notes }}</p>
            </div>

            <!-- Brand & strategy (shown when any populated) -->
            <div
              v-if="client.brand_direction || client.goals || client.target_audience || client.location"
              class="pt-3 border-t border-border/30 space-y-3"
            >
              <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Brand &amp; Strategy</p>
              <div v-if="client.brand_direction" class="space-y-1">
                <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Brand Direction</p>
                <p class="text-sm whitespace-pre-wrap">{{ client.brand_direction }}</p>
              </div>
              <div v-if="client.goals" class="space-y-1">
                <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Goals</p>
                <p class="text-sm whitespace-pre-wrap">{{ client.goals }}</p>
              </div>
              <div v-if="client.target_audience" class="space-y-1">
                <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Target Audience</p>
                <p class="text-sm whitespace-pre-wrap">{{ client.target_audience }}</p>
              </div>
              <div v-if="client.location" class="space-y-1">
                <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Location</p>
                <p class="text-sm">{{ client.location }}</p>
              </div>
            </div>
          </div>

          <!-- Effective Billing card -->
          <div v-if="effectiveBilling" class="ios-card p-6 space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <h2 class="text-[10px] uppercase tracking-wider text-muted-foreground">Effective Billing</h2>
                <span
                  v-if="effectiveBilling.source === 'inherited' && effectiveBilling.fromName"
                  class="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 font-medium"
                >
                  <Icon name="lucide:corner-up-left" class="w-3 h-3" />
                  via {{ effectiveBilling.fromName }}
                </span>
              </div>
              <button
                class="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors"
                @click="showEditModal = true"
              >
                <Icon name="lucide:pencil" class="w-3.5 h-3.5" />
                Edit
              </button>
            </div>
            <div class="grid grid-cols-[80px_1fr] gap-y-1.5 gap-x-3 text-sm">
              <span class="text-[10px] uppercase tracking-wider text-muted-foreground self-center">Bill to</span>
              <span class="font-medium">{{ effectiveBilling.bill_to || '—' }}</span>

              <span class="text-[10px] uppercase tracking-wider text-muted-foreground self-center">Email</span>
              <span class="font-mono text-xs">{{ effectiveBilling.email || '—' }}</span>

              <span class="text-[10px] uppercase tracking-wider text-muted-foreground self-start mt-0.5">Address</span>
              <span class="text-xs whitespace-pre-line">{{ effectiveBilling.address || '—' }}</span>

              <span class="text-[10px] uppercase tracking-wider text-muted-foreground self-center">Terms</span>
              <span class="text-xs">{{ effectiveBilling.terms || '—' }}</span>
            </div>
          </div>

          <!-- Related Items Tabs -->
          <div class="ios-card p-6">
            <div class="flex flex-wrap gap-1.5 mb-4">
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
                <span class="text-[10px] opacity-70 ml-0.5">
                  {{ tab.key === 'contacts' ? totalContactCount
                      : tab.key === 'partners' ? totalPartnerCount
                      : tab.key === 'projects' ? relatedProjects.length
                      : tab.key === 'tickets' ? relatedTickets.length
                      : socialAccounts.length }}
                </span>
              </button>
            </div>

            <!-- Contacts Tab -->
            <div v-if="activeTab === 'contacts'">
              <div class="flex items-center justify-end gap-1.5 mb-3">
                <button
                  class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-border text-[11px] font-medium hover:bg-muted transition-colors"
                  @click="showAddExistingModal = true"
                >
                  <Icon name="lucide:link" class="w-3 h-3" />
                  Add Existing
                </button>
                <NuxtLink
                  to="/contacts"
                  class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-primary text-primary-foreground text-[11px] font-medium hover:bg-primary/90 transition-colors"
                >
                  <Icon name="lucide:plus" class="w-3 h-3" />
                  New Contact
                </NuxtLink>
              </div>

              <div v-if="!mergedContacts.length" class="text-sm text-muted-foreground text-center py-6">
                No contacts linked to this client.
              </div>

              <div v-else class="space-y-px">
                <NuxtLink
                  v-for="row in mergedContacts"
                  :key="`${row.source}-${row.contact.id}`"
                  :to="`/contacts/${row.contact.id}`"
                  class="flex items-center gap-3 h-12 px-3 hover:bg-muted/40 border-b border-border/30 last:border-b-0 transition-colors group"
                >
                  <span
                    class="w-1.5 h-1.5 rounded-full shrink-0"
                    :class="row.isBilling ? 'bg-emerald-500' : row.source === 'direct' ? 'bg-primary/60' : 'bg-muted-foreground/40'"
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
                    class="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 shrink-0"
                  >Billing</span>
                  <span
                    v-if="row.source === 'inherited' && row.inheritedFromName"
                    class="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-500 shrink-0"
                  >
                    <Icon name="lucide:corner-up-left" class="w-2.5 h-2.5" />
                    via {{ row.inheritedFromName }}
                  </span>
                  <Icon name="lucide:chevron-right" class="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
                </NuxtLink>
              </div>
            </div>

            <!-- Partners Tab -->
            <div v-if="activeTab === 'partners'">
              <div v-if="!totalPartnerCount" class="text-sm text-muted-foreground text-center py-6">
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
                    :class="conn.introduced_by === 'partner' ? 'bg-violet-500/15 text-violet-500' : 'bg-sky-500/15 text-sky-500'"
                  >
                    {{ conn.introduced_by === 'partner' ? 'intro → us' : 'intro ← us' }}
                  </span>
                  <Icon name="lucide:chevron-right" class="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
                </NuxtLink>
                <NuxtLink
                  v-for="({ connection: conn, inheritedFromId, inheritedFromName }) in inheritedConnections"
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
                  <span class="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-500 shrink-0">
                    <Icon name="lucide:corner-up-left" class="w-2.5 h-2.5" />
                    via {{ inheritedFromName }}
                  </span>
                  <Icon name="lucide:chevron-right" class="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
                </NuxtLink>
              </div>
            </div>

            <!-- Projects Tab -->
            <div v-if="activeTab === 'projects'">
              <div v-if="!relatedProjects.length" class="text-sm text-muted-foreground text-center py-6">
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
                  <Icon name="lucide:chevron-right" class="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
                </NuxtLink>
              </div>
            </div>

            <!-- Tickets Tab -->
            <div v-if="activeTab === 'tickets'">
              <div v-if="!relatedTickets.length" class="text-sm text-muted-foreground text-center py-6">
                No tickets linked to this client.
              </div>
              <div v-else class="space-y-px">
                <NuxtLink
                  v-for="ticket in relatedTickets"
                  :key="ticket.id"
                  :to="`/tickets/${ticket.id}`"
                  class="flex items-center gap-3 h-12 px-3 hover:bg-muted/40 border-b border-border/30 last:border-b-0 transition-colors group"
                  :class="ticket.status === 'closed' || ticket.status === 'resolved' ? 'opacity-60' : ''"
                >
                  <span class="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0" />
                  <p class="flex-1 text-sm font-medium truncate">{{ ticket.title }}</p>
                  <span
                    v-if="ticket.status"
                    class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0"
                    :class="getStatusBadgeClasses(ticket.status)"
                  >
                    {{ ticket.status }}
                  </span>
                  <Icon name="lucide:chevron-right" class="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
                </NuxtLink>
              </div>
            </div>

            <!-- Social Tab -->
            <div v-if="activeTab === 'social'">
              <div class="flex items-center justify-end gap-1.5 mb-3">
                <NuxtLink
                  to="/social/settings"
                  class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-primary text-primary-foreground text-[11px] font-medium hover:bg-primary/90 transition-colors"
                >
                  <Icon name="lucide:plug" class="w-3 h-3" />
                  Manage Connections
                </NuxtLink>
              </div>

              <div v-if="!socialAccounts.length" class="text-sm text-muted-foreground text-center py-6">
                No social accounts assigned to this client.
              </div>

              <div v-else class="space-y-px">
                <div
                  v-for="acc in socialAccounts"
                  :key="acc.id"
                  class="flex items-center gap-3 h-12 px-3 border-b border-border/30 last:border-b-0"
                >
                  <Icon :name="platformIconFor[acc.platform] || 'lucide:share-2'" class="w-4 h-4 text-muted-foreground shrink-0" />
                  <p class="flex-1 text-sm font-medium truncate">{{ acc.account_name }}</p>
                  <span class="text-xs text-muted-foreground truncate">@{{ acc.account_handle }}</span>
                  <span
                    class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0"
                    :class="acc.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'"
                  >
                    {{ acc.status }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Sidebar -->
        <div class="space-y-4">
          <!-- Quick Info -->
          <div class="ios-card p-5">
            <h3 class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-3">Info</h3>
            <div class="space-y-2.5 text-sm">
              <div class="flex justify-between items-baseline">
                <span class="text-[10px] uppercase tracking-wider text-muted-foreground">Organization</span>
                <span>{{ (client.organization as any)?.name || '\u2014' }}</span>
              </div>
              <div class="flex justify-between items-baseline">
                <span class="text-[10px] uppercase tracking-wider text-muted-foreground">Website</span>
                <a
                  v-if="client.website"
                  :href="client.website"
                  target="_blank"
                  class="text-blue-400 hover:text-blue-300 truncate max-w-[140px]"
                >
                  {{ client.website.replace(/^https?:\/\//, '') }}
                </a>
                <span v-else>&#x2014;</span>
              </div>
              <div class="flex justify-between items-baseline">
                <span class="text-[10px] uppercase tracking-wider text-muted-foreground">Industry</span>
                <span>{{ industryName || '\u2014' }}</span>
              </div>
              <div v-if="client.billing_address" class="flex justify-between items-baseline">
                <span class="text-[10px] uppercase tracking-wider text-muted-foreground">Address</span>
                <span class="text-right text-xs max-w-[160px]">{{ client.billing_address }}</span>
              </div>
              <div class="flex justify-between items-baseline">
                <span class="text-[10px] uppercase tracking-wider text-muted-foreground">Created</span>
                <span>{{ client.date_created ? new Date(client.date_created).toLocaleDateString() : '\u2014' }}</span>
              </div>
              <div class="flex justify-between items-baseline">
                <span class="text-[10px] uppercase tracking-wider text-muted-foreground">Updated</span>
                <span>{{ client.date_updated ? new Date(client.date_updated).toLocaleDateString() : '\u2014' }}</span>
              </div>
            </div>
          </div>

          <!-- Tags -->
          <div class="ios-card p-5">
            <h3 class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-3">Tags</h3>
            <div class="flex flex-wrap gap-1.5 mb-2">
              <span
                v-for="tag in (client.tags || [])"
                :key="tag"
                class="group inline-flex items-center rounded-full bg-muted/60 px-2.5 py-0.5 text-xs text-muted-foreground"
              >
                {{ tag }}
                <button
                  class="ml-1 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/60 hover:text-destructive"
                  @click="removeSidebarTag(tag)"
                >
                  <Icon name="lucide:x" class="w-3 h-3" />
                </button>
              </span>
            </div>
            <form class="flex gap-1.5" @submit.prevent="addSidebarTag">
              <input
                v-model="newSidebarTag"
                type="text"
                placeholder="Add tag..."
                class="flex-1 h-7 px-2.5 text-xs rounded-lg border border-border bg-transparent placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
              <Button type="submit" variant="ghost" size="sm" class="h-7 w-7 p-0" :disabled="!newSidebarTag.trim()">
                <Icon name="lucide:plus" class="w-3.5 h-3.5" />
              </Button>
            </form>
          </div>

          <!-- Primary Contact -->
          <div class="ios-card p-5">
            <h3 class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-3 flex items-center justify-between">
              <span>Primary Contact</span>
              <button
                class="text-xs text-muted-foreground hover:text-foreground transition-colors"
                @click="showContactPicker = !showContactPicker"
              >
                {{ client.primary_contact ? 'Change' : 'Set' }}
              </button>
            </h3>
            <template v-if="client.primary_contact && typeof client.primary_contact !== 'string'">
              <div class="space-y-2 text-sm">
                <p class="font-medium">
                  {{ (client.primary_contact as any).first_name }} {{ (client.primary_contact as any).last_name }}
                </p>
                <p v-if="(client.primary_contact as any).email" class="text-muted-foreground text-xs">
                  {{ (client.primary_contact as any).email }}
                </p>
                <p v-if="(client.primary_contact as any).phone" class="text-muted-foreground text-xs">
                  {{ (client.primary_contact as any).phone }}
                </p>
              </div>
            </template>
            <p v-else class="text-sm text-muted-foreground">No primary contact set.</p>

            <!-- Contact Picker Dropdown -->
            <div v-if="showContactPicker" class="mt-3 border border-border rounded-lg overflow-hidden">
              <div v-if="relatedContacts.length" class="max-h-[200px] overflow-y-auto">
                <button
                  v-if="client.primary_contact"
                  class="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-muted/50 transition-colors text-muted-foreground"
                  @click="setPrimaryContact(null)"
                >
                  <Icon name="lucide:x" class="w-3.5 h-3.5" />
                  Remove primary contact
                </button>
                <button
                  v-for="contact in relatedContacts"
                  :key="contact.id"
                  class="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-muted/50 transition-colors"
                  :class="{ 'text-primary font-medium': (client.primary_contact as any)?.id === contact.id }"
                  @click="setPrimaryContact(contact.id)"
                >
                  <div class="w-5 h-5 rounded-full bg-muted/60 flex items-center justify-center text-[9px] font-medium shrink-0">
                    {{ (contact.first_name || '?').charAt(0) }}{{ (contact.last_name || '').charAt(0) }}
                  </div>
                  {{ contact.first_name }} {{ contact.last_name }}
                </button>
              </div>
              <p v-else class="px-3 py-2 text-xs text-muted-foreground">No contacts to choose from. Add contacts first.</p>
            </div>
          </div>

          <!-- User Access Overrides -->
          <div class="ios-card p-5">
            <ClientsUserAssignment :clientId="clientId" :canManage="isOrgAdminOrAbove" />
          </div>
        </div>
      </div>
    </template>

    <!-- Edit Modal -->
    <ClientsFormModal
      v-if="client"
      v-model="showEditModal"
      :client="client"
      @updated="onClientUpdated"
      @deleted="onClientDeleted"
    />

    <!-- Add Existing Contact Modal -->
    <ClientsAddExistingContactModal
      v-if="client"
      v-model="showAddExistingModal"
      :client-id="clientId"
      @attached="onContactAttached"
    />

    <!-- Contextual AI Sidebar -->
    <ClientOnly>
      <AIContextualSidebar
        v-if="sidebarOpen"
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
</template>
