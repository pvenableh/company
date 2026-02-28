<script setup lang="ts">
import type { ProjectWithRelations } from '~/types/projects';

defineProps<{
  projects: ProjectWithRelations[];
}>();
</script>

<template>
  <div class="flex flex-wrap items-center gap-4 px-4 py-3 border-t border-gray-200 dark:border-gray-700">
    <span class="text-[9px] font-bold uppercase tracking-widest text-gray-400">Legend</span>

    <div
      v-for="project in projects"
      :key="project.id"
      class="flex items-center gap-1.5"
    >
      <span
        class="h-2.5 w-2.5 rounded-full"
        :style="{ backgroundColor: project.color }"
      />
      <span class="text-[10px] font-medium text-gray-600 dark:text-gray-400">
        {{ project.name }}
      </span>
      <span
        class="text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded-full"
        :class="{
          'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400': project.status === 'active',
          'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400': project.status === 'completed',
          'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400': project.status === 'paused',
        }"
      >
        {{ project.status }}
      </span>
    </div>

    <!-- Today indicator -->
    <div class="flex items-center gap-1.5">
      <span class="h-0 w-3 border-t-2 border-dashed border-[#C4A052]" />
      <span class="text-[10px] font-medium text-gray-600 dark:text-gray-400">Today</span>
    </div>
  </div>
</template>
