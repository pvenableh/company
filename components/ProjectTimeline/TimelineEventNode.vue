<script setup lang="ts">
import type { ProjectEventWithRelations } from '~/types/projects';

const props = defineProps<{
  event: ProjectEventWithRelations;
  x: number;
  y: number;
  color: string;
  selected: boolean;
  index: number;
}>();

const emit = defineEmits<{
  click: [];
}>();

const nodeRadius = computed(() => props.event.is_milestone ? 18 : 10);
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

// Detect UUID strings and provide a human-readable fallback
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const displayTitle = computed(() => {
  const title = props.event.title || '';
  if (!UUID_RE.test(title.trim())) return title;

  // Fallback priority: category name → event type → formatted date → "Event"
  if (typeof props.event.category_id === 'object' && props.event.category_id?.name) {
    return props.event.category_id.name;
  }
  if (props.event.type) {
    // Capitalise and replace underscores/hyphens with spaces
    return props.event.type.replace(/[_-]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
  }
  const d = props.event.event_date || props.event.date;
  if (d) {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' Event';
  }
  return 'Event';
});

// Alternate label positions: even index = above, odd index = below
const isAbove = computed(() => props.index % 2 === 0);
const labelDirection = computed(() => isAbove.value ? -1 : 1);
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

    <!-- Main node (subway station style) -->
    <circle
      :cx="x"
      :cy="y"
      :r="nodeRadius"
      :fill="color"
      :stroke="selected ? '#fff' : 'none'"
      :stroke-width="selected ? 3 : 0"
      class="transition-all duration-200"
    />
    <!-- Inner white circle (subway station ring) -->
    <circle
      :cx="x"
      :cy="y"
      :r="nodeRadius - 3"
      fill="white"
      class="dark:fill-gray-900"
      :opacity="event.is_milestone ? 0 : 1"
    />
    <!-- Milestone: star/shine accent -->
    <circle
      v-if="event.is_milestone"
      :cx="x"
      :cy="y"
      :r="nodeRadius + 4"
      fill="none"
      :stroke="color"
      stroke-width="1"
      opacity="0.3"
    />

    <!-- Category badge (same side as title/date) -->
    <g v-if="hasCategory && typeof event.category_id === 'object' && event.category_id">
      <rect
        :x="x - 22"
        :y="isAbove ? y - nodeRadius - 32 : y + nodeRadius + 28"
        width="44"
        height="14"
        rx="7"
        :fill="categoryColor"
      />
      <text
        :x="x"
        :y="isAbove ? y - nodeRadius - 22 : y + nodeRadius + 38"
        text-anchor="middle"
        :fill="categoryTextColor"
        font-size="7"
        font-weight="700"
        letter-spacing="0.05em"
      >
        {{ (event.category_id.name || '').toUpperCase().slice(0, 8) }}
      </text>
    </g>

    <!-- Event title -->
    <text
      :x="x"
      :y="isAbove ? y - nodeRadius - 8 : y + nodeRadius + 14"
      text-anchor="middle"
      class="fill-gray-700 dark:fill-gray-300"
      font-size="9"
      font-weight="700"
    >
      {{ displayTitle.length > 18 ? displayTitle.slice(0, 16) + '...' : displayTitle }}
    </text>

    <!-- Date label -->
    <text
      :x="x"
      :y="isAbove ? y - nodeRadius - 20 : y + nodeRadius + 24"
      text-anchor="middle"
      class="fill-gray-400 dark:fill-gray-500"
      font-size="7.5"
    >
      {{ new Date(event.event_date || event.date || '').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }}
    </text>

    <!-- Task progress indicator (opposite side from title) -->
    <g v-if="taskCount > 0">
      <rect
        :x="x - 16"
        :y="isAbove ? y + nodeRadius + 6 : y - nodeRadius - 18"
        width="32"
        height="12"
        rx="6"
        class="fill-gray-100 dark:fill-gray-700"
      />
      <text
        :x="x"
        :y="isAbove ? y + nodeRadius + 14 : y - nodeRadius - 10"
        text-anchor="middle"
        class="fill-gray-500 dark:fill-gray-400"
        font-size="7"
        font-weight="600"
      >
        {{ completedTasks }}/{{ taskCount }}
      </text>
    </g>

    <!-- Comment/reaction counts (opposite side from title, below task progress) -->
    <g v-if="(event.comment_count || 0) > 0 || (event.reaction_count || 0) > 0">
      <text
        :x="x"
        :y="isAbove ? y + nodeRadius + 26 : y - nodeRadius - 24"
        text-anchor="middle"
        class="fill-gray-400"
        font-size="7"
      >
        <tspan v-if="(event.comment_count || 0) > 0">{{ event.comment_count }}💬</tspan>
        <tspan v-if="(event.comment_count || 0) > 0 && (event.reaction_count || 0) > 0"> </tspan>
        <tspan v-if="(event.reaction_count || 0) > 0">{{ event.reaction_count }}👍</tspan>
      </text>
    </g>
  </g>
</template>
