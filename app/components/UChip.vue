<script setup lang="ts">
/**
 * UChip - NuxtUI-compatible chip/indicator wrapper
 *
 * Renders a small badge/count indicator relative to its slot content.
 *
 * Usage:
 *   <UChip :text="5" size="sm">
 *     <UIcon name="i-heroicons-bell" />
 *   </UChip>
 */

import { cn } from "@/lib/utils";

const props = withDefaults(
  defineProps<{
    text?: string | number;
    color?: "primary" | "red" | "green" | "blue" | "gray" | "amber" | "emerald" | string;
    size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
    position?: "top-right" | "top-left" | "bottom-right" | "bottom-left";
    show?: boolean;
    class?: string;
  }>(),
  {
    color: "primary",
    size: "sm",
    position: "top-right",
    show: true,
  }
);

const sizeClasses = computed(() => {
  if (props.text != null) {
    const sizes: Record<string, string> = {
      xs: "min-w-3.5 h-3.5 text-[8px] px-0.5",
      sm: "min-w-4 h-4 text-[9px] px-1",
      md: "min-w-5 h-5 text-[10px] px-1",
      lg: "min-w-5 h-5 text-xs px-1.5",
      xl: "min-w-6 h-6 text-xs px-1.5",
      "2xl": "min-w-6 h-6 text-sm px-1.5",
    };
    return sizes[props.size] || sizes.sm;
  }
  // Dot indicator (no text)
  const dots: Record<string, string> = {
    xs: "w-1.5 h-1.5",
    sm: "w-2 h-2",
    md: "w-2.5 h-2.5",
    lg: "w-3 h-3",
    xl: "w-3.5 h-3.5",
    "2xl": "w-4 h-4",
  };
  return dots[props.size] || dots.sm;
});

const colorClasses = computed(() => {
  const colors: Record<string, string> = {
    primary: "bg-primary text-primary-foreground",
    red: "bg-red-500 text-white",
    green: "bg-emerald-500 text-white",
    blue: "bg-blue-500 text-white",
    gray: "bg-gray-500 text-white",
    amber: "bg-amber-500 text-white",
    emerald: "bg-emerald-500 text-white",
  };
  return colors[props.color] || colors.primary;
});

const positionClasses = computed(() => {
  const positions: Record<string, string> = {
    "top-right": "-top-1 -right-1",
    "top-left": "-top-1 -left-1",
    "bottom-right": "-bottom-1 -right-1",
    "bottom-left": "-bottom-1 -left-1",
  };
  return positions[props.position] || positions["top-right"];
});
</script>

<template>
  <span class="relative inline-flex">
    <slot />
    <span
      v-if="show"
      :class="
        cn(
          'absolute inline-flex items-center justify-center rounded-full font-medium leading-none',
          sizeClasses,
          colorClasses,
          positionClasses,
          $props.class
        )
      "
    >
      {{ text }}
    </span>
  </span>
</template>
