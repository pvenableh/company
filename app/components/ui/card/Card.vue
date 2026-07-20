<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from '~/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <div
    data-slot="card"
    :class="
      cn(
        // `border shadow-sm` replaced by the shared liquid-glass edge: a
        // refracted rim (bright at the top, gone by the bottom) plus soft
        // elevation. See `.glass-edge` / `.glass-refract` in theme.css.
        'bg-card text-card-foreground flex flex-col gap-6 rounded-xl py-6 glass-edge glass-refract',
        props.class,
      )
    "
  >
    <slot />
  </div>
</template>
