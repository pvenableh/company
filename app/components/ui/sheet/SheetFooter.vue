<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "~/lib/utils"

const props = defineProps<{ class?: HTMLAttributes["class"] }>()
</script>

<template>
  <div data-slot="sheet-footer" :class="cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end p-4', props.class)">
    <slot />
  </div>
</template>
