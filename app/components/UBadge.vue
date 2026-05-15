<script setup lang="ts">
/**
 * UBadge - NuxtUI-compatible badge wrapper for shadcn-vue Badge
 */

import { cn } from "@/lib/utils";

const props = withDefaults(
  defineProps<{
    color?: "primary" | "gray" | "red" | "green" | "blue" | "yellow" | "orange" | "purple" | "pink" | "white" | "emerald" | "amber" | "teal" | "sky" | string;
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

// Color prop → palette-driven class strings. `tokenFor` + `fgFor` live
// in `~/utils/palette-tokens` (auto-imported by Nuxt) so badges and
// buttons share one alias table and one foreground rule. Adding a new
// colour alias is one line in palette-tokens.ts.
const colorClasses = computed(() => {
  const { color } = props;
  // "subtle" → "soft" (legacy alias from the NuxtUI API).
  const variant = props.variant === 'subtle' ? 'soft' : props.variant;

  const token = tokenFor(color);
  if (token) {
    if (variant === "solid") return `bg-${token} ${fgFor(token)}`;
    if (variant === "soft") return `bg-${token}/10 text-${token}`;
    if (variant === "outline") return `border border-${token} text-${token} bg-transparent`;
    return "";
  }

  // Foundation neutrals — palette-independent on purpose.
  if (color === "gray") {
    if (variant === "solid") return "bg-muted-foreground text-white";
    if (variant === "soft") return "bg-muted text-muted-foreground";
    if (variant === "outline") return "border border-input text-muted-foreground bg-transparent";
  }
  if (color === "white") {
    if (variant === "solid") return "bg-white text-gray-900 border border-gray-200";
    if (variant === "soft") return "bg-white/80 text-gray-900";
    if (variant === "outline") return "border border-white text-white";
  }

  return "bg-muted text-muted-foreground";
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
