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

// Color prop → palette-driven class strings. `tokenFor` + `fgFor` live
// in `~/utils/palette-tokens` (auto-imported by Nuxt) so alerts share
// the same alias table as UButton / UBadge / UProgress / UChip.
const colorClasses = computed(() => {
  const { color } = props
  // Map "subtle" to "soft"
  const variant = props.variant === 'subtle' ? 'soft' : props.variant

  const token = tokenFor(color)
  if (token) {
    if (variant === 'solid') return `bg-${token} ${fgFor(token)} border-${token}`
    if (variant === 'soft') return `bg-${token}/10 text-${token} border-${token}/20`
    if (variant === 'outline') return `border-${token} text-${token}`
    return ''
  }

  // Foundation neutrals — palette-independent on purpose.
  if (color === 'gray') {
    if (variant === 'solid') return 'bg-muted-foreground text-white border-muted-foreground'
    if (variant === 'soft') return 'bg-muted text-muted-foreground border-border'
    if (variant === 'outline') return 'border-input text-muted-foreground'
  }
  if (color === 'white') {
    if (variant === 'solid') return 'bg-white text-gray-900 border-gray-200'
    if (variant === 'soft') return 'bg-white/80 text-gray-900 border-gray-100'
    if (variant === 'outline') return 'border-gray-200 text-gray-900 bg-white'
  }

  return 'bg-muted text-muted-foreground border-border'
})
</script>

<template>
  <Alert :class="cn(colorClasses, props.ui?.base, props.class)">
    <EIcon v-if="icon" :name="icon" class="h-4 w-4" />
    <AlertTitle v-if="title">{{ title }}</AlertTitle>
    <AlertDescription v-if="description || $slots.description">
      <slot name="description">{{ description }}</slot>
    </AlertDescription>
    <slot />
  </Alert>
</template>
