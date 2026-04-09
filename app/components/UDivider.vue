<script setup lang="ts">
/**
 * UDivider - NuxtUI-compatible divider wrapper for shadcn-vue Separator
 */

import { Separator } from '@/components/ui/separator'

const props = withDefaults(
  defineProps<{
    label?: string
    icon?: string
    orientation?: 'horizontal' | 'vertical'
    class?: string
  }>(),
  {
    orientation: 'horizontal',
  }
)
</script>

<template>
  <div v-if="label || icon" :class="['flex items-center gap-2', props.class]">
    <Separator class="flex-1" :orientation="orientation" />
    <UIcon v-if="icon" :name="icon" class="h-4 w-4 text-muted-foreground" />
    <span v-if="label" class="text-xs text-muted-foreground">{{ label }}</span>
    <Separator class="flex-1" :orientation="orientation" />
  </div>
  <Separator v-else :orientation="orientation" :class="props.class" />
</template>
