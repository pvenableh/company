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
const filterCategory = ref<Contact['category'] | ''>('');
const page = ref(1);
const limit = 50;
const hasMore = computed(() => page.value * limit < total.value);
const lists = ref<any[]>([]);
const showCreateModal = ref(false);

const industries = [
  'Technology', 'Healthcare', 'Finance', 'Education',
  'Real Estate', 'Retail', 'Hospitality', 'Legal', 'Non-Profit', 'Government', 'Other',
];

const categoryChips: Array<{ value: Contact['category'] | ''; label: string }> = [
  { value: '', label: 'All' },
  { value: 'client', label: 'Clients' },
  { value: 'prospect', label: 'Prospects' },
  { value: 'partner', label: 'Partners' },
  { value: 'architect', label: 'Architects' },
  { value: 'developer', label: 'Developers' },
  { value: 'hospitality', label: 'Hospitality' },
  { value: 'media', label: 'Media' },
];

const categoryItems = computed(() => categoryChips.map((c) => ({
  key: c.value || 'all',
  label: c.label,
})));

const fetchData = async () => {
  loading.value = true;
  const result = await getContacts({
    search: search.value || undefined,
    industry: filterIndustry.value || undefined,
    status: filterStatus.value || undefined,
    category: filterCategory.value || undefined,
    limit,
    page: page.value,
  });
  contacts.value = result.data;
  total.value = result.total;
  loading.value = false;
};

function selectCategory(value: Contact['category'] | '') {
  filterCategory.value = value;
  page.value = 1;
  fetchData();
}

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

async function onContactCreated() {
  await fetchData();
}

onMounted(async () => {
  lists.value = await getLists();
  await fetchData();
});
</script>

<template>
  <LayoutPageContainer>
    <LayoutPageHeader title="Contacts" :subtitle="`${total.toLocaleString()} contacts`">
      <template #actions>
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
      </template>
    </LayoutPageHeader>

    <!-- Category Tabs -->
    <UTabs
      :model-value="filterCategory || 'all'"
      :items="categoryItems"
      class="mb-3 w-fit"
      @update:model-value="(v) => selectCategory(v === 'all' ? '' : (v as Contact['category']))"
    />

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
    <ContactsFormModal v-model="showCreateModal" @created="onContactCreated" />
  </LayoutPageContainer>
</template>
