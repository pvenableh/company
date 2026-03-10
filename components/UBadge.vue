<script setup lang="ts">
/**
 * UBadge - NuxtUI-compatible badge wrapper for shadcn-vue Badge
 */

import { cn } from "@/lib/utils";

const props = withDefaults(
  defineProps<{
    color?: "primary" | "gray" | "red" | "green" | "blue" | "yellow" | "orange" | "purple" | "pink" | "white" | "emerald" | "amber" | string;
    variant?: "solid" | "soft" | "subtle" | "outline";
    size?: "xs" | "sm" | "md" | "lg";
    label?: string;
    class?: string;
    ui?: Record<string, string>;
  }>(),
  {
    color: "primary",
    variant: "soft",
    size: "sm",
  }
);

const sizeClasses = computed(() => {
  const sizes: Record<string, string> = {
    xs: "text-xs px-1.5 py-0.5",
    sm: "text-xs px-2 py-0.5",
    md: "text-sm px-2.5 py-0.5",
    lg: "text-sm px-3 py-1",
  };
  return sizes[props.size] || sizes.sm;
});

const colorClasses = computed(() => {
  const { color } = props;
  // Map "subtle" to "soft"
  const variant = props.variant === 'subtle' ? 'soft' : props.variant;

  // Color mapping
  const colorMap: Record<string, Record<string, string>> = {
    primary: {
      solid: "bg-primary text-primary-foreground",
      soft: "bg-primary/10 text-primary",
      outline: "border border-primary text-primary bg-transparent",
    },
    gray: {
      solid: "bg-gray-500 text-white",
      soft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
      outline: "border border-gray-300 text-gray-700 dark:border-gray-600 dark:text-gray-300",
    },
    red: {
      solid: "bg-red-500 text-white",
      soft: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
      outline: "border border-red-500 text-red-600",
    },
    green: {
      solid: "bg-green-500 text-white",
      soft: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
      outline: "border border-green-500 text-green-600",
    },
    blue: {
      solid: "bg-blue-500 text-white",
      soft: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
      outline: "border border-blue-500 text-blue-600",
    },
    yellow: {
      solid: "bg-yellow-500 text-white",
      soft: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
      outline: "border border-yellow-500 text-yellow-600",
    },
    orange: {
      solid: "bg-orange-500 text-white",
      soft: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
      outline: "border border-orange-500 text-orange-600",
    },
    purple: {
      solid: "bg-purple-500 text-white",
      soft: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
      outline: "border border-purple-500 text-purple-600",
    },
    pink: {
      solid: "bg-pink-500 text-white",
      soft: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
      outline: "border border-pink-500 text-pink-600",
    },
    white: {
      solid: "bg-white text-gray-900 border border-gray-200",
      soft: "bg-white/80 text-gray-900",
      outline: "border border-white text-white",
    },
    emerald: {
      solid: "bg-emerald-500 text-white",
      soft: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
      outline: "border border-emerald-500 text-emerald-600",
    },
    amber: {
      solid: "bg-amber-500 text-white",
      soft: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
      outline: "border border-amber-500 text-amber-600",
    },
  };

  return colorMap[color]?.[variant] || colorMap.gray.soft;
});

const badgeClasses = computed(() =>
  cn(
    "inline-flex items-center rounded-full font-medium",
    sizeClasses.value,
    colorClasses.value,
    props.ui?.base,
    props.class
  )
);
</script>

<template>
  <span :class="badgeClasses">
    <slot>{{ label }}</slot>
  </span>
</template>
