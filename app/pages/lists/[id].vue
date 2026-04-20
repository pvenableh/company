<script setup lang="ts">
import type { Contact, MailingList } from '~~/shared/email/contacts';
import { Button } from '~/components/ui/button';

definePageMeta({ middleware: ['auth'] });
useHead({ title: 'List Details | Earnest' });

const route = useRoute();
const listId = Number(route.params.id);

const { getList, getListContacts, updateSubscriberCount } = useMailingLists();
const { removeFromList } = useContacts();
const { setEntity, clearEntity, sidebarOpen, closeSidebar } = useEntityPageContext();

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

watch(list, (l) => {
  if (l) setEntity('list', String(l.id), l.name || 'Mailing List');
}, { immediate: true });
onUnmounted(() => clearEntity());
</script>

<template>
  <div class="p-6 max-w-5xl mx-auto">
    <div class="flex items-start justify-between gap-3 mb-6" v-if="list">
      <div class="flex items-center gap-3">
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
      <button
        class="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-border text-xs font-medium text-primary hover:bg-primary/10 hover:border-primary/30 transition-colors"
        @click="sidebarOpen = true"
      >
        <UIcon name="lucide:sparkles" class="w-3.5 h-3.5" />
        <span class="hidden sm:inline">Ask Earnest</span>
      </button>
    </div>

    <div v-if="loading">
      <div v-for="i in 5" :key="i" class="h-12 bg-muted rounded animate-pulse mb-2" />
    </div>

    <ListMemberTable v-else :contacts="contacts" @remove="handleRemove" />

    <!-- Contextual AI Sidebar -->
    <ClientOnly>
      <AIContextualSidebar
        v-if="sidebarOpen && list"
        entity-type="list"
        :entity-id="String(list.id)"
        :entity-label="list.name || 'Mailing List'"
        @close="closeSidebar"
      />
      <Transition name="overlay">
        <div v-if="sidebarOpen" class="fixed inset-0 bg-black/20 z-40" @click="closeSidebar" />
      </Transition>
    </ClientOnly>
  </div>
</template>
