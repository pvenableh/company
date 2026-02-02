<script setup lang="ts">
/**
 * UFormGroup - NuxtUI-compatible form group wrapper
 */

import { cn } from "@/lib/utils";

const props = withDefaults(
  defineProps<{
    label?: string;
    description?: string;
    help?: string;
    hint?: string;
    error?: string | boolean;
    required?: boolean;
    name?: string;
    size?: "xs" | "sm" | "md" | "lg" | "xl";
    class?: string;
    ui?: {
      base?: string;
      label?: string;
      description?: string;
      hint?: string;
      help?: string;
      error?: string;
      container?: string;
    };
  }>(),
  {
    size: "md",
    required: false,
  }
);

const labelSizeClasses = computed(() => {
  const sizes: Record<string, string> = {
    xs: "text-xs",
    sm: "text-xs",
    md: "text-sm",
    lg: "text-sm",
    xl: "text-base",
  };
  return sizes[props.size] || sizes.md;
});

const errorMessage = computed(() => {
  if (typeof props.error === "string") return props.error;
  return "";
});

const hasError = computed(() => !!props.error);
</script>

<template>
  <div :class="cn('space-y-2', props.ui?.base, props.class)">
    <!-- Label Row -->
    <div v-if="label || hint" class="flex justify-between items-center">
      <label
        v-if="label"
        :for="name"
        :class="cn(
          'font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
          labelSizeClasses,
          hasError && 'text-destructive',
          props.ui?.label
        )"
      >
        {{ label }}
        <span v-if="required" class="text-destructive">*</span>
      </label>
      <span
        v-if="hint"
        :class="cn('text-xs text-muted-foreground', props.ui?.hint)"
      >
        {{ hint }}
      </span>
    </div>

    <!-- Description -->
    <p
      v-if="description"
      :class="cn('text-sm text-muted-foreground', props.ui?.description)"
    >
      {{ description }}
    </p>

    <!-- Input Container -->
    <div :class="cn('', props.ui?.container)">
      <slot />
    </div>

    <!-- Help Text -->
    <p
      v-if="help && !hasError"
      :class="cn('text-sm text-muted-foreground', props.ui?.help)"
    >
      {{ help }}
    </p>

    <!-- Error Message -->
    <p
      v-if="hasError && errorMessage"
      :class="cn('text-sm text-destructive', props.ui?.error)"
    >
      {{ errorMessage }}
    </p>
  </div>
</template>
