<script setup lang="ts">
/**
 * UFormGroup - NuxtUI-compatible form group using shadcn-vue primitives
 *
 * Wraps a form field with label, description, hint, help text, and
 * error message display. Integrates with parent UForm's error injection.
 *
 * Uses shadcn-vue's Label component for styling consistency.
 */

import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'

const props = withDefaults(
  defineProps<{
    label?: string
    description?: string
    help?: string
    hint?: string
    error?: string | boolean
    required?: boolean
    name?: string
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
    class?: string
    ui?: {
      base?: string
      label?: string
      description?: string
      hint?: string
      help?: string
      error?: string
      container?: string
    }
  }>(),
  {
    size: 'md',
    required: false,
  }
)

// Consume errors from parent UForm (if present)
const formErrors = inject<Ref<Record<string, string>>>('uform-errors', ref({}))

const resolvedError = computed(() => {
  // Explicit error prop takes precedence
  if (props.error) {
    return typeof props.error === 'string' ? props.error : ''
  }
  // Then check parent form errors by name
  if (props.name && formErrors.value[props.name]) {
    return formErrors.value[props.name]
  }
  return ''
})

const hasError = computed(() => !!props.error || !!(props.name && formErrors.value[props.name]))

const labelSizeClasses = computed(() => {
  const sizes: Record<string, string> = {
    xs: 'text-xs',
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-sm',
    xl: 'text-base',
  }
  return sizes[props.size] || sizes.md
})
</script>

<template>
  <div :class="cn('grid gap-2', props.ui?.base, props.class)">
    <!-- Label Row -->
    <div v-if="label || hint || $slots.hint" class="flex justify-between items-center">
      <Label
        v-if="label"
        :for="name"
        :data-error="hasError || undefined"
        :class="cn(
          labelSizeClasses,
          hasError && 'text-destructive',
          props.ui?.label
        )"
      >
        {{ label }}
        <span v-if="required" class="text-destructive">*</span>
      </Label>
      <span :class="cn('text-xs text-muted-foreground', props.ui?.hint)">
        <slot name="hint">{{ hint }}</slot>
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
    <div :class="props.ui?.container">
      <slot />
    </div>

    <!-- Help Text -->
    <p
      v-if="help && !hasError"
      :class="cn('text-sm text-muted-foreground', props.ui?.help)"
    >
      {{ help }}
    </p>

    <!-- Hint slot (for additional content below input) -->
    <slot name="hint" />

    <!-- Error message from parent UForm or explicit prop -->
    <p
      v-if="hasError && resolvedError"
      :class="cn('text-sm text-destructive', props.ui?.error)"
    >
      <slot name="error" :error="resolvedError">
        {{ resolvedError }}
      </slot>
    </p>
  </div>
</template>
