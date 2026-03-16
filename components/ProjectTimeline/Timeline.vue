<script setup lang="ts">
import type { ProjectWithRelations, ProjectEventWithRelations } from '~/types/projects';

const { projects, loading, error, refresh, fetchProjects } = useProjectTimeline();
const zoom = ref(1.5);
const selectedEventId = ref<string | null>(null);
const showEventDetail = ref(false);
const scrollContainer = ref<HTMLElement | null>(null);

const layout = useTimelineLayout(projects, zoom);

// Scroll to today marker when data loads
function scrollToToday() {
  nextTick(() => {
    if (!scrollContainer.value) return;
    const todayPos = layout.todayX.value;
    const containerWidth = scrollContainer.value.clientWidth;
    // Center today marker in the viewport
    scrollContainer.value.scrollLeft = Math.max(0, todayPos - containerWidth / 3);
  });
}

watch(
  () => projects.value.length,
  (len) => {
    if (len > 0) scrollToToday();
  },
);

const selectedEvent = computed<ProjectEventWithRelations | null>(() => {
  if (!selectedEventId.value) return null;
  for (const project of projects.value) {
    const event = project.events?.find((e) => e.id === selectedEventId.value);
    if (event) return event as ProjectEventWithRelations;
  }
  return null;
});

const selectedEventProject = computed<ProjectWithRelations | null>(() => {
  if (!selectedEventId.value) return null;
  for (const project of projects.value) {
    if (project.events?.find((e) => e.id === selectedEventId.value)) return project;
  }
  return null;
});

function handleEventClick(eventId: string) {
  selectedEventId.value = eventId;
  showEventDetail.value = true;
}

function handleCloseDetail() {
  showEventDetail.value = false;
  selectedEventId.value = null;
}

function handleZoomIn() {
  zoom.value = Math.min(zoom.value + 0.25, 3);
}

function handleZoomOut() {
  zoom.value = Math.max(zoom.value - 0.25, 1.5);
}

function handleZoomReset() {
  zoom.value = 1.5;
}

// Watch for user becoming available (session hydration may not be complete at mount)
const { user: authUser } = useDirectusAuth();
const { selectedOrg } = useOrganization();
const { selectedClient } = useClients();

// Re-fetch when organization or client changes
watch([selectedOrg, selectedClient], () => {
    fetchProjects();
});

watch(
  () => authUser.value?.id,
  (newId) => {
    if (newId && projects.value.length === 0 && !loading.value) {
      fetchProjects();
    }
  },
  { immediate: true }
);

onMounted(() => {
  // Attempt fetch on mount; if user isn't hydrated yet, the watcher above will retry
  if (authUser.value?.id) {
    fetchProjects();
  }
});
</script>

<template>
  <div class="project-timeline relative">
    <!-- Controls -->
    <ProjectTimelineControls
      :zoom="zoom"
      :loading="loading"
      @zoom-in="handleZoomIn"
      @zoom-out="handleZoomOut"
      @zoom-reset="handleZoomReset"
      @refresh="refresh"
    />

    <!-- Loading state -->
    <div v-if="loading" class="flex items-center justify-center min-h-[400px]">
      <div class="flex flex-col items-center gap-3">
        <div class="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-[#C4A052]" />
        <span class="text-xs uppercase tracking-widest text-gray-400">Loading timeline...</span>
      </div>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="flex items-center justify-center min-h-[400px]">
      <div class="text-center">
        <p class="text-sm text-red-500">{{ error }}</p>
        <button class="mt-2 text-xs uppercase tracking-widest text-gray-400 hover:text-gray-600" @click="refresh">
          Try again
        </button>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else-if="projects.length === 0" class="flex items-center justify-center min-h-[400px]">
      <div class="text-center">
        <Icon name="i-heroicons-map" class="h-12 w-12 text-gray-300 mx-auto mb-3" />
        <p class="text-sm text-gray-400">No active projects found</p>
      </div>
    </div>

    <!-- Canvas -->
    <div v-else ref="scrollContainer" class="overflow-x-auto overflow-y-auto">
      <ProjectTimelineCanvas
        :projects="projects"
        :layout="layout"
        :zoom="zoom"
        :selected-event-id="selectedEventId"
        @event-click="handleEventClick"
      />

      <!-- Legend -->
      <ProjectTimelineLegend :projects="projects" />
    </div>

    <!-- Event Detail Modal -->
    <UModal v-model="showEventDetail" class="sm:max-w-xl">
      <template #header>
        <div class="flex items-center justify-between w-full">
          <div class="flex items-center gap-2">
            <span
              v-if="selectedEventProject"
              class="inline-block h-2.5 w-2.5 rounded-full"
              :style="{ backgroundColor: selectedEventProject.color }"
            />
            <h3 class="t-label">{{ selectedEvent?.title || 'Event Detail' }}</h3>
          </div>
          <Button variant="ghost" size="icon-sm" @click="handleCloseDetail">
            <Icon name="i-heroicons-x-mark" class="h-4 w-4" />
          </Button>
        </div>
      </template>

      <div class="max-h-[70vh] overflow-y-auto px-4 pb-4">
        <ProjectTimelineEventDetail
          v-if="selectedEvent && selectedEventProject"
          :event="selectedEvent"
          :project="selectedEventProject"
          @close="handleCloseDetail"
          @updated="refresh"
        />
      </div>
    </UModal>
  </div>
</template>
