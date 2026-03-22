<script setup lang="ts">
import type { Contact, CreateContactPayload } from '~/types/email/contacts';
import { Button } from '~/components/ui/button';

definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Contact Details | Earnest' });

const route = useRoute();
const router = useRouter();
const contactId = route.params.id as string;

const { getContact, updateContact, deleteContact, linkToClient } = useContacts();
const { getClients } = useClients();
const { selectedOrg } = useOrganization();

const contact = ref<Contact | null>(null);
const loading = ref(true);
const saving = ref(false);
const deleting = ref(false);
const showDeleteConfirm = ref(false);
const error = ref<string | null>(null);

// Client association
const availableClients = ref<any[]>([]);
const showClientPicker = ref(false);
const linkingClient = ref(false);

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

async function handleUpdate(data: CreateContactPayload) {
  saving.value = true;
  try {
    await updateContact(contactId, data);
    contact.value = await getContact(contactId);
  } catch (e: any) {
    error.value = e?.message || 'Failed to update contact';
  } finally {
    saving.value = false;
  }
}

async function handleDelete() {
  deleting.value = true;
  try {
    await deleteContact(contactId);
    router.push('/contacts');
  } catch (e: any) {
    error.value = e?.message || 'Failed to delete contact';
    deleting.value = false;
    showDeleteConfirm.value = false;
  }
}

onMounted(() => {
  loadContact();
  loadClients();
});
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
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
          <NuxtLink
            to="/contacts"
            class="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            <Icon name="lucide:arrow-left" class="w-5 h-5" />
          </NuxtLink>
          <div>
            <h1 class="text-xl font-semibold">
              {{ contact.prefix ? `${contact.prefix} ` : '' }}{{ contact.first_name }} {{ contact.last_name }}
            </h1>
            <p class="text-sm text-muted-foreground">{{ contact.email }}</p>
          </div>
          <ContactsContactStatusBadge :status="contact.status" />
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
        <div class="lg:col-span-2 space-y-4">
          <div class="ios-card p-6">
            <h2 class="font-medium mb-4">Contact Details</h2>
            <ContactsContactForm
              :contact="contact"
              :saving="saving"
              @submit="handleUpdate"
              @cancel="router.push('/contacts')"
            />
          </div>

          <!-- Custom Fields -->
          <div
            v-if="contact.custom_fields && Object.keys(contact.custom_fields).length"
            class="ios-card p-6"
          >
            <h2 class="font-medium mb-4">Custom Fields</h2>
            <div class="grid grid-cols-2 gap-3">
              <div
                v-for="(value, key) in contact.custom_fields"
                :key="key"
                class="p-3 bg-muted/50 rounded-xl"
              >
                <p class="text-xs text-muted-foreground font-mono">{{ key }}</p>
                <p class="text-sm mt-1">{{ value }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Sidebar -->
        <div class="space-y-4">
          <!-- Client Association -->
          <div class="ios-card p-5">
            <h3 class="font-medium text-sm mb-3 flex items-center gap-2">
              <Icon name="lucide:building-2" class="w-4 h-4 text-muted-foreground" />
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
                  class="w-full text-sm rounded-lg border border-input bg-background px-3 py-2"
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

          <!-- Mailing Lists -->
          <div class="ios-card p-5">
            <h3 class="font-medium text-sm mb-3 flex items-center gap-2">
              <Icon name="lucide:mail" class="w-4 h-4 text-muted-foreground" />
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
            <h3 class="font-medium text-sm mb-3 flex items-center gap-2">
              <Icon name="lucide:bar-chart-3" class="w-4 h-4 text-muted-foreground" />
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
            <h3 class="font-medium text-sm mb-3 flex items-center gap-2">
              <Icon name="lucide:info" class="w-4 h-4 text-muted-foreground" />
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
              <h3 class="font-semibold">Delete Contact</h3>
              <p class="text-sm text-muted-foreground mt-1">
                Are you sure you want to delete
                <strong>{{ contact?.first_name }} {{ contact?.last_name }}</strong>?
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
