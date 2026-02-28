<script setup lang="ts">
defineProps<{
  zoom: number;
  loading: boolean;
}>();

const emit = defineEmits<{
  zoomIn: [];
  zoomOut: [];
  zoomReset: [];
  refresh: [];
}>();
</script>

<template>
  <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
    <div class="flex items-center gap-2">
      <h3 class="text-xs font-bold uppercase tracking-widest text-gray-500">Project Timeline</h3>
    </div>

    <div class="flex items-center gap-1">
      <!-- Zoom controls -->
      <Button
        variant="ghost"
        size="sm"
        class="h-7 w-7 p-0"
        :disabled="zoom <= 0.5"
        @click="emit('zoomOut')"
      >
        <Icon name="i-heroicons-minus" class="h-3.5 w-3.5" />
      </Button>

      <button
        class="text-[9px] font-bold uppercase tracking-wider text-gray-400 hover:text-gray-600 min-w-[40px] text-center"
        @click="emit('zoomReset')"
      >
        {{ Math.round(zoom * 100) }}%
      </button>

      <Button
        variant="ghost"
        size="sm"
        class="h-7 w-7 p-0"
        :disabled="zoom >= 3"
        @click="emit('zoomIn')"
      >
        <Icon name="i-heroicons-plus" class="h-3.5 w-3.5" />
      </Button>

      <div class="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />

      <!-- Refresh -->
      <Button
        variant="ghost"
        size="sm"
        class="h-7 w-7 p-0"
        :disabled="loading"
        @click="emit('refresh')"
      >
        <Icon
          name="i-heroicons-arrow-path"
          class="h-3.5 w-3.5"
          :class="{ 'animate-spin': loading }"
        />
      </Button>
    </div>
  </div>
</template>
