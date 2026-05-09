<script setup lang="ts">
/**
 * ResponsiveModal — UModal-shaped wrapper that flips to a bottom drawer on
 * mobile (< md breakpoint) and a centered dialog on desktop (≥ md).
 *
 * Mobile: Sheet with side="bottom" — full-width, slides up.
 * Desktop: Dialog — comfortable max-width per `size` prop.
 *
 * API mirrors UModal so the modal sweep stays mechanical: v-model, title,
 * description, hideClose, preventClose. Default slot is the body. Header
 * and footer slots match UModal as well.
 *
 * Sizing (desktop only — mobile is always full-width bottom sheet):
 *   sm  → sm:max-w-md   (28rem)
 *   md  → sm:max-w-lg   (32rem)  default
 *   lg  → sm:max-w-2xl  (42rem)
 *   xl  → sm:max-w-4xl  (56rem)
 */

import { useMediaQuery } from '@vueuse/core'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

type Size = 'sm' | 'md' | 'lg' | 'xl'

const props = withDefaults(
  defineProps<{
    modelValue?: boolean
    title?: string
    description?: string
    size?: Size
    preventClose?: boolean
    hideClose?: boolean
    class?: string
    ui?: {
      content?: string
      header?: string
      body?: string
      footer?: string
      title?: string
      description?: string
    }
  }>(),
  {
    modelValue: false,
    size: 'md',
    preventClose: false,
    hideClose: false,
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'close'): void
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

// md breakpoint per Tailwind defaults (768px). SSR-safe: default to desktop.
const isDesktop = useMediaQuery('(min-width: 768px)')

const SIZE_CLASS: Record<Size, string> = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
}

const handleInteractOutside = (event: Event) => {
  if (props.preventClose) event.preventDefault()
}

const handleEscapeKeyDown = (event: KeyboardEvent) => {
  if (props.preventClose) event.preventDefault()
}
</script>

<template>
  <!-- Desktop: centered Dialog -->
  <Dialog v-if="isDesktop" v-model:open="isOpen">
    <DialogTrigger v-if="$slots.trigger" as-child>
      <slot name="trigger" />
    </DialogTrigger>

    <DialogContent
      :show-close-button="!hideClose"
      :class="cn(
        'p-0 gap-0 overflow-hidden',
        SIZE_CLASS[size],
        props.ui?.content,
        props.class,
      )"
      @interact-outside="handleInteractOutside"
      @escape-key-down="handleEscapeKeyDown"
    >
      <DialogHeader
        v-if="title || $slots.header"
        :class="cn('px-6 py-4 border-b border-border/40', props.ui?.header)"
      >
        <slot name="header">
          <DialogTitle v-if="title" :class="props.ui?.title">{{ title }}</DialogTitle>
          <DialogDescription v-if="description" :class="props.ui?.description">{{ description }}</DialogDescription>
        </slot>
      </DialogHeader>

      <div :class="cn('px-6 py-4', props.ui?.body)">
        <slot />
      </div>

      <DialogFooter
        v-if="$slots.footer"
        :class="cn('px-6 py-4 border-t border-border/40', props.ui?.footer)"
      >
        <slot name="footer" />
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <!-- Mobile: bottom Sheet -->
  <Sheet v-else v-model:open="isOpen">
    <SheetTrigger v-if="$slots.trigger" as-child>
      <slot name="trigger" />
    </SheetTrigger>

    <SheetContent
      side="bottom"
      :show-close-button="!hideClose"
      :class="cn(
        'p-0 gap-0 max-h-[90vh] overflow-y-auto rounded-t-xl',
        props.ui?.content,
        props.class,
      )"
      @interact-outside="handleInteractOutside"
      @escape-key-down="handleEscapeKeyDown"
    >
      <SheetHeader
        v-if="title || $slots.header"
        :class="cn('px-6 py-4 border-b border-border/40 text-left', props.ui?.header)"
      >
        <slot name="header">
          <SheetTitle v-if="title" :class="props.ui?.title">{{ title }}</SheetTitle>
          <SheetDescription v-if="description" :class="props.ui?.description">{{ description }}</SheetDescription>
        </slot>
      </SheetHeader>

      <div :class="cn('px-6 py-4', props.ui?.body)">
        <slot />
      </div>

      <SheetFooter
        v-if="$slots.footer"
        :class="cn('px-6 py-4 border-t border-border/40', props.ui?.footer)"
      >
        <slot name="footer" />
      </SheetFooter>
    </SheetContent>
  </Sheet>
</template>
