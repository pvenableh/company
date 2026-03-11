<script setup lang="ts">
import type { Contact, MailingList } from '~/types/email/contacts';
import { Button } from '~/components/ui/button';

definePageMeta({ middleware: ['auth'] });

const route = useRoute();
const router = useRouter();
const contactId = Number(route.params.id);

const { getContact, updateContact, unsubscribeContact, removeFromList } = useContacts();
const { getLists } = useMailingLists();

const contact = ref<Contact | null>(null);
const lists = ref<MailingList[]>([]);
const saving = ref(false);
const showAddToListModal = ref(false);

async function loadData() {
  contact.value = await getContact(contactId);
  lists.value = await getLists();
}

async function handleSave(data: any) {
  saving.value = true;
  try {
    await updateContact(contactId, data);
    await loadData();
  } finally {
    saving.value = false;
  }
}

async function handleUnsubscribe() {
  if (!confirm('Unsubscribe this contact from all emails?')) return;
  await unsubscribeContact(contactId);
  await loadData();
}

async function handleRemoveFromList(listId: number) {
  await removeFromList(contactId, listId);
  await loadData();
}

onMounted(loadData);
</script>

<template>
  <div class="p-6 max-w-4xl mx-auto" v-if="contact">
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-3">
        <NuxtLink to="/contacts" class="text-muted-foreground hover:text-foreground">
          <Icon name="lucide:arrow-left" class="w-5 h-5" />
        </NuxtLink>
        <div>
          <h1 class="text-xl font-semibold">
            {{ contact.prefix ? `${contact.prefix} ` : '' }}{{ contact.first_name }} {{ contact.last_name }}
          </h1>
          <p class="text-sm text-muted-foreground">{{ contact.email }}</p>
        </div>
        <ContactStatusBadge :status="contact.status" />
      </div>
      <div class="flex gap-2">
        <Button
          v-if="contact.email_subscribed"
          variant="outline"
          size="sm"
          @click="handleUnsubscribe"
        >
          Unsubscribe
        </Button>
        <Button variant="outline" size="sm" @click="showAddToListModal = true">
          <Icon name="lucide:plus" class="w-3.5 h-3.5 mr-1" />
          Add to List
        </Button>
      </div>
    </div>

    <div class="grid grid-cols-3 gap-6">
      <!-- Main form -->
      <div class="col-span-2">
        <div class="border rounded-lg p-6">
          <h2 class="font-medium mb-4">Contact Details</h2>
          <ContactForm
            :contact="contact"
            :saving="saving"
            @submit="handleSave"
            @cancel="router.push('/contacts')"
          />
        </div>

        <!-- Custom Fields -->
        <div class="border rounded-lg p-6 mt-4" v-if="contact.custom_fields && Object.keys(contact.custom_fields).length">
          <h2 class="font-medium mb-4">Custom Fields</h2>
          <div class="grid grid-cols-2 gap-3">
            <div v-for="(value, key) in contact.custom_fields" :key="key" class="p-3 bg-muted/50 rounded">
              <p class="text-xs text-muted-foreground font-mono">{{ key }}</p>
              <p class="text-sm mt-1">{{ value }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Sidebar -->
      <div class="space-y-4">
        <!-- Mailing Lists -->
        <div class="border rounded-lg p-4">
          <h3 class="font-medium text-sm mb-3">Mailing Lists</h3>
          <div v-if="contact.lists?.length" class="space-y-2">
            <div
              v-for="membership in contact.lists"
              :key="(membership as any).id"
              class="flex items-center justify-between p-2 bg-muted/50 rounded"
            >
              <span class="text-sm">{{ (membership as any).list_id?.name || 'Unknown' }}</span>
              <button
                class="text-xs text-destructive hover:underline"
                @click="handleRemoveFromList((membership as any).list_id?.id)"
              >
                Remove
              </button>
            </div>
          </div>
          <p v-else class="text-sm text-muted-foreground">Not on any lists.</p>
        </div>

        <!-- Engagement Stats -->
        <div class="border rounded-lg p-4">
          <h3 class="font-medium text-sm mb-3">Engagement</h3>
          <div class="space-y-2 text-sm">
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

        <!-- Meta -->
        <div class="border rounded-lg p-4">
          <h3 class="font-medium text-sm mb-3">Info</h3>
          <div class="space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-muted-foreground">Source</span>
              <span>{{ contact.source || '—' }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">Created</span>
              <span>{{ contact.date_created ? new Date(contact.date_created).toLocaleDateString() : '—' }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">Subscribed</span>
              <span>{{ contact.email_subscribed ? 'Yes' : 'No' }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <AddToListModal
      v-if="showAddToListModal"
      :contact-id="contact.id"
      :contact-name="`${contact.first_name} ${contact.last_name}`"
      :lists="lists"
      @close="showAddToListModal = false"
      @added="showAddToListModal = false; loadData()"
    />
  </div>
</template>
