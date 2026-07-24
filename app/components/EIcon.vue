<script setup lang="ts">
/**
 * UIcon - NuxtUI-compatible icon wrapper for @nuxt/icon
 * Converts NuxtUI icon format (i-heroicons-xxx) to @nuxt/icon format (heroicons:xxx)
 */

import { computed } from "vue";
import { convertIconName } from "@/lib/utils";

const props = defineProps<{
  name: string;
  size?: string | number;
  class?: string;
}>();

const iconName = computed(() => convertIconName(props.name));

const sizeClass = computed(() => {
  if (!props.size) return "";
  if (typeof props.size === "number") {
    return `w-${props.size} h-${props.size}`;
  }
  const sizes: Record<string, string> = {
    xs: "w-3 h-3",
    sm: "w-4 h-4",
    md: "w-5 h-5",
    lg: "w-6 h-6",
    xl: "w-8 h-8",
  };
  return sizes[props.size] || props.size;
});
</script>

<template>
  <Icon :name="iconName" :class="[sizeClass, props.class]" />
</template>
