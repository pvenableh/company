<script setup lang="ts">
/**
 * UForm - NuxtUI-compatible form wrapper
 *
 * Provides imperative validation via :validate + :state props,
 * distributing field errors to child UFormGroup components through
 * provide/inject.
 *
 * For new code, prefer shadcn-vue's Form (vee-validate) directly.
 */

interface FormError {
  path: string
  message: string
}

const props = defineProps<{
  validate?: (state: any) => Promise<FormError[]> | FormError[]
  state?: Record<string, any>
  class?: string
}>()

const emit = defineEmits<{
  (e: 'submit', event: Event): void
  (e: 'error', errors: FormError[]): void
}>()

// Shared error map provided to child UFormGroup components
const errors = ref<Record<string, string>>({})
provide('uform-errors', errors)

const handleSubmit = async (event: Event) => {
  event.preventDefault()

  // Run validation if provided
  if (props.validate && props.state) {
    const result = await props.validate(props.state)
    if (result && result.length > 0) {
      const errorMap: Record<string, string> = {}
      for (const err of result) {
        errorMap[err.path] = err.message
      }
      errors.value = errorMap
      emit('error', result)
      return
    }
  }

  // Clear errors and submit
  errors.value = {}
  emit('submit', event)
}
</script>

<template>
  <form :class="props.class" @submit="handleSubmit">
    <slot />
  </form>
</template>
