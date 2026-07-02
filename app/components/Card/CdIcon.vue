<script setup lang="ts">
/**
 * Universal icon. Renders a Lucide SVG (identical on every OS) whenever an
 * `icon` name is provided — across ALL themes. `emoji` is kept only as a
 * graceful fallback for any spot that hasn't been given a lucide name yet.
 * Color it by setting `color` on the parent (lucide inherits currentColor).
 */
defineProps<{
  icon?: string
  emoji?: string
  size?: string | number
}>()
</script>

<template>
  <Icon v-if="icon" :name="icon" :size="size" />
  <span v-else>{{ emoji }}</span>
</template>
