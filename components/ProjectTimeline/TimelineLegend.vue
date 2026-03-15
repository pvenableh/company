<script setup lang="ts">
import type { ProjectWithRelations } from '~/types/projects';

defineProps<{
  projects: ProjectWithRelations[];
}>();
</script>

<template>
  <div class="ios-card mx-4 my-3 p-4">
    <div class="flex items-center gap-2 mb-3">
      <Icon name="lucide:info" class="w-3.5 h-3.5 text-muted-foreground" />
      <span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Legend</span>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <div
        v-for="project in projects"
        :key="project.id"
        class="flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-2.5 py-1"
      >
        <span
          class="h-2 w-2 rounded-full shrink-0"
          :style="{ backgroundColor: project.color }"
        />
        <span class="text-[10px] font-medium text-foreground">
          {{ project.title }}
        </span>
        <span
          class="text-[8px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-full"
          :class="{
            'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400': project.status === 'In Progress',
            'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400': project.status === 'completed',
            'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400': project.status === 'Scheduled',
            'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400': project.status === 'Pending',
          }"
        >
          {{ project.status }}
        </span>
      </div>

      <!-- Milestone indicator -->
      <div class="flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-2.5 py-1">
        <span class="h-2 w-2 rounded-sm bg-primary rotate-45 shrink-0" />
        <span class="text-[10px] font-medium text-foreground">Milestone</span>
      </div>

      <!-- Today indicator -->
      <div class="flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-2.5 py-1">
        <span class="h-0 w-4 border-t-2 border-dashed border-[#C4A052] shrink-0" />
        <span class="text-[10px] font-medium text-foreground">Today</span>
      </div>
    </div>
  </div>
</template>
