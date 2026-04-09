<template>
  <span
    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
  >
    {{ tag }}
    <button
      v-if="removable"
      class="hover:text-blue-900 dark:hover:text-blue-200"
      @click.stop="$emit('remove', tag)"
    >
      <Icon name="lucide:x" class="w-3 h-3" />
    </button>
  </span>
</template>

<script setup lang="ts">
defineProps<{ tag: string; removable?: boolean }>();
defineEmits<{ remove: [tag: string] }>();
</script>
