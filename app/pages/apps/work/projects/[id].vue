<script setup lang="ts">
definePageMeta({
  layout: 'apps',
  middleware: ['auth'],
  pageTransition: { name: 'apps-push', mode: 'out-in' },
});
useHead({ title: 'Project Details | Earnest' });

const route = useRoute();
const router = useRouter();
const projectId = route.params.id as string;

const { setEntity, clearEntity, sidebarOpen, closeSidebar } = useEntityPageContext();

// Re-fetch when an Earnest mutation tool changes this project. Replaces the old
// AIContextualSidebar @entity-mutated handler now that the panel is unified.
const { mutationSignal: aiMutationSignal } = useContextualChat();
watch(aiMutationSignal, () => { onProjectUpdated(); });

import type { ProjectTabKey } from '~/components/apps/work/ProjectTabsBar.vue';
const VALID_TABS: ProjectTabKey[] = ['activity', 'tasks', 'tickets', 'channels', 'meetings', 'invoices', 'documents', 'files'];

const initialTab: ProjectTabKey = (() => {
  const v = route.query.tab;
  return typeof v === 'string' && (VALID_TABS as string[]).includes(v) ? (v as ProjectTabKey) : 'activity';
})();

const project = ref<any | null>(null);
const showEditModal = ref(false);
const workspaceRef = ref<any>(null);

function onWorkspaceLoaded(p: any) {
  project.value = p;
  if (p?.id) setEntity('project', String(p.id), p.title || 'Project');
}

function onTabChange(next: ProjectTabKey) {
  router.replace({ query: { ...route.query, tab: next === 'activity' ? undefined : next } });
}

function onProjectUpdated() {
  workspaceRef.value?.reload?.();
}

function onProjectDeleted() {
  router.push('/apps/work');
}

onUnmounted(() => clearEntity());
</script>

<template>
  <div class="apps-page">
    <AppHeader :title="project?.title || 'Project'" back-label="Work" back-to="/apps/work" :show-back="true">
      <template #actions>
        <button
          v-if="project"
          class="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-border text-xs font-medium text-primary hover:bg-primary/10 hover:border-primary/30 transition-colors"
          @click="sidebarOpen = true"
        >
          <EarnestIcon class="w-3.5 h-3.5" />
          <span class="hidden sm:inline">Ask Earnest</span>
        </button>
        <button
          v-if="project"
          class="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors"
          @click="showEditModal = true"
        >
          <Icon name="lucide:pencil" class="w-3.5 h-3.5" />
          <span class="hidden sm:inline">Edit</span>
        </button>
        <NuxtLink
          v-if="project"
          :to="`/projects/${projectId}`"
          class="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors"
          title="Open the legacy project page with Gantt, time-block editor, and file drag-drop upload"
        >
          <Icon name="lucide:external-link" class="w-3.5 h-3.5" />
          <span class="hidden sm:inline">Full Editor</span>
        </NuxtLink>
      </template>
    </AppHeader>

    <LayoutPageContainer>
      <AppsWorkProjectWorkspace
        ref="workspaceRef"
        :project-id="projectId"
        :initial-tab="initialTab"
        @loaded="onWorkspaceLoaded"
        @tab-change="onTabChange"
      />

      <!-- Edit modal — page-only. UModal teleports to body so it's safe
           outside the workspace, but the panel surface gets a "Full Page"
           CTA instead of an Edit button. -->
      <ClientOnly>
        <ProjectsFormModal
          v-if="project"
          v-model="showEditModal"
          :project="project"
          @updated="onProjectUpdated"
          @deleted="onProjectDeleted"
        />
      </ClientOnly>

    </LayoutPageContainer>
  </div>
</template>

<style scoped>
.apps-page {
  @apply flex flex-col min-h-full;
}
</style>
