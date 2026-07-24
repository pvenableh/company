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
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '~/components/ui/dropdown-menu';
const VALID_TABS: ProjectTabKey[] = ['activity', 'touchpoints', 'tasks', 'tickets', 'channels', 'meetings', 'invoices', 'library', 'contacts', 'timeline'];
// Legacy deep-links (?tab=files / ?tab=documents) fold into the merged surface.
const LEGACY_TAB_ALIAS: Record<string, ProjectTabKey> = { files: 'library', documents: 'library' };

const PROJECT_STATUSES = [
  { label: 'Pending', value: 'Pending' },
  { label: 'Scheduled', value: 'Scheduled' },
  { label: 'In Progress', value: 'In Progress' },
  { label: 'Completed', value: 'completed' },
  { label: 'Archived', value: 'Archived' },
];

const initialTab: ProjectTabKey = (() => {
  const v = route.query.tab;
  if (typeof v !== 'string') return 'overview';
  if (LEGACY_TAB_ALIAS[v]) return LEGACY_TAB_ALIAS[v];
  return (VALID_TABS as string[]).includes(v) ? (v as ProjectTabKey) : 'overview';
})();

const project = ref<any | null>(null);
const showEditModal = ref(false);
const workspaceRef = ref<any>(null);

const { getStatusBadgeClasses, getStatusAccent } = useStatusStyle();

function setStatus(value: string) {
  if (value === project.value?.status) return;
  workspaceRef.value?.patchProject?.({ status: value });
}

function onWorkspaceLoaded(p: any) {
  project.value = p;
  if (p?.id) setEntity('project', String(p.id), p.title || 'Project');
}

function onTabChange(next: ProjectTabKey) {
  router.replace({ query: { ...route.query, tab: next === 'overview' ? undefined : next } });
}

function onProjectUpdated() {
  workspaceRef.value?.reload?.();
}

function onProjectDeleted() {
  router.push('/apps/work');
}

// Scope the Earnest panel + Focus mode to THIS project immediately on mount and
// on any client-side route change — don't wait for the workspace's async
// @loaded (which may not re-fire when the component is reused across
// navigations, leaving the panel stuck on a stale/app-level scope). The real
// title is filled in by onWorkspaceLoaded once the data lands.
if (import.meta.client) {
  watch(
    () => route.params.id,
    (id) => { if (id) setEntity('project', String(id), project.value?.title || 'Project'); },
    { immediate: true },
  );
}

onUnmounted(() => clearEntity());
</script>

<template>
  <div class="apps-page">
    <AppHeader :title="project?.title || 'Project'" back-label="Work" back-to="/apps/work" :show-back="true">
      <template #default>
        <span class="inline-flex items-center gap-2 min-w-0">
          <span class="truncate">{{ project?.title || 'Project' }}</span>
          <DropdownMenu v-if="project">
            <DropdownMenuTrigger as-child>
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider shrink-0 hover:opacity-80 transition-opacity"
                :class="project.status ? getStatusBadgeClasses(project.status) : 'bg-muted text-muted-foreground'"
                title="Change status"
              >
                {{ project.status || 'Set status' }}
                <Icon name="lucide:chevron-down" class="w-2.5 h-2.5 opacity-70" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                v-for="s in PROJECT_STATUSES"
                :key="s.value"
                class="text-xs cursor-pointer"
                @select="setStatus(s.value)"
              >
                <span class="w-2 h-2 rounded-full mr-2 shrink-0" :style="{ backgroundColor: getStatusAccent(s.value) }" />
                {{ s.label }}
                <Icon v-if="project.status === s.value" name="lucide:check" class="w-3 h-3 ml-auto" />
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </template>
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
