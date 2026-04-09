<script setup lang="ts">
import type { ProjectWithRelations, ProjectEventWithRelations } from '~~/types/projects';

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
  <div class="event-detail space-y-4 py-4">
    <!-- Header: Date, badges, and inline reactions -->
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex flex-wrap items-center gap-2">
        <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon name="lucide:calendar" class="w-3.5 h-3.5" />
          {{ formattedDate }}
        </div>
        <Badge v-if="event.is_milestone" variant="outline" class="text-[9px] uppercase tracking-wider font-semibold">
          <Icon name="lucide:diamond" class="w-3 h-3 mr-1" />
          Milestone
        </Badge>
        <Badge
          v-if="typeof event.category_id === 'object' && event.category_id"
          :style="{
            backgroundColor: event.category_id.color,
            color: event.category_id.text_color,
          }"
          class="text-[9px] uppercase tracking-wider font-semibold"
        >
          {{ event.category_id.name }}
        </Badge>
      </div>
      <!-- Reactions inline with header -->
      <ReactionsBar
        :item-id="String(event.id)"
        collection="project_events"
      />
    </div>

    <!-- Description -->
    <div v-if="event.description" class="ios-card p-4">
      <h4 class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Description</h4>
      <div class="prose prose-sm max-w-none dark:prose-invert text-sm" v-html="event.description" />
    </div>

    <!-- Task progress -->
    <div v-if="taskStats.total > 0" class="ios-card p-4 space-y-3">
      <div class="flex items-center justify-between">
        <h4 class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Tasks</h4>
        <span class="text-[10px] font-medium text-muted-foreground tabular-nums">
          {{ taskStats.completed }}/{{ taskStats.total }} ({{ taskStats.percent }}%)
        </span>
      </div>
      <div class="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          class="h-full rounded-full transition-all duration-500"
          :style="{
            width: taskStats.percent + '%',
            backgroundColor: project.color,
          }"
        />
      </div>
      <ProjectTimelineTaskList
        :tasks="event.tasks || []"
        :project-color="project.color"
        @updated="emit('updated')"
      />
    </div>

    <!-- Files -->
    <div v-if="fileCount > 0" class="ios-card p-4">
      <h4 class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">
        Files ({{ fileCount }})
      </h4>
      <ProjectTimelineFileList :files="event.files || []" />
    </div>

    <!-- Discussion: comments with border separator instead of card -->
    <div class="pt-3 border-t border-border">
      <h4 class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Discussion</h4>
      <CommentsSystem
        collection="project_events"
        :item-id="String(event.id)"
        hide-sort
      />
    </div>
  </div>
</template>
