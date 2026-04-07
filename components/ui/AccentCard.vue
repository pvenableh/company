<script setup lang="ts">
/**
 * AccentCard — Reusable card with a left accent pill indicator.
 *
 * Usage:
 *   <AccentCard accent="bg-red-500" class="bg-red-50/50">
 *     content here
 *   </AccentCard>
 *
 * Props:
 *   accent  — Tailwind bg class for the pill color (e.g. "bg-red-500")
 *   tag     — HTML element to render (default: "div")
 */
import { cn } from '@/lib/utils'

const props = withDefaults(defineProps<{
  accent?: string
  tag?: string
  class?: string
}>(), {
  accent: 'bg-gray-300',
  tag: 'div',
})
</script>

<template>
  <component
    :is="tag"
    :class="cn('relative rounded-lg p-3 pl-6', props.class)"
  >
    <span
      class="absolute left-2 top-2.5 bottom-2.5 w-[3px] rounded-full"
      :class="accent"
    />
    <slot />
  </component>
</template>
