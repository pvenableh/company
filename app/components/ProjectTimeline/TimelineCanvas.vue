<script setup lang="ts">
import type { ProjectWithRelations } from '~~/shared/projects';

const props = defineProps<{
  projects: ProjectWithRelations[];
  layout: ReturnType<typeof useTimelineLayout>;
  zoom: number;
  selectedEventId: string | null;
}>();

const emit = defineEmits<{
  eventClick: [eventId: string];
}>();
</script>

<template>
  <svg
    :width="layout.canvasWidth.value"
    :height="layout.canvasHeight.value"
    class="project-timeline-canvas"
  >
    <!-- Background grid -->
    <defs>
      <pattern
        id="grid"
        :width="layout.gridSpacing.value"
        height="40"
        patternUnits="userSpaceOnUse"
      >
        <line
          x1="0" y1="0"
          :x2="0" y2="40"
          stroke="currentColor"
          stroke-width="0.5"
          class="text-gray-100 dark:text-gray-800"
        />
      </pattern>
    </defs>
    <rect
      width="100%"
      height="100%"
      fill="url(#grid)"
      class="opacity-50"
    />

    <!-- Time labels -->
    <g class="time-labels">
      <text
        v-for="label in layout.timeLabels.value"
        :key="label.text"
        :x="label.x"
        :y="layout.headerHeight - 10"
        text-anchor="middle"
        class="fill-gray-400 dark:fill-gray-500"
        font-size="9"
        font-weight="600"
        letter-spacing="0.1em"
      >
        {{ label.text }}
      </text>
      <line
        v-for="label in layout.timeLabels.value"
        :key="'grid-' + label.text"
        :x1="label.x"
        :y1="layout.headerHeight"
        :x2="label.x"
        :y2="layout.canvasHeight.value"
        stroke="currentColor"
        stroke-width="0.5"
        stroke-dasharray="4 4"
        class="text-gray-200 dark:text-gray-700"
      />
    </g>

    <!-- Today marker -->
    <g class="today-marker">
      <line
        :x1="layout.todayX.value"
        :y1="layout.headerHeight"
        :x2="layout.todayX.value"
        :y2="layout.canvasHeight.value"
        stroke="#C4A052"
        stroke-width="2"
        stroke-dasharray="6 3"
        opacity="0.6"
      />
      <rect
        :x="layout.todayX.value - 22"
        :y="layout.headerHeight - 18"
        width="44"
        height="16"
        rx="8"
        fill="#C4A052"
      />
      <text
        :x="layout.todayX.value"
        :y="layout.headerHeight - 7"
        text-anchor="middle"
        fill="white"
        font-size="8"
        font-weight="700"
        letter-spacing="0.05em"
      >
        TODAY
      </text>
    </g>

    <!-- Lanes -->
    <ProjectTimelineLane
      v-for="lane in layout.lanes.value"
      :key="lane.project.id"
      :lane="lane"
      :layout="layout"
      :selected-event-id="selectedEventId"
      @event-click="emit('eventClick', $event)"
    />
  </svg>
</template>

<style scoped>
.project-timeline-canvas {
  min-width: 100%;
}
</style>
