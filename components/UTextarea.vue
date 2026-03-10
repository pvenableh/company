<script setup lang="ts">
/**
 * UTextarea - NuxtUI-compatible textarea wrapper for shadcn-vue
 */

import { cn } from "@/lib/utils";

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    placeholder?: string;
    disabled?: boolean;
    readonly?: boolean;
    required?: boolean;
    autofocus?: boolean;
    name?: string;
    id?: string;
    rows?: number | string;
    maxlength?: number;
    autoresize?: boolean;
    size?: "xs" | "sm" | "md" | "lg" | "xl";
    color?: "primary" | "gray" | "red" | "green" | "emerald" | "amber" | string;
    variant?: "outline" | "none" | "subtle";
    padded?: boolean;
    class?: string;
    ui?: Record<string, string>;
  }>(),
  {
    rows: 3,
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
  set: (value) => emit("update:modelValue", String(value ?? "")),
});

const textareaRef = ref<HTMLTextAreaElement | null>(null);

const sizeClasses = computed(() => {
  const sizes: Record<string, string> = {
    xs: "text-xs px-2 py-1.5",
    sm: "text-sm px-2.5 py-2",
    md: "text-sm px-3 py-2",
    lg: "text-base px-3.5 py-2.5",
    xl: "text-base px-4 py-3",
  };
  return sizes[props.size] || sizes.md;
});

const textareaClasses = computed(() =>
  cn(
    "flex w-full rounded-md border border-input bg-background text-foreground",
    "ring-offset-background placeholder:text-muted-foreground",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "resize-y",
    sizeClasses.value,
    props.variant === "none" && "border-0 focus-visible:ring-0 focus-visible:ring-offset-0",
    props.autoresize && "resize-none overflow-hidden",
    props.class,
    props.ui?.base
  )
);

function autoResize() {
  if (!props.autoresize || !textareaRef.value) return;
  const el = textareaRef.value;
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

function handleInput(event: Event) {
  emit("input", event);
  nextTick(autoResize);
}

onMounted(() => {
  nextTick(autoResize);
});
</script>

<template>
  <textarea
    ref="textareaRef"
    v-model="model"
    :placeholder="placeholder"
    :disabled="disabled"
    :readonly="readonly"
    :required="required"
    :autofocus="autofocus"
    :name="name"
    :id="id"
    :rows="Number(rows)"
    :maxlength="maxlength"
    :class="textareaClasses"
    @focus="emit('focus', $event)"
    @blur="emit('blur', $event)"
    @change="emit('change', $event)"
    @input="handleInput"
  />
</template>
