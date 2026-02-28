<script setup lang="ts">
import type { ProjectEventWithRelations } from '~/types/projects';

const props = defineProps<{
  event: ProjectEventWithRelations;
  x: number;
  y: number;
  color: string;
  selected: boolean;
}>();

const emit = defineEmits<{
  click: [];
}>();

const nodeRadius = computed(() => props.event.is_milestone ? 10 : 7);
const taskCount = computed(() => props.event.tasks?.length || 0);
const completedTasks = computed(() => props.event.tasks?.filter((t) => t.completed).length || 0);
const hasCategory = computed(() => !!props.event.category_id);
const categoryColor = computed(() => {
  if (typeof props.event.category_id === 'object' && props.event.category_id) {
    return props.event.category_id.color;
  }
  return props.color;
});
const categoryTextColor = computed(() => {
  if (typeof props.event.category_id === 'object' && props.event.category_id) {
    return props.event.category_id.text_color;
  }
  return '#FFFFFF';
});
</script>

<template>
  <g
    class="timeline-event-node cursor-pointer"
    @click="emit('click')"
  >
    <!-- Selection ring -->
    <circle
      v-if="selected"
      :cx="x"
      :cy="y"
      :r="nodeRadius + 5"
      fill="none"
      :stroke="color"
      stroke-width="2"
      opacity="0.4"
      stroke-dasharray="3 2"
    >
      <animateTransform
        attributeName="transform"
        type="rotate"
        :values="`0 ${x} ${y};360 ${x} ${y}`"
        dur="8s"
        repeatCount="indefinite"
      />
    </circle>

    <!-- Hover ring -->
    <circle
      :cx="x"
      :cy="y"
      :r="nodeRadius + 3"
      fill="none"
      :stroke="color"
      stroke-width="1.5"
      opacity="0"
      class="transition-opacity duration-200 hover:opacity-40"
    />

    <!-- Main node -->
    <circle
      :cx="x"
      :cy="y"
      :r="nodeRadius"
      :fill="color"
      :stroke="selected ? '#fff' : 'none'"
      :stroke-width="selected ? 2 : 0"
      class="transition-all duration-200"
    />

    <!-- Milestone diamond overlay -->
    <rect
      v-if="event.is_milestone"
      :x="x - 5"
      :y="y - 5"
      width="10"
      height="10"
      rx="1"
      fill="white"
      opacity="0.3"
      :transform="`rotate(45 ${x} ${y})`"
    />

    <!-- Event title -->
    <text
      :x="x"
      :y="y + nodeRadius + 14"
      text-anchor="middle"
      class="fill-gray-700 dark:fill-gray-300"
      font-size="9"
      font-weight="600"
    >
      {{ (event.title || '').length > 20 ? (event.title || '').slice(0, 18) + '...' : (event.title || '') }}
    </text>

    <!-- Date label -->
    <text
      :x="x"
      :y="y + nodeRadius + 25"
      text-anchor="middle"
      class="fill-gray-400 dark:fill-gray-500"
      font-size="7"
    >
      {{ new Date(event.event_date || event.date || '').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }}
    </text>

    <!-- Category badge -->
    <g v-if="hasCategory && typeof event.category_id === 'object' && event.category_id">
      <rect
        :x="x - 20"
        :y="y - nodeRadius - 18"
        width="40"
        height="12"
        rx="6"
        :fill="categoryColor"
      />
      <text
        :x="x"
        :y="y - nodeRadius - 10"
        text-anchor="middle"
        :fill="categoryTextColor"
        font-size="6"
        font-weight="700"
        letter-spacing="0.05em"
      >
        {{ (event.category_id.name || '').toUpperCase().slice(0, 8) }}
      </text>
    </g>

    <!-- Task progress indicator -->
    <g v-if="taskCount > 0">
      <rect
        :x="x + nodeRadius + 4"
        :y="y - 5"
        width="28"
        height="10"
        rx="5"
        class="fill-gray-100 dark:fill-gray-700"
      />
      <text
        :x="x + nodeRadius + 18"
        :y="y + 2"
        text-anchor="middle"
        class="fill-gray-500 dark:fill-gray-400"
        font-size="7"
        font-weight="600"
      >
        {{ completedTasks }}/{{ taskCount }}
      </text>
    </g>

    <!-- Comment/reaction counts -->
    <g v-if="(event.comment_count || 0) > 0 || (event.reaction_count || 0) > 0">
      <text
        :x="x"
        :y="y + nodeRadius + 36"
        text-anchor="middle"
        class="fill-gray-400"
        font-size="7"
      >
        <tspan v-if="(event.comment_count || 0) > 0">{{ event.comment_count }} comments</tspan>
        <tspan v-if="(event.comment_count || 0) > 0 && (event.reaction_count || 0) > 0"> · </tspan>
        <tspan v-if="(event.reaction_count || 0) > 0">{{ event.reaction_count }} reactions</tspan>
      </text>
    </g>
  </g>
</template>
