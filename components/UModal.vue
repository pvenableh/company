<script setup lang="ts">
/**
 * UModal - NuxtUI-compatible modal wrapper using shadcn-vue Dialog
 *
 * Maps NuxtUI's UModal API (v-model, title, description, preventClose,
 * fullscreen, slots: trigger/header/footer) onto shadcn-vue's Dialog
 * component system.
 */

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

const props = withDefaults(
  defineProps<{
    modelValue?: boolean
    title?: string
    description?: string
    preventClose?: boolean
    fullscreen?: boolean
    class?: string
    ui?: {
      base?: string
      overlay?: string
      content?: string
      header?: string
      body?: string
      footer?: string
      title?: string
      description?: string
      close?: string
    }
  }>(),
  {
    modelValue: false,
    preventClose: false,
    fullscreen: false,
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

const handleInteractOutside = (event: Event) => {
  if (props.preventClose) {
    event.preventDefault()
  }
}

const handleEscapeKeyDown = (event: KeyboardEvent) => {
  if (props.preventClose) {
    event.preventDefault()
  }
}
</script>

<template>
  <Dialog v-model:open="isOpen">
    <!-- Trigger slot -->
    <DialogTrigger v-if="$slots.trigger" as-child>
      <slot name="trigger" />
    </DialogTrigger>

    <DialogContent
      :show-close-button="false"
      :class="cn(
        props.fullscreen && 'max-w-none h-screen w-screen rounded-none sm:max-w-none',
        props.ui?.content,
        props.class
      )"
      @interact-outside="handleInteractOutside"
      @escape-key-down="handleEscapeKeyDown"
    >
      <!-- Header -->
      <DialogHeader v-if="title || $slots.header" :class="props.ui?.header">
        <slot name="header">
          <DialogTitle v-if="title" :class="props.ui?.title">
            {{ title }}
          </DialogTitle>
          <DialogDescription v-if="description" :class="props.ui?.description">
            {{ description }}
          </DialogDescription>
        </slot>
      </DialogHeader>

      <!-- Body -->
      <div :class="props.ui?.body">
        <slot />
      </div>

      <!-- Footer -->
      <DialogFooter v-if="$slots.footer" :class="props.ui?.footer">
        <slot name="footer" />
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
