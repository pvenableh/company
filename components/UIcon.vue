<script setup lang="ts">
/**
 * UIcon - NuxtUI-compatible icon wrapper for @nuxt/icon
 * Converts NuxtUI icon format (i-heroicons-xxx) to @nuxt/icon format (heroicons:xxx)
 */

import { computed } from "vue";

const props = defineProps<{
  name: string;
  size?: string | number;
  class?: string;
}>();

/**
 * Convert NuxtUI icon format to @nuxt/icon format
 * i-heroicons-check → heroicons:check
 * i-heroicons-solid-check → heroicons-solid:check
 * i-lucide-star → lucide:star
 */
const iconName = computed(() => {
  let name = props.name;

  // Already in new format
  if (name.includes(":")) return name;

  // Convert from NuxtUI format
  if (name.startsWith("i-")) {
    name = name.slice(2); // Remove 'i-' prefix
  }

  // Handle collections with prefixes
  const collections = [
    "heroicons-solid",
    "heroicons-outline",
    "heroicons",
    "lucide",
    "mdi",
    "ph",
    "carbon",
    "tabler",
    "material-symbols",
  ];

  for (const collection of collections) {
    if (name.startsWith(`${collection}-`)) {
      return `${collection}:${name.slice(collection.length + 1)}`;
    }
  }

  // Default fallback - assume heroicons
  return `heroicons:${name}`;
});

const sizeClass = computed(() => {
  if (!props.size) return "";
  if (typeof props.size === "number") {
    return `w-${props.size} h-${props.size}`;
  }
  // Size presets
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
