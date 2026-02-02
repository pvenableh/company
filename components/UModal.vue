<script setup lang="ts">
/**
 * UModal - NuxtUI-compatible modal wrapper for shadcn-vue Dialog
 */

import { cn } from "@/lib/utils";
import {
  DialogRoot,
  DialogTrigger,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "reka-ui";

const props = withDefaults(
  defineProps<{
    modelValue?: boolean;
    title?: string;
    description?: string;
    preventClose?: boolean;
    fullscreen?: boolean;
    class?: string;
    ui?: {
      base?: string;
      overlay?: string;
      content?: string;
      header?: string;
      body?: string;
      footer?: string;
      title?: string;
      description?: string;
      close?: string;
    };
  }>(),
  {
    modelValue: false,
    preventClose: false,
    fullscreen: false,
  }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "close"): void;
}>();

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => {
    emit("update:modelValue", value);
    if (!value) emit("close");
  },
});

const overlayClasses = computed(() =>
  cn(
    "fixed inset-0 z-50 bg-black/80",
    "data-[state=open]:animate-in data-[state=closed]:animate-out",
    "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
    props.ui?.overlay
  )
);

const contentClasses = computed(() =>
  cn(
    "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
    "grid w-full max-w-lg gap-4 border bg-background p-6 shadow-lg duration-200",
    "data-[state=open]:animate-in data-[state=closed]:animate-out",
    "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
    "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
    "data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]",
    "data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
    "sm:rounded-lg",
    props.fullscreen && "max-w-none h-screen w-screen rounded-none",
    props.ui?.content,
    props.class
  )
);

const handleInteractOutside = (event: Event) => {
  if (props.preventClose) {
    event.preventDefault();
  }
};

const handleEscapeKeyDown = (event: KeyboardEvent) => {
  if (props.preventClose) {
    event.preventDefault();
  }
};
</script>

<template>
  <DialogRoot v-model:open="isOpen">
    <!-- Trigger slot -->
    <DialogTrigger v-if="$slots.trigger" as-child>
      <slot name="trigger" />
    </DialogTrigger>

    <DialogPortal>
      <!-- Overlay -->
      <DialogOverlay :class="overlayClasses" />

      <!-- Content -->
      <DialogContent
        :class="contentClasses"
        @interact-outside="handleInteractOutside"
        @escape-key-down="handleEscapeKeyDown"
      >
        <!-- Header -->
        <div v-if="title || $slots.header" :class="cn('flex flex-col space-y-1.5 text-center sm:text-left', props.ui?.header)">
          <slot name="header">
            <DialogTitle v-if="title" :class="cn('text-lg font-semibold leading-none tracking-tight', props.ui?.title)">
              {{ title }}
            </DialogTitle>
            <DialogDescription v-if="description" :class="cn('text-sm text-muted-foreground', props.ui?.description)">
              {{ description }}
            </DialogDescription>
          </slot>
        </div>

        <!-- Body -->
        <div :class="cn('', props.ui?.body)">
          <slot />
        </div>

        <!-- Footer -->
        <div v-if="$slots.footer" :class="cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', props.ui?.footer)">
          <slot name="footer" />
        </div>

        <!-- Close button -->
        <DialogClose
          v-if="!preventClose"
          :class="cn(
            'absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity',
            'hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
            'disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground',
            props.ui?.close
          )"
        >
          <Icon name="lucide:x" class="h-4 w-4" />
          <span class="sr-only">Close</span>
        </DialogClose>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
