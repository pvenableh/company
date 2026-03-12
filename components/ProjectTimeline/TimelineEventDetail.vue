<script setup lang="ts">
import type { ProjectWithRelations, ProjectEventWithRelations } from '~/types/projects';

const props = defineProps<{
  event: ProjectEventWithRelations;
  project: ProjectWithRelations;
}>();

const emit = defineEmits<{
  close: [];
  updated: [];
}>();

const config = useRuntimeConfig();

const formattedDate = computed(() => {
  return new Date(props.event.event_date || props.event.date || '').toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
});

const taskStats = computed(() => {
  const tasks = props.event.tasks || [];
  const total = tasks.length;
  const completed = tasks.filter((t) => t.completed).length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { total, completed, percent };
});

const fileCount = computed(() => props.event.files?.length || 0);
</script>

<template>
  <div class="event-detail space-y-6 py-4">
    <!-- Date and milestone badge -->
    <div class="flex items-center gap-2">
      <span class="text-xs text-gray-500">{{ formattedDate }}</span>
      <Badge v-if="event.is_milestone" variant="outline" class="text-[9px] uppercase tracking-wider">
        Milestone
      </Badge>
      <Badge
        v-if="typeof event.category_id === 'object' && event.category_id"
        :style="{
          backgroundColor: event.category_id.color,
          color: event.category_id.text_color,
        }"
        class="text-[9px] uppercase tracking-wider"
      >
        {{ event.category_id.name }}
      </Badge>
    </div>

    <!-- Description -->
    <div v-if="event.description" class="prose prose-sm max-w-none dark:prose-invert">
      <div v-html="event.description" />
    </div>

    <!-- Task progress bar -->
    <div v-if="taskStats.total > 0" class="space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-xs font-bold uppercase tracking-wider text-gray-500">Tasks</span>
        <span class="text-xs text-gray-400">
          {{ taskStats.completed }}/{{ taskStats.total }} completed ({{ taskStats.percent }}%)
        </span>
      </div>
      <div class="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800">
        <div
          class="h-full rounded-full transition-all duration-500"
          :style="{
            width: taskStats.percent + '%',
            backgroundColor: project.color,
          }"
        />
      </div>
    </div>

    <!-- Task list -->
    <ProjectTimelineTaskList
      v-if="taskStats.total > 0"
      :tasks="event.tasks || []"
      :project-color="project.color"
      @updated="emit('updated')"
    />

    <!-- Files -->
    <ProjectTimelineFileList
      v-if="fileCount > 0"
      :files="event.files || []"
    />

    <!-- Comments section -->
    <div class="space-y-3">
      <CommentsSystem
        collection="project_events"
        :item-id="String(event.id)"
      />
    </div>

    <!-- Reactions section -->
    <div class="space-y-3">
      <h4 class="text-xs font-bold uppercase tracking-wider text-gray-500">Reactions</h4>
      <ReactionsBar
        :item-id="String(event.id)"
        collection="project_events"
      />
    </div>
  </div>
</template>
