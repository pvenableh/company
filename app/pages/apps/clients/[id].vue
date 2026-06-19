<script setup lang="ts">
import type { Client } from '~~/shared/directus';

definePageMeta({
  layout: 'apps',
  middleware: ['auth'],
  pageTransition: { name: 'apps-push', mode: 'out-in' },
});
useHead({ title: 'Client Details | Earnest' });

const route = useRoute();
const router = useRouter();
const clientId = route.params.id as string;

const { setEntity, clearEntity, sidebarOpen, closeSidebar } = useEntityPageContext();

type TabKey = 'activity' | 'contacts' | 'projects' | 'documents' | 'tickets' | 'tasks' | 'meetings' | 'invoices' | 'partners' | 'messages';
const VALID_TABS: TabKey[] = ['activity', 'contacts', 'projects', 'documents', 'tickets', 'tasks', 'meetings', 'invoices', 'partners', 'messages'];

const initialTab: TabKey = (() => {
  const v = route.query.tab;
  return typeof v === 'string' && VALID_TABS.includes(v as TabKey) ? (v as TabKey) : 'activity';
})();

const client = ref<Client | null>(null);
const showEditModal = ref(false);
const workspaceRef = ref<any>(null);

function onWorkspaceLoaded(c: Client) {
  client.value = c;
  setEntity('client', c.id as string, c.name || 'Client');
}

function onTabChange(next: TabKey) {
  router.replace({ query: { ...route.query, tab: next === 'activity' ? undefined : next } });
}

function onClientUpdated(updated: Client) {
  client.value = updated;
  // Pull the freshest sibling collections after an edit (the edit modal
  // may have touched contacts, status, etc.).
  workspaceRef.value?.reload?.();
}

function onClientDeleted() {
  router.push('/apps/clients');
}

onUnmounted(() => clearEntity());
</script>

<template>
  <div class="apps-page">
    <AppHeader :title="client?.name || 'Client'" back-label="Clients" back-to="/apps/clients" :show-back="true">
      <template #actions>
        <button
          v-if="client"
          class="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-border text-xs font-medium text-primary hover:bg-primary/10 hover:border-primary/30 transition-colors"
          @click="sidebarOpen = true"
        >
          <EarnestIcon class="w-3.5 h-3.5" />
          <span class="hidden sm:inline">Ask Earnest</span>
        </button>
        <button
          v-if="client"
          class="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors"
          @click="showEditModal = true"
        >
          <Icon name="lucide:pencil" class="w-3.5 h-3.5" />
          <span class="hidden sm:inline">Edit</span>
        </button>
      </template>
    </AppHeader>

    <LayoutPageContainer>
      <AppsClientsClientWorkspace
        ref="workspaceRef"
        :client-id="clientId"
        :initial-tab="initialTab"
        @loaded="onWorkspaceLoaded"
        @tab-change="onTabChange"
      />

      <!-- Edit modal — owned by the page wrapper, NOT by the workspace,
           because the workspace is also mounted inside the slide-over
           panel (a transformed container that would break a body-style
           modal if it weren't teleported). UModal-based, teleports to
           body, so technically safe in either spot — kept here for the
           clear page-only "Edit client" affordance. -->
      <ClientsFormModal
        v-if="client"
        v-model="showEditModal"
        :client="client"
        @updated="onClientUpdated"
        @deleted="onClientDeleted"
      />

    </LayoutPageContainer>
  </div>
</template>

<style scoped>
.apps-page {
  @apply flex flex-col min-h-full;
}
</style>
