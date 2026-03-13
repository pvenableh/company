<script setup lang="ts">
import type { Client } from '~/types/directus';
import { Button } from '~/components/ui/button';
import { useDebounceFn } from '@vueuse/core';

definePageMeta({ middleware: ['auth'] });

const router = useRouter();
const config = useRuntimeConfig();
const { getClients, deleteClient: doDelete } = useClients();

const clients = ref<Client[]>([]);
const total = ref(0);
const loading = ref(true);
const search = ref('');
const filterStatus = ref('');
const page = ref(1);
const limit = 50;
const hasMore = computed(() => page.value * limit < total.value);
const showCreateModal = ref(false);
const creating = ref(false);

const statuses = [
  { label: 'Active', value: 'active' },
  { label: 'Prospect', value: 'prospect' },
  { label: 'Inactive', value: 'inactive' },
  { label: 'Churned', value: 'churned' },
];

const statusColors: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-400',
  prospect: 'bg-blue-500/15 text-blue-400',
  inactive: 'bg-neutral-500/15 text-neutral-400',
  churned: 'bg-red-500/15 text-red-400',
};

const fetchData = async () => {
  loading.value = true;
  try {
    const result = await getClients({
      search: search.value || undefined,
      status: filterStatus.value || undefined,
      limit,
      page: page.value,
    });
    clients.value = result.data;
    total.value = result.total;
  } finally {
    loading.value = false;
  }
};

const debouncedFetch = useDebounceFn(fetchData, 300);

function viewClient(client: Client) {
  router.push(`/clients/${client.id}`);
}

async function handleDelete(client: Client) {
  if (!confirm(`Delete ${client.name}?`)) return;
  await doDelete(client.id);
  await fetchData();
}

const { createClient } = useClients();

async function handleCreate(data: any) {
  creating.value = true;
  try {
    await createClient(data);
    showCreateModal.value = false;
    await fetchData();
  } finally {
    creating.value = false;
  }
}

function getLogoUrl(client: Client): string | null {
  if (!client.logo) return null;
  const fileId = typeof client.logo === 'string' ? client.logo : client.logo?.id;
  if (!fileId) return null;
  return `${config.public.directusUrl}/assets/${fileId}?key=small`;
}

function getInitial(name: string): string {
  return name?.charAt(0)?.toUpperCase() || '?';
}

function getPrimaryContactName(client: Client): string | null {
  if (!client.primary_contact || typeof client.primary_contact === 'string') return null;
  const c = client.primary_contact as any;
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || null;
}

onMounted(fetchData);
</script>

<template>
  <div class="p-6 max-w-7xl mx-auto">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-xl font-semibold">Clients</h1>
        <p class="text-sm text-muted-foreground">{{ total.toLocaleString() }} clients</p>
      </div>
      <Button size="sm" @click="showCreateModal = true">
        <Icon name="lucide:plus" class="w-4 h-4 mr-1" />
        Add Client
      </Button>
    </div>

    <!-- Filters -->
    <div class="flex gap-3 mb-6 flex-wrap">
      <input
        v-model="search"
        type="search"
        placeholder="Search clients..."
        class="flex-1 min-w-48 rounded-md border bg-background px-3 py-2 text-sm"
        @input="debouncedFetch"
      />
      <select
        v-model="filterStatus"
        @change="page = 1; fetchData()"
        class="rounded-md border bg-background px-3 py-2 text-sm w-40"
      >
        <option value="">All Statuses</option>
        <option v-for="s in statuses" :key="s.value" :value="s.value">{{ s.label }}</option>
      </select>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="flex flex-col items-center justify-center py-24 gap-3">
      <Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
      <p class="text-sm text-muted-foreground">Loading clients...</p>
    </div>

    <!-- Empty State -->
    <div v-else-if="!clients.length" class="flex flex-col items-center justify-center py-24 gap-4">
      <Icon name="lucide:building-2" class="w-12 h-12 text-muted-foreground/40" />
      <div class="text-center">
        <p class="text-sm font-medium text-muted-foreground">No clients found</p>
        <p class="text-xs text-muted-foreground/70 mt-1">
          {{ search || filterStatus ? 'Try adjusting your filters.' : 'Add your first client to get started.' }}
        </p>
      </div>
      <Button v-if="!search && !filterStatus" size="sm" @click="showCreateModal = true">
        <Icon name="lucide:plus" class="w-4 h-4 mr-1" />
        Add Client
      </Button>
    </div>

    <!-- Client Grid -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="client in clients"
        :key="client.id"
        class="ios-card p-5 cursor-pointer hover:ring-1 hover:ring-white/10 transition-all"
        @click="viewClient(client)"
      >
        <div class="flex items-start gap-3 mb-3">
          <!-- Logo / Initial -->
          <div class="shrink-0">
            <img
              v-if="getLogoUrl(client)"
              :src="getLogoUrl(client)!"
              :alt="client.name"
              class="w-10 h-10 rounded-lg object-cover"
            />
            <div
              v-else
              class="w-10 h-10 rounded-lg bg-muted/60 flex items-center justify-center text-sm font-semibold text-muted-foreground"
            >
              {{ getInitial(client.name) }}
            </div>
          </div>
          <div class="min-w-0 flex-1">
            <h3 class="text-sm font-medium truncate">{{ client.name }}</h3>
            <p v-if="client.industry" class="text-xs text-muted-foreground truncate">{{ client.industry }}</p>
          </div>
          <span
            v-if="client.status"
            class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium shrink-0"
            :class="statusColors[client.status] || 'bg-muted text-muted-foreground'"
          >
            {{ client.status }}
          </span>
        </div>

        <!-- Details -->
        <div class="space-y-1.5 text-xs text-muted-foreground">
          <div v-if="getPrimaryContactName(client)" class="flex items-center gap-1.5">
            <Icon name="lucide:user" class="w-3.5 h-3.5 shrink-0" />
            <span class="truncate">{{ getPrimaryContactName(client) }}</span>
          </div>
          <div v-if="client.website" class="flex items-center gap-1.5">
            <Icon name="lucide:globe" class="w-3.5 h-3.5 shrink-0" />
            <a
              :href="client.website"
              target="_blank"
              class="truncate hover:text-foreground transition-colors"
              @click.stop
            >
              {{ client.website.replace(/^https?:\/\//, '') }}
            </a>
          </div>
        </div>

        <!-- Tags -->
        <div v-if="client.tags?.length" class="flex flex-wrap gap-1 mt-3">
          <span
            v-for="tag in client.tags.slice(0, 3)"
            :key="tag"
            class="inline-flex items-center rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground"
          >
            {{ tag }}
          </span>
          <span v-if="client.tags.length > 3" class="text-[10px] text-muted-foreground/60 self-center">
            +{{ client.tags.length - 3 }}
          </span>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="clients.length" class="flex justify-between items-center mt-6">
      <p class="text-sm text-muted-foreground">
        Showing {{ clients.length }} of {{ total }}
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
          <h2 class="font-semibold mb-4">New Client</h2>
          <ClientsClientForm :saving="creating" @save="handleCreate" @cancel="showCreateModal = false" />
        </div>
      </div>
    </Teleport>
  </div>
</template>
