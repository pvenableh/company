<script setup lang="ts">
import { cn } from '@/lib/utils'

type Size = 'default' | 'narrow' | 'wide' | 'full'

const props = withDefaults(
  defineProps<{
    size?: Size
    /** Disable the standard top/bottom padding (used when the page renders its own full-bleed sections) */
    flush?: boolean
    /** Drop the horizontal padding too (rare — full-bleed boards/scheduler) */
    bare?: boolean
    class?: string
  }>(),
  {
    size: 'default',
    flush: false,
    bare: false,
  }
)

const widthClass = computed(() => {
  switch (props.size) {
    case 'narrow':
      return 'max-w-5xl'
    case 'wide':
      return 'max-w-screen-2xl'
    case 'full':
      return 'max-w-none'
    default:
      return 'max-w-7xl'
  }
})

const paddingClass = computed(() => {
  if (props.bare) return ''
  if (props.flush) return 'px-4 md:px-6'
  return 'p-4 md:p-6'
})
</script>

<template>
  <div :class="cn(widthClass, paddingClass, 'mx-auto w-full', props.class)">
    <slot />
  </div>
</template>
