<script setup lang="ts">
import type { MailingList } from '~~/types/email/contacts';
import { Button } from '~/components/ui/button';

definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Lists | Earnest' });

const router = useRouter();
const { getLists, createList } = useMailingLists();

const lists = ref<MailingList[]>([]);
const loading = ref(true);
const showCreateModal = ref(false);
const creating = ref(false);
const newList = reactive({ name: '', slug: '', description: '', is_default: false, double_opt_in: false });

async function loadData() {
  loading.value = true;
  lists.value = await getLists();
  loading.value = false;
}

function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function handleCreate() {
  if (!newList.name) return;
  creating.value = true;
  try {
    newList.slug = generateSlug(newList.name);
    await createList(newList);
    showCreateModal.value = false;
    Object.assign(newList, { name: '', slug: '', description: '', is_default: false, double_opt_in: false });
    await loadData();
  } finally {
    creating.value = false;
  }
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
    <div v-if="showCreateModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="showCreateModal = false">
      <div class="bg-background rounded-lg shadow-lg w-full max-w-md mx-4 p-6">
        <h2 class="font-semibold mb-4">New Mailing List</h2>
        <form @submit.prevent="handleCreate" class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-1">Name *</label>
            <input v-model="newList.name" required class="w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="e.g. Monthly Newsletter" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Description</label>
            <input v-model="newList.description" class="w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Optional description" />
          </div>
          <div class="flex items-center gap-4">
            <label class="flex items-center gap-2 text-sm">
              <input v-model="newList.is_default" type="checkbox" class="accent-primary" />
              Default list
            </label>
            <label class="flex items-center gap-2 text-sm">
              <input v-model="newList.double_opt_in" type="checkbox" class="accent-primary" />
              Double opt-in
            </label>
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" @click="showCreateModal = false">Cancel</Button>
            <Button type="submit" :disabled="creating || !newList.name">
              {{ creating ? 'Creating...' : 'Create' }}
            </Button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
