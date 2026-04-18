<script setup lang="ts">
import type { MailingList } from '~~/shared/email/contacts';
import { Button } from '~/components/ui/button';

definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Lists | Earnest' });

const router = useRouter();
const { getLists } = useMailingLists();

const lists = ref<MailingList[]>([]);
const loading = ref(true);
const showCreateModal = ref(false);

async function loadData() {
  loading.value = true;
  lists.value = await getLists();
  loading.value = false;
}

async function onListCreated() {
  await loadData();
}

onMounted(loadData);
</script>

<template>
  <div class="p-6 max-w-4xl mx-auto">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-xl font-semibold">Mailing Lists</h1>
        <p class="text-sm text-muted-foreground">Audience segments for email campaigns</p>
      </div>
      <Button size="sm" @click="showCreateModal = true">
        <Icon name="lucide:plus" class="w-4 h-4 mr-1" />
        New List
      </Button>
    </div>

    <div v-if="loading" class="space-y-3">
      <div v-for="i in 3" :key="i" class="h-24 bg-muted rounded-lg animate-pulse" />
    </div>

    <div v-else-if="lists.length" class="grid grid-cols-2 gap-4">
      <ListCard
        v-for="list in lists"
        :key="list.id"
        :list="list"
        @click="router.push(`/lists/${list.id}`)"
      />
    </div>

    <div v-else class="text-center py-16 text-muted-foreground">
      <Icon name="lucide:users" class="w-12 h-12 mx-auto mb-3 opacity-40" />
      <p class="text-lg mb-2">No mailing lists yet</p>
      <p class="text-sm mb-4">Create your first list to start organizing contacts</p>
      <Button @click="showCreateModal = true">Create List</Button>
    </div>

    <!-- Create Modal -->
    <ListsFormModal v-model="showCreateModal" @created="onListCreated" />
  </div>
</template>
