<script setup lang="ts">
import type { Contact } from '~~/shared/email/contacts';
import { Button } from '~/components/ui/button';
import { useDebounceFn } from '@vueuse/core';

definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Contacts | Earnest' });

const router = useRouter();
const { getContacts, deleteContact: doDelete, unsubscribeContact: doUnsubscribe } = useContacts();
const { getLists } = useMailingLists();

const contacts = ref<Contact[]>([]);
const total = ref(0);
const loading = ref(true);
const search = ref('');
const filterIndustry = ref('');
const filterStatus = ref('');
const page = ref(1);
const limit = 50;
const hasMore = computed(() => page.value * limit < total.value);
const lists = ref<any[]>([]);
const showCreateModal = ref(false);
const creating = ref(false);

const industries = [
  'Technology', 'Healthcare', 'Finance', 'Education',
  'Real Estate', 'Retail', 'Hospitality', 'Legal', 'Non-Profit', 'Government', 'Other',
];

const fetchData = async () => {
  loading.value = true;
  const result = await getContacts({
    search: search.value || undefined,
    industry: filterIndustry.value || undefined,
    status: filterStatus.value || undefined,
    limit,
    page: page.value,
  });
  contacts.value = result.data;
  total.value = result.total;
  loading.value = false;
};

const debouncedFetch = useDebounceFn(fetchData, 300);

function editContact(contact: Contact) {
  router.push(`/contacts/${contact.id}`);
}

async function handleUnsubscribe(contact: Contact) {
  if (!confirm(`Unsubscribe ${contact.email}?`)) return;
  await doUnsubscribe(contact.id);
  await fetchData();
}

async function handleDelete(contact: Contact) {
  if (!confirm(`Delete ${contact.first_name} ${contact.last_name}?`)) return;
  await doDelete(contact.id);
  await fetchData();
}

const { createContact } = useContacts();

async function handleCreate(data: any) {
  creating.value = true;
  try {
    await createContact(data);
    showCreateModal.value = false;
    await fetchData();
  } finally {
    creating.value = false;
  }
}

onMounted(async () => {
  lists.value = await getLists();
  await fetchData();
});
</script>

<template>
  <div class="p-6 max-w-7xl mx-auto">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-xl font-semibold">Contacts</h1>
        <p class="text-sm text-muted-foreground">{{ total.toLocaleString() }} contacts</p>
      </div>
      <div class="flex gap-2">
        <NuxtLink to="/contacts/import">
          <Button variant="outline" size="sm">
            <Icon name="lucide:upload" class="w-4 h-4 mr-1" />
            Import CSV
          </Button>
        </NuxtLink>
        <Button size="sm" @click="showCreateModal = true">
          <Icon name="lucide:plus" class="w-4 h-4 mr-1" />
          Add Contact
        </Button>
      </div>
    </div>

    <!-- Filters -->
    <div class="flex gap-3 mb-4 flex-wrap">
      <input
        v-model="search"
        type="search"
        placeholder="Search name, email, company..."
        class="flex-1 min-w-48 rounded-md border bg-background px-3 py-2 text-sm"
        @input="debouncedFetch"
      />
      <select
        v-model="filterIndustry"
        @change="page = 1; fetchData()"
        class="rounded-md border bg-background px-3 py-2 text-sm w-40"
      >
        <option value="">All Industries</option>
        <option v-for="ind in industries" :key="ind" :value="ind">{{ ind }}</option>
      </select>
      <select
        v-model="filterStatus"
        @change="page = 1; fetchData()"
        class="rounded-md border bg-background px-3 py-2 text-sm w-36"
      >
        <option value="">All Statuses</option>
        <option value="active">Active</option>
        <option value="unsubscribed">Unsubscribed</option>
        <option value="bounced">Bounced</option>
      </select>
    </div>

    <ContactsContactTable
      :contacts="contacts"
      :loading="loading"
      @edit="editContact"
      @unsubscribe="handleUnsubscribe"
      @delete="handleDelete"
    />

    <!-- Pagination -->
    <div class="flex justify-between items-center mt-4">
      <p class="text-sm text-muted-foreground">
        Showing {{ contacts.length }} of {{ total }}
      </p>
      <div class="flex gap-2">
        <Button variant="outline" size="sm" :disabled="page === 1" @click="page--; fetchData()">
          <Icon name="lucide:chevron-left" class="w-4 h-4" />
        </Button>
        <span class="text-sm px-3 py-1">{{ page }}</span>
        <Button variant="outline" size="sm" :disabled="!hasMore" @click="page++; fetchData()">
          <Icon name="lucide:chevron-right" class="w-4 h-4" />
        </Button>
      </div>
    </div>

    <!-- Create Modal -->
    <Teleport to="body">
      <div v-if="showCreateModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" @click.self="showCreateModal = false">
        <div class="ios-card shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto p-6">
          <h2 class="font-semibold mb-4">New Contact</h2>
          <ContactsContactForm :saving="creating" @submit="handleCreate" @cancel="showCreateModal = false" />
        </div>
      </div>
    </Teleport>
  </div>
</template>
