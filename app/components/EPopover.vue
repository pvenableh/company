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

// Support both controlled (`:open`/`v-model:open`) and uncontrolled usage.
// The previous wrapper bound a computed that always resolved to a boolean, which
// forced reka-ui into controlled mode — so bare `<EPopover>` usages (e.g. the
// member budget editor) could never open. Pass `props.open` straight through:
// when it's `undefined`, reka-ui manages its own open state; we still surface the
// open/close events for callers that want them.
function onOpenChange(value: boolean) {
  emit('update:open', value)
  if (value) emit('open')
  else emit('close')
}

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
  <Popover :open="open" @update:open="onOpenChange">
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
