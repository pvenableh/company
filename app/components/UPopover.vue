<script setup lang="ts">
/**
 * UPopover - NuxtUI-compatible popover wrapper for shadcn-vue Popover
 */

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

const props = withDefaults(
  defineProps<{
    open?: boolean
    disabled?: boolean
    mode?: 'click' | 'hover'
    popper?: {
      placement?: string
      offsetDistance?: number
      arrow?: boolean
    }
    class?: string
    ui?: Record<string, string>
  }>(),
  {
    mode: 'click',
    disabled: false,
  }
)

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'close'): void
  (e: 'open'): void
}>()

const isOpen = computed({
  get: () => props.open ?? undefined,
  set: (value: boolean | undefined) => {
    emit('update:open', !!value)
    if (!value) emit('close')
    else emit('open')
  },
})

// Map NuxtUI placement to radix placement
const side = computed(() => {
  const placement = props.popper?.placement || 'bottom'
  if (placement.startsWith('top')) return 'top' as const
  if (placement.startsWith('right')) return 'right' as const
  if (placement.startsWith('left')) return 'left' as const
  return 'bottom' as const
})

const align = computed(() => {
  const placement = props.popper?.placement || 'bottom'
  if (placement.endsWith('-start')) return 'start' as const
  if (placement.endsWith('-end')) return 'end' as const
  return 'center' as const
})
</script>

<template>
  <Popover v-model:open="isOpen">
    <PopoverTrigger as-child :disabled="disabled">
      <slot />
    </PopoverTrigger>
    <PopoverContent
      :side="side"
      :align="align"
      :side-offset="popper?.offsetDistance || 4"
      :class="[$props.class, $props.ui?.content]"
    >
      <slot name="panel">
        <slot name="content" />
      </slot>
    </PopoverContent>
  </Popover>
</template>
