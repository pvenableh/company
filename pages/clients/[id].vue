<script setup lang="ts">
import type { Client } from '~/types/directus';
import { Button } from '~/components/ui/button';

definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Client Details | Earnest' });

const route = useRoute();
const router = useRouter();
const config = useRuntimeConfig();
const clientId = route.params.id as string;

const { getClient, updateClient, deleteClient } = useClients();

const client = ref<Client | null>(null);
const loading = ref(true);
const saving = ref(false);
const deleting = ref(false);
const showDeleteConfirm = ref(false);
const error = ref<string | null>(null);
const activeTab = ref<'contacts' | 'projects' | 'tickets'>('contacts');

async function loadClient() {
  loading.value = true;
  error.value = null;
  try {
    client.value = await getClient(clientId);
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
    await resolveIndustryName();
  } catch (e: any) {
    error.value = e?.message || 'Failed to update client';
  } finally {
    saving.value = false;
  }
}

async function handleDelete() {
  deleting.value = true;
  try {
    await deleteClient(clientId);
    router.push('/clients');
  } catch (e: any) {
    error.value = e?.message || 'Failed to delete client';
    deleting.value = false;
    showDeleteConfirm.value = false;
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

const tabs = [
  { key: 'contacts', label: 'Contacts', icon: 'lucide:users' },
  { key: 'projects', label: 'Projects', icon: 'lucide:folder-kanban' },
  { key: 'tickets', label: 'Tickets', icon: 'lucide:ticket' },
] as const;

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
const contactItems = useDirectusItems('clients');

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

const statusColors: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-400',
  prospect: 'bg-blue-500/15 text-blue-400',
  inactive: 'bg-neutral-500/15 text-neutral-400',
  churned: 'bg-red-500/15 text-red-400',
  Pending: 'bg-yellow-500/15 text-yellow-400',
  Scheduled: 'bg-blue-500/15 text-blue-400',
  'In Progress': 'bg-indigo-500/15 text-indigo-400',
  Completed: 'bg-emerald-500/15 text-emerald-400',
  pending: 'bg-yellow-500/15 text-yellow-400',
  processing: 'bg-blue-500/15 text-blue-400',
  paid: 'bg-emerald-500/15 text-emerald-400',
  archived: 'bg-neutral-500/15 text-neutral-400',
};

onMounted(async () => {
  await loadClient();
  await resolveIndustryName();
});
</script>

<template>
  <div class="p-6 max-w-5xl mx-auto">
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
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
          <NuxtLink
            to="/clients"
            class="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            <Icon name="lucide:arrow-left" class="w-5 h-5" />
          </NuxtLink>
          <div class="shrink-0">
            <img
              v-if="getLogoUrl(client)"
              :src="getLogoUrl(client)!"
              :alt="client.name"
              class="w-10 h-10 rounded-lg object-contain"
            />
            <div
              v-else
              class="w-10 h-10 rounded-lg bg-muted/60 flex items-center justify-center text-sm font-semibold text-muted-foreground"
            >
              {{ getInitial(client.name) }}
            </div>
          </div>
          <div>
            <h1 class="text-xl font-semibold">{{ client.name }}</h1>
            <p v-if="client.industry" class="text-sm text-muted-foreground">{{ industryName || 'Loading...' }}</p>
          </div>
          <span
            v-if="client.status"
            class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
            :class="statusColors[client.status] || 'bg-muted text-muted-foreground'"
          >
            {{ client.status }}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          class="text-destructive hover:text-destructive hover:bg-destructive/10"
          @click="showDeleteConfirm = true"
        >
          <Icon name="lucide:trash-2" class="w-4 h-4 mr-1" />
          Delete
        </Button>
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

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Main form -->
        <div class="lg:col-span-2 space-y-6">
          <div class="ios-card p-6">
            <h2 class="font-medium mb-4">Client Details</h2>
            <ClientsClientForm
              :client="client"
              :saving="saving"
              @save="handleUpdate"
              @cancel="router.push('/clients')"
            />
          </div>

          <!-- Related Items Tabs -->
          <div class="ios-card p-6">
            <div class="inline-flex items-center gap-1 rounded-xl bg-muted/50 p-1 border border-border mb-4">
              <button
                v-for="tab in tabs"
                :key="tab.key"
                class="flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] uppercase tracking-wider font-semibold transition-all duration-200"
                :class="activeTab === tab.key
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'"
                @click="activeTab = tab.key"
              >
                <Icon :name="tab.icon" class="w-4 h-4" />
                {{ tab.label }}
                <span class="text-[9px] text-muted-foreground/60 ml-0.5">
                  ({{ (client as any)[tab.key]?.length || 0 }})
                </span>
              </button>
            </div>

            <!-- Contacts Tab -->
            <div v-if="activeTab === 'contacts'">
              <div v-if="client.contacts?.length" class="space-y-2">
                <div
                  v-for="contact in client.contacts"
                  :key="(contact as any).id"
                  class="flex items-center justify-between p-3 bg-muted/30 rounded-xl"
                >
                  <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-muted/60 flex items-center justify-center text-xs font-medium text-muted-foreground">
                      {{ ((contact as any).first_name || '?').charAt(0) }}{{ ((contact as any).last_name || '').charAt(0) }}
                    </div>
                    <div>
                      <p class="text-sm font-medium">{{ (contact as any).first_name }} {{ (contact as any).last_name }}</p>
                      <p v-if="(contact as any).email" class="text-xs text-muted-foreground">{{ (contact as any).email }}</p>
                    </div>
                  </div>
                  <NuxtLink :to="`/contacts/${(contact as any).id}`">
                    <Button variant="ghost" size="sm">
                      <Icon name="lucide:arrow-right" class="w-4 h-4" />
                    </Button>
                  </NuxtLink>
                </div>
              </div>
              <p v-else class="text-sm text-muted-foreground text-center py-6">No contacts linked to this client.</p>
            </div>

            <!-- Projects Tab -->
            <div v-if="activeTab === 'projects'">
              <div v-if="client.projects?.length" class="space-y-2">
                <div
                  v-for="project in client.projects"
                  :key="(project as any).id"
                  class="flex items-center justify-between p-3 bg-muted/30 rounded-xl"
                >
                  <div>
                    <p class="text-sm font-medium">{{ (project as any).title }}</p>
                  </div>
                  <div class="flex items-center gap-2">
                    <span
                      v-if="(project as any).status"
                      class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                      :class="statusColors[(project as any).status] || 'bg-muted text-muted-foreground'"
                    >
                      {{ (project as any).status }}
                    </span>
                    <NuxtLink :to="`/projects/${(project as any).id}`">
                      <Button variant="ghost" size="sm">
                        <Icon name="lucide:arrow-right" class="w-4 h-4" />
                      </Button>
                    </NuxtLink>
                  </div>
                </div>
              </div>
              <p v-else class="text-sm text-muted-foreground text-center py-6">No projects linked to this client.</p>
            </div>

            <!-- Tickets Tab -->
            <div v-if="activeTab === 'tickets'">
              <div v-if="client.tickets?.length" class="space-y-2">
                <div
                  v-for="ticket in client.tickets"
                  :key="(ticket as any).id"
                  class="flex items-center justify-between p-3 bg-muted/30 rounded-xl"
                >
                  <div>
                    <p class="text-sm font-medium">{{ (ticket as any).title }}</p>
                  </div>
                  <div class="flex items-center gap-2">
                    <span
                      v-if="(ticket as any).status"
                      class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                      :class="statusColors[(ticket as any).status] || 'bg-muted text-muted-foreground'"
                    >
                      {{ (ticket as any).status }}
                    </span>
                    <NuxtLink :to="`/tickets/${(ticket as any).id}`">
                      <Button variant="ghost" size="sm">
                        <Icon name="lucide:arrow-right" class="w-4 h-4" />
                      </Button>
                    </NuxtLink>
                  </div>
                </div>
              </div>
              <p v-else class="text-sm text-muted-foreground text-center py-6">No tickets linked to this client.</p>
            </div>
          </div>
        </div>

        <!-- Sidebar -->
        <div class="space-y-4">
          <!-- Quick Info -->
          <div class="ios-card p-5">
            <h3 class="font-medium text-sm mb-3 flex items-center gap-2">
              <Icon name="lucide:info" class="w-4 h-4 text-muted-foreground" />
              Info
            </h3>
            <div class="space-y-2.5 text-sm">
              <div class="flex justify-between">
                <span class="text-muted-foreground">Organization</span>
                <span>{{ (client.organization as any)?.name || '\u2014' }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">Website</span>
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
              <div class="flex justify-between">
                <span class="text-muted-foreground">Industry</span>
                <span>{{ industryName || '\u2014' }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">Created</span>
                <span>{{ client.date_created ? new Date(client.date_created).toLocaleDateString() : '\u2014' }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">Updated</span>
                <span>{{ client.date_updated ? new Date(client.date_updated).toLocaleDateString() : '\u2014' }}</span>
              </div>
            </div>
          </div>

          <!-- Tags -->
          <div class="ios-card p-5">
            <h3 class="font-medium text-sm mb-3 flex items-center gap-2">
              <Icon name="lucide:tags" class="w-4 h-4 text-muted-foreground" />
              Tags
            </h3>
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
            <h3 class="font-medium text-sm mb-3 flex items-center justify-between">
              <span class="flex items-center gap-2">
                <Icon name="lucide:user" class="w-4 h-4 text-muted-foreground" />
                Primary Contact
              </span>
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
              <div v-if="client.contacts?.length" class="max-h-[200px] overflow-y-auto">
                <button
                  v-if="client.primary_contact"
                  class="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-muted/50 transition-colors text-muted-foreground"
                  @click="setPrimaryContact(null)"
                >
                  <Icon name="lucide:x" class="w-3.5 h-3.5" />
                  Remove primary contact
                </button>
                <button
                  v-for="contact in client.contacts"
                  :key="(contact as any).id"
                  class="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-muted/50 transition-colors"
                  :class="{ 'text-primary font-medium': (client.primary_contact as any)?.id === (contact as any).id }"
                  @click="setPrimaryContact((contact as any).id)"
                >
                  <div class="w-5 h-5 rounded-full bg-muted/60 flex items-center justify-center text-[9px] font-medium shrink-0">
                    {{ ((contact as any).first_name || '?').charAt(0) }}{{ ((contact as any).last_name || '').charAt(0) }}
                  </div>
                  {{ (contact as any).first_name }} {{ (contact as any).last_name }}
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

    <!-- Delete Confirmation Modal -->
    <Teleport to="body">
      <div
        v-if="showDeleteConfirm"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        @click.self="showDeleteConfirm = false"
      >
        <div class="ios-card w-full max-w-md mx-4 p-6 shadow-xl">
          <div class="flex items-start gap-3 mb-4">
            <div class="flex items-center justify-center w-10 h-10 rounded-full bg-destructive/10 shrink-0">
              <Icon name="lucide:alert-triangle" class="w-5 h-5 text-destructive" />
            </div>
            <div>
              <h3 class="font-semibold">Delete Client</h3>
              <p class="text-sm text-muted-foreground mt-1">
                Are you sure you want to delete
                <strong>{{ client?.name }}</strong>?
                This action cannot be undone.
              </p>
            </div>
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              :disabled="deleting"
              @click="showDeleteConfirm = false"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              :disabled="deleting"
              @click="handleDelete"
            >
              <Icon v-if="deleting" name="lucide:loader-2" class="w-4 h-4 mr-1 animate-spin" />
              {{ deleting ? 'Deleting...' : 'Delete' }}
            </Button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
