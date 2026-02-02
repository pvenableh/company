<script setup lang="ts">
/**
 * UCard - NuxtUI-compatible card wrapper for shadcn-vue Card
 */

import { cn } from "@/lib/utils";

const props = withDefaults(
  defineProps<{
    class?: string;
    ui?: {
      base?: string;
      header?: string;
      body?: string;
      footer?: string;
      divide?: string;
      ring?: string;
      rounded?: string;
      shadow?: string;
      background?: string;
    };
  }>(),
  {}
);

const cardClasses = computed(() =>
  cn(
    "rounded-lg border bg-card text-card-foreground shadow-sm",
    props.ui?.base,
    props.ui?.ring,
    props.ui?.rounded,
    props.ui?.shadow,
    props.ui?.background,
    props.class
  )
);

const headerClasses = computed(() =>
  cn("flex flex-col space-y-1.5 p-6", props.ui?.header)
);

const bodyClasses = computed(() =>
  cn("p-6 pt-0", props.ui?.body)
);

const footerClasses = computed(() =>
  cn("flex items-center p-6 pt-0", props.ui?.footer)
);
</script>

<template>
  <div :class="cardClasses">
    <!-- Header -->
    <div v-if="$slots.header" :class="headerClasses">
      <slot name="header" />
    </div>

    <!-- Body / Default slot -->
    <div :class="bodyClasses">
      <slot />
    </div>

    <!-- Footer -->
    <div v-if="$slots.footer" :class="footerClasses">
      <slot name="footer" />
    </div>
  </div>
</template>
