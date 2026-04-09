<script setup lang="ts">
import type { Contact, MailingList } from '~~/types/email/contacts';
import { Button } from '~/components/ui/button';

definePageMeta({ middleware: ['auth'] });
useHead({ title: 'List Details | Earnest' });

const route = useRoute();
const listId = Number(route.params.id);

const { getList, getListContacts, updateSubscriberCount } = useMailingLists();
const { removeFromList } = useContacts();

const list = ref<MailingList | null>(null);
const contacts = ref<Contact[]>([]);
const loading = ref(true);

async function loadData() {
  loading.value = true;
  list.value = await getList(listId);
  contacts.value = await getListContacts(listId);
  loading.value = false;
}

async function handleRemove(contact: Contact) {
  if (!confirm(`Remove ${contact.first_name} ${contact.last_name} from this list?`)) return;
  await removeFromList(contact.id, listId);
  await updateSubscriberCount(listId);
  await loadData();
}

onMounted(loadData);
</script>

<template>
  <div class="p-6 max-w-5xl mx-auto">
    <div class="flex items-center gap-3 mb-6" v-if="list">
      <NuxtLink to="/lists" class="text-muted-foreground hover:text-foreground">
        <Icon name="lucide:arrow-left" class="w-5 h-5" />
      </NuxtLink>
      <div>
        <h1 class="text-xl font-semibold">{{ list.name }}</h1>
        <p class="text-sm text-muted-foreground">
          {{ contacts.length }} active subscribers
          <span v-if="list.description" class="ml-2">— {{ list.description }}</span>
        </p>
      </div>
    </div>

    <div v-if="loading">
      <div v-for="i in 5" :key="i" class="h-12 bg-muted rounded animate-pulse mb-2" />
    </div>

    <ListMemberTable v-else :contacts="contacts" @remove="handleRemove" />
  </div>
</template>
