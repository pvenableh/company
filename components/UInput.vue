<script setup lang="ts">
/**
 * UInput - NuxtUI-compatible input wrapper for shadcn-vue Input
 */

import { cn, convertIconName } from "@/lib/utils";

const props = withDefaults(
  defineProps<{
    modelValue?: string | number;
    type?: string;
    placeholder?: string;
    disabled?: boolean;
    readonly?: boolean;
    required?: boolean;
    autofocus?: boolean;
    autocomplete?: string;
    name?: string;
    id?: string;
    size?: "xs" | "sm" | "md" | "lg" | "xl";
    color?: "primary" | "gray" | "red" | "green" | "emerald" | "amber" | string;
    variant?: "outline" | "none" | "subtle";
    icon?: string;
    leadingIcon?: string;
    trailingIcon?: string;
    loading?: boolean;
    padded?: boolean;
    class?: string;
    inputClass?: string;
    ui?: Record<string, string>;
  }>(),
  {
    type: "text",
    size: "md",
    color: "primary",
    variant: "outline",
    padded: true,
  }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "focus", event: FocusEvent): void;
  (e: "blur", event: FocusEvent): void;
  (e: "change", event: Event): void;
  (e: "input", event: Event): void;
}>();

const model = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", String(value)),
});

const sizeClasses = computed(() => {
  const sizes: Record<string, string> = {
    xs: "h-7 text-xs px-2",
    sm: "h-8 text-sm px-2.5",
    md: "h-9 text-sm px-3",
    lg: "h-10 text-base px-3.5",
    xl: "h-11 text-base px-4",
  };
  return sizes[props.size] || sizes.md;
});

const iconSizeClasses = computed(() => {
  const sizes: Record<string, string> = {
    xs: "h-3.5 w-3.5",
    sm: "h-4 w-4",
    md: "h-4 w-4",
    lg: "h-5 w-5",
    xl: "h-5 w-5",
  };
  return sizes[props.size] || sizes.md;
});

const hasLeadingIcon = computed(() => props.leadingIcon || props.icon);
const hasTrailingIcon = computed(() => props.trailingIcon || props.loading);

const inputClasses = computed(() =>
  cn(
    "flex w-full rounded-md border border-input bg-background text-foreground",
    "ring-offset-background placeholder:text-muted-foreground",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    "disabled:cursor-not-allowed disabled:opacity-50",
    sizeClasses.value,
    hasLeadingIcon.value && "pl-9",
    hasTrailingIcon.value && "pr-9",
    props.variant === "none" && "border-0 focus-visible:ring-0 focus-visible:ring-offset-0",
    props.inputClass,
    props.ui?.base
  )
);

const leadingIconName = computed(() => convertIconName(props.leadingIcon || props.icon || ""));
const trailingIconName = computed(() => {
  if (props.loading) return "lucide:loader-2";
  return convertIconName(props.trailingIcon || "");
});
</script>

<template>
  <div :class="cn('relative w-full', props.class)">
    <!-- Leading Icon -->
    <div
      v-if="hasLeadingIcon"
      class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3"
    >
      <Icon
        :name="leadingIconName"
        :class="cn(iconSizeClasses, 'text-muted-foreground')"
      />
    </div>

    <input
      v-model="model"
      :type="type"
      :placeholder="placeholder"
      :disabled="disabled"
      :readonly="readonly"
      :required="required"
      :autofocus="autofocus"
      :autocomplete="autocomplete"
      :name="name"
      :id="id"
      :class="inputClasses"
      @focus="emit('focus', $event)"
      @blur="emit('blur', $event)"
      @change="emit('change', $event)"
      @input="emit('input', $event)"
    />

    <!-- Trailing Icon -->
    <div
      v-if="hasTrailingIcon"
      class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3"
    >
      <Icon
        :name="trailingIconName"
        :class="cn(iconSizeClasses, 'text-muted-foreground', loading && 'animate-spin')"
      />
    </div>
  </div>
</template>
