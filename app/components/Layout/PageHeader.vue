<script setup lang="ts">
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    title?: string
    subtitle?: string
    /** Drop the bottom margin between header and content */
    flush?: boolean
    class?: string
  }>(),
  {
    flush: false,
  }
)
</script>

<template>
  <div :class="cn('flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3', flush ? '' : 'mb-6', props.class)">
    <div class="min-w-0">
      <slot name="title">
        <h1 v-if="title" class="text-xl font-semibold text-foreground truncate">{{ title }}</h1>
      </slot>
      <slot name="subtitle">
        <p v-if="subtitle" class="text-sm text-muted-foreground mt-0.5">{{ subtitle }}</p>
      </slot>
    </div>
    <div v-if="$slots.actions" class="flex items-center gap-2 shrink-0">
      <slot name="actions" />
    </div>
  </div>
</template>
