<script setup lang="ts">
import type { Contact } from '~~/shared/email/contacts';
import { Button } from '~/components/ui/button';
import { LEAD_STAGE_LABELS, LEAD_STAGE_COLORS } from '~~/shared/leads';

definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Contact Details | Earnest' });

const route = useRoute();
const router = useRouter();
const contactId = route.params.id as string;

const { getContact, linkToClient } = useContacts();
const { getClients } = useClients();
const { selectedOrg } = useOrganization();
const { setEntity, clearEntity, sidebarOpen, closeSidebar } = useEntityPageContext();

const contact = ref<Contact | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const showEditModal = ref(false);
const showLeadModal = ref(false);

// Client association
const availableClients = ref<any[]>([]);
const showClientPicker = ref(false);
const linkingClient = ref(false);

// Leads back-link — sourced from Contact.leads inverse O2M projection in getContact
const relatedLeads = computed<any[]>(() => {
  const leads = (contact.value as any)?.leads;
  return Array.isArray(leads) ? leads : [];
});
const openLeads = computed(() =>
  relatedLeads.value.filter((l: any) => l.stage !== 'won' && l.stage !== 'lost' && l.status !== 'archived' && !l.is_junk),
);
const closedLeads = computed(() =>
  relatedLeads.value.filter((l: any) => l.stage === 'won' || l.stage === 'lost'),
);

async function loadClients() {
  if (!selectedOrg.value) return;
  try {
    const result = await getClients({ limit: 100 });
    availableClients.value = result.data;
  } catch {
    availableClients.value = [];
  }
}

async function handleLinkClient(clientId: string | null) {
  linkingClient.value = true;
  try {
    await linkToClient(contactId, clientId);
    contact.value = await getContact(contactId);
    showClientPicker.value = false;
  } catch (e: any) {
    error.value = e?.message || 'Failed to update client association';
  } finally {
    linkingClient.value = false;
  }
}

async function loadContact() {
  loading.value = true;
  error.value = null;
  try {
    contact.value = await getContact(contactId);
  } catch (e: any) {
    error.value = e?.message || 'Failed to load contact';
  } finally {
    loading.value = false;
  }
}

function onContactUpdated(updated: Contact) {
  contact.value = updated;
}

function onContactDeleted() {
  router.push('/contacts');
}

function handleLeadCreated() {
  showLeadModal.value = false;
  loadContact();
}

onMounted(() => {
  loadContact();
  loadClients();
});

// AI sidebar lifecycle
watch(contact, (c) => {
  if (!c) return;
  const label = `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email || 'Contact';
  setEntity('contact', String(c.id), label);
}, { immediate: true });
onUnmounted(() => clearEntity());
</script>

<template>
  <div class="p-6 max-w-4xl mx-auto">
    <!-- Loading State -->
    <div v-if="loading" class="flex flex-col items-center justify-center py-24 gap-3">
      <Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
      <p class="text-sm text-muted-foreground">Loading contact...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="error && !contact" class="flex flex-col items-center justify-center py-24 gap-4">
      <Icon name="lucide:alert-circle" class="w-10 h-10 text-destructive" />
      <p class="text-sm text-destructive">{{ error }}</p>
      <div class="flex gap-2">
        <NuxtLink to="/contacts">
          <Button variant="outline" size="sm">
            <Icon name="lucide:arrow-left" class="w-4 h-4 mr-1" />
            Back to Contacts
          </Button>
        </NuxtLink>
        <Button size="sm" @click="loadContact">
          <Icon name="lucide:refresh-cw" class="w-4 h-4 mr-1" />
          Retry
        </Button>
      </div>
    </div>

    <!-- Contact Detail -->
    <template v-else-if="contact">
      <!-- Back link -->
      <NuxtLink
        to="/contacts"
        class="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors mt-4 mb-2"
      >
        <Icon name="lucide:chevron-left" class="w-3 h-3" />
        Contacts
      </NuxtLink>

      <!-- Header -->
      <div class="flex items-center justify-between mb-5">
        <div class="flex items-center gap-3">
          <div>
            <div class="flex items-center gap-2">
              <h1 class="text-base font-semibold">
                {{ contact.prefix ? `${contact.prefix} ` : '' }}{{ contact.first_name }} {{ contact.last_name }}
              </h1>
              <ContactsContactStatusBadge :status="contact.status" />
            </div>
            <p class="text-xs text-muted-foreground">{{ contact.email }}</p>
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
        <AIProactiveNotices v-if="contact?.id" entity-type="contact" :entity-id="String(contact.id)" />
      </ClientOnly>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Main: read-only summary -->
        <div class="lg:col-span-2 space-y-4">
          <div class="ios-card p-6 space-y-4">
            <h2 class="text-[10px] uppercase tracking-wider text-muted-foreground">Contact Details</h2>

            <div class="grid grid-cols-2 gap-4 text-sm">
              <div class="space-y-1">
                <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Email</p>
                <p class="font-medium break-all">{{ contact.email }}</p>
              </div>
              <div v-if="contact.phone" class="space-y-1">
                <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Phone</p>
                <p>{{ contact.phone }}</p>
              </div>
              <div v-if="contact.title" class="space-y-1">
                <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Title</p>
                <p>{{ contact.title }}</p>
              </div>
              <div v-if="contact.company" class="space-y-1">
                <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Company</p>
                <p>{{ contact.company }}</p>
              </div>
              <div v-if="contact.industry" class="space-y-1">
                <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Industry</p>
                <p>{{ contact.industry }}</p>
              </div>
              <div v-if="contact.website" class="space-y-1">
                <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Website</p>
                <a :href="contact.website" target="_blank" class="text-primary hover:underline text-xs break-all">
                  {{ contact.website.replace(/^https?:\/\//, '') }}
                </a>
              </div>
            </div>

            <div v-if="contact.mailing_address" class="pt-3 border-t border-border/30 space-y-1">
              <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Mailing Address</p>
              <p class="text-sm whitespace-pre-wrap">{{ contact.mailing_address }}</p>
            </div>

            <div v-if="Array.isArray(contact.tags) && contact.tags.length" class="pt-3 border-t border-border/30 space-y-1.5">
              <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Tags</p>
              <div class="flex flex-wrap gap-1.5">
                <ContactsContactTagBadge v-for="tag in contact.tags" :key="tag" :tag="tag" />
              </div>
            </div>

            <div v-if="contact.notes" class="pt-3 border-t border-border/30 space-y-1">
              <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Notes</p>
              <p class="text-sm whitespace-pre-wrap text-muted-foreground">{{ contact.notes }}</p>
            </div>
          </div>

          <!-- Custom Fields -->
          <div
            v-if="contact.custom_fields && Object.keys(contact.custom_fields).length"
            class="ios-card p-6"
          >
            <h2 class="text-[10px] uppercase tracking-wider text-muted-foreground mb-4">Custom Fields</h2>
            <div class="grid grid-cols-2 gap-3">
              <div
                v-for="(value, key) in contact.custom_fields"
                :key="key"
                class="p-3 bg-muted/50 rounded-xl"
              >
                <p class="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">{{ key }}</p>
                <p class="text-sm mt-1">{{ value }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Sidebar -->
        <div class="space-y-4">
          <!-- Client Association -->
          <div class="ios-card p-5">
            <h3 class="text-[10px] uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <Icon name="lucide:building-2" class="w-3.5 h-3.5" />
              Client
            </h3>
            <div v-if="(contact as any).client && typeof (contact as any).client === 'object'" class="flex items-center justify-between">
              <NuxtLink
                :to="`/clients/${(contact as any).client.id}`"
                class="text-sm text-primary hover:underline font-medium"
              >
                {{ (contact as any).client.name }}
              </NuxtLink>
              <button
                class="text-xs text-muted-foreground hover:text-destructive"
                @click="handleLinkClient(null)"
                :disabled="linkingClient"
              >
                Remove
              </button>
            </div>
            <div v-else-if="(contact as any).client" class="text-sm text-muted-foreground">
              Linked to a client
            </div>
            <div v-else>
              <div v-if="!showClientPicker">
                <p class="text-sm text-muted-foreground mb-2">Not linked to any client.</p>
                <button
                  v-if="availableClients.length > 0"
                  class="text-xs text-primary hover:underline"
                  @click="showClientPicker = true"
                >
                  Link to client
                </button>
              </div>
              <div v-else class="space-y-2">
                <select
                  class="w-full text-sm rounded-full border border-input bg-background px-3 py-2"
                  @change="handleLinkClient(($event.target as HTMLSelectElement).value)"
                  :disabled="linkingClient"
                >
                  <option value="">Select a client...</option>
                  <option v-for="c in availableClients" :key="c.id" :value="c.id">
                    {{ c.name }}
                  </option>
                </select>
                <button
                  class="text-xs text-muted-foreground hover:text-foreground"
                  @click="showClientPicker = false"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>

          <!-- Leads back-link -->
          <div class="ios-card p-5">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Icon name="lucide:trending-up" class="w-3.5 h-3.5" />
                Leads
                <span v-if="relatedLeads.length" class="text-[10px] text-muted-foreground/60 font-normal normal-case tracking-normal">
                  ({{ openLeads.length }} open)
                </span>
              </h3>
              <button
                class="inline-flex items-center gap-1 h-6 px-2.5 rounded-full border border-border text-[11px] font-medium text-primary hover:bg-primary/10 hover:border-primary/30 transition-colors"
                @click="showLeadModal = true"
              >
                <Icon name="lucide:plus" class="w-3 h-3" />
                Start a deal
              </button>
            </div>
            <div v-if="!relatedLeads.length" class="flex flex-col items-center gap-2 py-3 text-center">
              <p class="text-sm text-muted-foreground">No leads yet.</p>
              <button
                class="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                @click="showLeadModal = true"
              >
                <Icon name="lucide:plus" class="w-3.5 h-3.5" />
                Start a deal
              </button>
            </div>
            <div v-else class="space-y-2">
              <NuxtLink
                v-for="lead in openLeads"
                :key="lead.id"
                :to="`/leads/${lead.id}`"
                class="flex items-center justify-between p-2.5 bg-muted/50 rounded-xl text-sm hover:bg-muted/80 transition-colors"
              >
                <div class="flex items-center gap-2 min-w-0">
                  <span
                    class="w-2 h-2 rounded-full shrink-0"
                    :style="{ backgroundColor: LEAD_STAGE_COLORS[lead.stage as keyof typeof LEAD_STAGE_COLORS] || '#94a3b8' }"
                  ></span>
                  <span class="truncate">
                    {{ lead.project_type || `Lead #${lead.id}` }}
                  </span>
                </div>
                <span class="text-xs text-muted-foreground shrink-0 ml-2">
                  {{ LEAD_STAGE_LABELS[lead.stage as keyof typeof LEAD_STAGE_LABELS] || lead.stage }}
                </span>
              </NuxtLink>
              <details v-if="closedLeads.length" class="text-xs text-muted-foreground">
                <summary class="cursor-pointer hover:text-foreground">
                  {{ closedLeads.length }} closed lead{{ closedLeads.length === 1 ? '' : 's' }}
                </summary>
                <div class="mt-2 space-y-1">
                  <NuxtLink
                    v-for="lead in closedLeads"
                    :key="lead.id"
                    :to="`/leads/${lead.id}`"
                    class="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <span class="truncate">{{ lead.project_type || `Lead #${lead.id}` }}</span>
                    <span class="ml-2 shrink-0">{{ lead.stage }}</span>
                  </NuxtLink>
                </div>
              </details>
            </div>
          </div>

          <!-- Mailing Lists -->
          <div class="ios-card p-5">
            <h3 class="text-[10px] uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <Icon name="lucide:mail" class="w-3.5 h-3.5" />
              Mailing Lists
            </h3>
            <div v-if="contact.lists?.length" class="space-y-2">
              <div
                v-for="membership in contact.lists"
                :key="(membership as any).id"
                class="flex items-center justify-between p-2.5 bg-muted/50 rounded-xl text-sm"
              >
                <span>{{ (membership as any).list_id?.name || 'Unknown' }}</span>
              </div>
            </div>
            <p v-else class="text-sm text-muted-foreground">Not on any lists.</p>
          </div>

          <!-- Engagement Stats -->
          <div class="ios-card p-5">
            <h3 class="text-[10px] uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <Icon name="lucide:bar-chart-3" class="w-3.5 h-3.5" />
              Engagement
            </h3>
            <div class="space-y-2.5 text-sm">
              <div class="flex justify-between">
                <span class="text-muted-foreground">Emails Sent</span>
                <span class="font-medium">{{ contact.total_emails_sent || 0 }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">Opens</span>
                <span class="font-medium">{{ contact.total_opens || 0 }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">Clicks</span>
                <span class="font-medium">{{ contact.total_clicks || 0 }}</span>
              </div>
            </div>
          </div>

          <!-- Meta / Info -->
          <div class="ios-card p-5">
            <h3 class="text-[10px] uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <Icon name="lucide:info" class="w-3.5 h-3.5" />
              Info
            </h3>
            <div class="space-y-2.5 text-sm">
              <div class="flex justify-between">
                <span class="text-muted-foreground">Source</span>
                <span>{{ contact.source || '\u2014' }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">Created</span>
                <span>{{ contact.date_created ? new Date(contact.date_created).toLocaleDateString() : '\u2014' }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">Subscribed</span>
                <span :class="contact.email_subscribed ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'">
                  {{ contact.email_subscribed ? 'Yes' : 'No' }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Edit Modal -->
      <ContactsFormModal
        v-model="showEditModal"
        :contact="contact"
        @updated="onContactUpdated"
        @deleted="onContactDeleted"
      />

      <!-- New-Lead Modal (inline — avoids nav to /leads) -->
      <LeadsFormModal
        v-model="showLeadModal"
        :contact-id="contactId"
        :contact="contact"
        @created="handleLeadCreated"
      />
    </template>

    <!-- Contextual AI Sidebar -->
    <ClientOnly>
      <AIContextualSidebar
        v-if="sidebarOpen && contact?.id"
        entity-type="contact"
        :entity-id="String(contact.id)"
        :entity-label="`${contact.first_name || ''} ${contact.last_name || ''}`.trim() || contact.email || 'Contact'"
        @close="closeSidebar"
      />
      <Transition name="overlay">
        <div v-if="sidebarOpen" class="fixed inset-0 bg-black/20 z-40" @click="closeSidebar" />
      </Transition>
    </ClientOnly>
  </div>
</template>
