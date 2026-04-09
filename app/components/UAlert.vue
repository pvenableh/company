<script setup lang="ts">
/**
 * UAlert - NuxtUI-compatible alert wrapper for shadcn-vue Alert
 */

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    title?: string
    description?: string
    color?: 'primary' | 'red' | 'green' | 'blue' | 'yellow' | 'orange' | 'gray' | 'white' | 'amber' | 'emerald' | string
    variant?: 'solid' | 'soft' | 'subtle' | 'outline'
    icon?: string
    class?: string
    ui?: Record<string, string>
  }>(),
  {
    color: 'primary',
    variant: 'soft',
  }
)

const colorClasses = computed(() => {
  const { color } = props
  // Map "subtle" to "soft"
  const variant = props.variant === 'subtle' ? 'soft' : props.variant
  const map: Record<string, Record<string, string>> = {
    primary: {
      solid: 'bg-primary text-primary-foreground border-primary',
      soft: 'bg-primary/10 text-primary border-primary/20',
      outline: 'border-primary text-primary',
    },
    red: {
      solid: 'bg-red-500 text-white border-red-500',
      soft: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800',
      outline: 'border-red-500 text-red-600',
    },
    green: {
      solid: 'bg-green-500 text-white border-green-500',
      soft: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800',
      outline: 'border-green-500 text-green-600',
    },
    blue: {
      solid: 'bg-blue-500 text-white border-blue-500',
      soft: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800',
      outline: 'border-blue-500 text-blue-600',
    },
    yellow: {
      solid: 'bg-yellow-500 text-white border-yellow-500',
      soft: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800',
      outline: 'border-yellow-500 text-yellow-600',
    },
    orange: {
      solid: 'bg-orange-500 text-white border-orange-500',
      soft: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800',
      outline: 'border-orange-500 text-orange-600',
    },
    gray: {
      solid: 'bg-gray-500 text-white border-gray-500',
      soft: 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
      outline: 'border-gray-300 text-gray-600 dark:border-gray-600',
    },
    white: {
      solid: 'bg-white text-gray-900 border-gray-200',
      soft: 'bg-white/80 text-gray-900 border-gray-100',
      outline: 'border-gray-200 text-gray-900 bg-white',
    },
    amber: {
      solid: 'bg-amber-500 text-white border-amber-500',
      soft: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800',
      outline: 'border-amber-500 text-amber-600',
    },
    emerald: {
      solid: 'bg-emerald-500 text-white border-emerald-500',
      soft: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800',
      outline: 'border-emerald-500 text-emerald-600',
    },
  }
  return map[color]?.[variant] || map.gray.soft
})
</script>

<template>
  <Alert :class="cn(colorClasses, props.ui?.base, props.class)">
    <UIcon v-if="icon" :name="icon" class="h-4 w-4" />
    <AlertTitle v-if="title">{{ title }}</AlertTitle>
    <AlertDescription v-if="description || $slots.description">
      <slot name="description">{{ description }}</slot>
    </AlertDescription>
    <slot />
  </Alert>
</template>
