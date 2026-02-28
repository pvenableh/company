<script setup lang="ts">
import type { ProjectWithRelations, ProjectEventWithRelations } from '~/types/projects';

const { projects, loading, error, refresh, fetchProjects } = useProjectTimeline();
const zoom = ref(1);
const selectedEventId = ref<string | null>(null);
const showEventDetail = ref(false);

const layout = useTimelineLayout(projects, zoom);

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
  zoom.value = Math.max(zoom.value - 0.25, 0.5);
}

function handleZoomReset() {
  zoom.value = 1;
}

onMounted(() => {
  fetchProjects();
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
    <div v-else class="overflow-x-auto overflow-y-auto">
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

    <!-- Event Detail Sheet -->
    <Sheet :open="showEventDetail" @update:open="(val: boolean) => { if (!val) handleCloseDetail() }">
      <SheetContent side="right" class="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle class="uppercase text-sm tracking-wider">
            {{ selectedEvent?.title || 'Event Detail' }}
          </SheetTitle>
          <SheetDescription v-if="selectedEventProject">
            <span
              class="inline-block h-2 w-2 rounded-full mr-1"
              :style="{ backgroundColor: selectedEventProject.color }"
            />
            {{ selectedEventProject.title }}
          </SheetDescription>
        </SheetHeader>

        <ProjectTimelineEventDetail
          v-if="selectedEvent && selectedEventProject"
          :event="selectedEvent"
          :project="selectedEventProject"
          @close="handleCloseDetail"
          @updated="refresh"
        />
      </SheetContent>
    </Sheet>
  </div>
</template>
