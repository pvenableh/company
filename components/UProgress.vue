<script setup lang="ts">
/**
 * UProgress - NuxtUI-compatible progress bar
 */

import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    value?: number
    max?: number
    color?: 'primary' | 'gray' | 'red' | 'green' | 'blue' | 'yellow' | 'emerald' | 'amber' | string
    size?: 'xs' | 'sm' | 'md' | 'lg'
    class?: string
  }>(),
  {
    value: 0,
    max: 100,
    color: 'primary',
    size: 'md',
  }
)

const percentage = computed(() => Math.min(100, Math.max(0, (props.value / props.max) * 100)))

const sizeClasses = computed(() => {
  const sizes: Record<string, string> = {
    xs: 'h-1',
    sm: 'h-1.5',
    md: 'h-2',
    lg: 'h-3',
  }
  return sizes[props.size] || sizes.md
})

const colorClasses = computed(() => {
  const colors: Record<string, string> = {
    primary: 'bg-primary',
    gray: 'bg-gray-500',
    red: 'bg-red-500',
    green: 'bg-green-500',
    blue: 'bg-blue-500',
    yellow: 'bg-yellow-500',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
  }
  return colors[props.color] || colors.primary
})
</script>

<template>
  <div
    :class="cn('relative w-full overflow-hidden rounded-full bg-secondary', sizeClasses, props.class)"
    role="progressbar"
    :aria-valuenow="value"
    :aria-valuemin="0"
    :aria-valuemax="max"
  >
    <div
      :class="cn('h-full transition-all duration-300 rounded-full', colorClasses)"
      :style="{ width: `${percentage}%` }"
    />
  </div>
</template>
