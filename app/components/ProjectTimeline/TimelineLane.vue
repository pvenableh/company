<script setup lang="ts">
import type { TimelineLane, ProjectEventWithRelations } from '~~/types/projects';
import { getEventTimelineDate } from '~~/types/projects';

const props = defineProps<{
  lane: TimelineLane;
  layout: ReturnType<typeof useTimelineLayout>;
  selectedEventId: string | null;
}>();

const emit = defineEmits<{
  eventClick: [eventId: string];
}>();

const project = computed(() => props.lane.project);
const events = computed(() => (project.value.events || []) as ProjectEventWithRelations[]);
const y = computed(() => props.lane.yPosition + props.layout.laneHeight / 2);

const lineStart = computed(() => {
  if (events.value.length === 0) return props.layout.getXPosition(project.value.start_date);
  const firstEventX = props.layout.getXPosition(getEventTimelineDate(events.value[0]));
  const startX = props.layout.getXPosition(project.value.start_date);
  return Math.min(firstEventX, startX);
});

const lineEnd = computed(() => {
  if (events.value.length === 0) {
    return project.value.completion_date
      ? props.layout.getXPosition(project.value.completion_date)
      : props.layout.todayX.value;
  }
  const lastEventX = props.layout.getXPosition(getEventTimelineDate(events.value[events.value.length - 1]));
  const endX = project.value.completion_date
    ? props.layout.getXPosition(project.value.completion_date)
    : props.layout.todayX.value;
  return Math.max(lastEventX, endX);
});

const isActive = computed(() => project.value.status === 'In Progress');
</script>

<template>
  <g class="timeline-lane">
    <!-- Project label -->
    <text
      :x="lineStart - 10"
      :y="y - 25"
      text-anchor="end"
      class="fill-gray-600 dark:fill-gray-300"
      font-size="11"
      font-weight="700"
      letter-spacing="0.05em"
    >
      {{ (project.title || '').toUpperCase() }}
    </text>

    <!-- Status badge -->
    <rect
      :x="lineStart - 10 - project.status.length * 5.5"
      :y="y - 16"
      :width="project.status.length * 5.5 + 10"
      height="14"
      rx="7"
      :fill="project.color"
      opacity="0.15"
    />
    <text
      :x="lineStart - 10 - (project.status.length * 5.5) / 2"
      :y="y - 7"
      text-anchor="middle"
      :fill="project.color"
      font-size="7"
      font-weight="700"
      letter-spacing="0.08em"
    >
      {{ project.status.toUpperCase() }}
    </text>

    <!-- Main timeline line (subway track) -->
    <line
      :x1="lineStart"
      :y1="y"
      :x2="lineEnd"
      :y2="y"
      :stroke="project.color"
      stroke-width="6"
      stroke-linecap="round"
      :opacity="project.status === 'completed' ? 0.5 : 0.85"
    />

    <!-- Start station cap -->
    <circle
      :cx="lineStart"
      :cy="y"
      r="8"
      :fill="project.color"
    />
    <circle
      :cx="lineStart"
      :cy="y"
      r="4"
      fill="white"
      class="dark:fill-gray-900"
    />

    <!-- Active project pulsing indicator -->
    <circle
      v-if="isActive"
      :cx="layout.todayX.value"
      :cy="y"
      r="8"
      :fill="project.color"
      opacity="0.3"
    >
      <animate
        attributeName="r"
        values="8;14;8"
        dur="2s"
        repeatCount="indefinite"
      />
      <animate
        attributeName="opacity"
        values="0.3;0.1;0.3"
        dur="2s"
        repeatCount="indefinite"
      />
    </circle>
    <circle
      v-if="isActive"
      :cx="layout.todayX.value"
      :cy="y"
      r="5"
      :fill="project.color"
    />

    <!-- End station cap for completed projects -->
    <circle
      v-if="project.status === 'completed'"
      :cx="lineEnd"
      :cy="y"
      r="8"
      :fill="project.color"
      opacity="0.6"
    />
    <circle
      v-if="project.status === 'completed'"
      :cx="lineEnd"
      :cy="y"
      r="4"
      fill="white"
      class="dark:fill-gray-900"
      opacity="0.6"
    />

    <!-- Event nodes -->
    <ProjectTimelineEventNode
      v-for="(event, index) in events"
      :key="event.id"
      :event="event"
      :x="layout.getXPosition(getEventTimelineDate(event))"
      :y="y"
      :color="project.color"
      :selected="event.id === selectedEventId"
      :index="index"
      @click="emit('eventClick', event.id)"
    />

    <!-- Sub-project branch lines -->
    <g v-if="project.children?.length">
      <line
        v-for="child in project.children"
        :key="'branch-' + child.id"
        :x1="layout.getXPosition(project.start_date)"
        :y1="y"
        :x2="layout.getXPosition(project.start_date)"
        :y2="y + layout.laneHeight"
        :stroke="project.color"
        stroke-width="1"
        stroke-dasharray="3 3"
        opacity="0.3"
      />
    </g>
  </g>
</template>
