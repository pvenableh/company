<script setup lang="ts">
/**
 * UButton - NuxtUI-compatible button wrapper for shadcn-vue Button
 */

import { computed } from "vue";
import { cn, convertIconName } from "@/lib/utils";

const props = withDefaults(
  defineProps<{
    type?: "button" | "submit" | "reset";
    color?: "primary" | "secondary" | "gray" | "white" | "red" | "green" | "blue" | "yellow" | "orange" | "purple" | "pink" | "destructive";
    variant?: "solid" | "soft" | "outline" | "ghost" | "link";
    size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xs";
    icon?: string;
    trailing?: boolean;
    trailingIcon?: string;
    leadingIcon?: string;
    loading?: boolean;
    disabled?: boolean;
    block?: boolean;
    square?: boolean;
    padded?: boolean;
    truncate?: boolean;
    to?: string;
    external?: boolean;
    target?: string;
    label?: string;
    class?: string;
    ui?: Record<string, string>;
  }>(),
  {
    type: "button",
    color: "primary",
    variant: "solid",
    size: "md",
    trailing: false,
    loading: false,
    disabled: false,
    block: false,
    square: false,
    padded: true,
    truncate: false,
  }
);

const emit = defineEmits<{
  (e: "click", event: MouseEvent): void;
}>();

// Map colors to tailwind classes
const colorClasses = computed(() => {
  const { color, variant } = props;

  // Primary color (turquoise)
  if (color === "primary") {
    if (variant === "solid") return "bg-primary text-primary-foreground hover:bg-primary/90";
    if (variant === "soft") return "bg-primary/10 text-primary hover:bg-primary/20";
    if (variant === "outline") return "border-primary text-primary hover:bg-primary/10";
    if (variant === "ghost") return "text-primary hover:bg-primary/10";
  }

  // Destructive/Red
  if (color === "red" || color === "destructive") {
    if (variant === "solid") return "bg-destructive text-destructive-foreground hover:bg-destructive/90";
    if (variant === "soft") return "bg-destructive/10 text-destructive hover:bg-destructive/20";
    if (variant === "outline") return "border-destructive text-destructive hover:bg-destructive/10";
    if (variant === "ghost") return "text-destructive hover:bg-destructive/10";
  }

  // Green/Success
  if (color === "green") {
    if (variant === "solid") return "bg-green-600 text-white hover:bg-green-700";
    if (variant === "soft") return "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400";
    if (variant === "outline") return "border-green-600 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20";
    if (variant === "ghost") return "text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20";
  }

  // Gray/Secondary
  if (color === "gray" || color === "secondary") {
    if (variant === "solid") return "bg-secondary text-secondary-foreground hover:bg-secondary/80";
    if (variant === "soft") return "bg-secondary/50 text-secondary-foreground hover:bg-secondary/70";
    if (variant === "outline") return "border-input bg-background hover:bg-accent hover:text-accent-foreground";
    if (variant === "ghost") return "hover:bg-accent hover:text-accent-foreground";
  }

  // White
  if (color === "white") {
    return "bg-white text-gray-900 hover:bg-gray-100 border border-gray-200";
  }

  // Default fallback
  return "";
});

// Size classes
const sizeClasses = computed(() => {
  const sizes: Record<string, string> = {
    "2xs": "h-6 px-2 text-xs",
    xs: "h-7 px-2.5 text-xs",
    sm: "h-8 px-3 text-sm",
    md: "h-9 px-4 text-sm",
    lg: "h-10 px-5 text-base",
    xl: "h-11 px-6 text-base",
  };
  return sizes[props.size] || sizes.md;
});

// Icon size classes
const iconSizeClasses = computed(() => {
  const sizes: Record<string, string> = {
    "2xs": "h-3 w-3",
    xs: "h-3.5 w-3.5",
    sm: "h-4 w-4",
    md: "h-4 w-4",
    lg: "h-5 w-5",
    xl: "h-5 w-5",
  };
  return sizes[props.size] || sizes.md;
});

const buttonClasses = computed(() => {
  return cn(
    // Base styles
    "inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium",
    "ring-offset-background transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    "disabled:pointer-events-none disabled:opacity-50",
    "uppercase", // Your brand style
    // Size
    props.square ? "" : sizeClasses.value,
    props.square && `aspect-square ${sizeClasses.value.split(" ")[0]}`,
    // Color
    colorClasses.value,
    // Block
    props.block && "w-full",
    // Truncate
    props.truncate && "truncate",
    // Custom classes
    props.class,
    // UI overrides
    props.ui?.base
  );
});

const leadingIconName = computed(() => {
  if (props.loading) return "lucide:loader-2";
  return convertIconName(props.leadingIcon || (!props.trailing ? props.icon : "") || "");
});

const trailingIconName = computed(() => {
  return convertIconName(props.trailingIcon || (props.trailing ? props.icon : "") || "");
});

const handleClick = (event: MouseEvent) => {
  if (!props.disabled && !props.loading) {
    emit("click", event);
  }
};
</script>

<template>
  <component
    :is="to ? (external ? 'a' : 'NuxtLink') : 'button'"
    :type="to ? undefined : type"
    :to="to && !external ? to : undefined"
    :href="to && external ? to : undefined"
    :target="target"
    :disabled="disabled || loading"
    :class="buttonClasses"
    @click="handleClick"
  >
    <!-- Leading Icon -->
    <Icon
      v-if="leadingIconName"
      :name="leadingIconName"
      :class="[iconSizeClasses, loading && 'animate-spin', $slots.default ? 'mr-2' : '']"
    />

    <!-- Content -->
    <slot>{{ label }}</slot>

    <!-- Trailing Icon -->
    <Icon
      v-if="trailingIconName && !loading"
      :name="trailingIconName"
      :class="[iconSizeClasses, $slots.default || label ? 'ml-2' : '']"
    />
  </component>
</template>
