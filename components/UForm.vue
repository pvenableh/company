<script setup lang="ts">
/**
 * UForm - NuxtUI-compatible form wrapper
 * Provides a basic form element with validation callback support
 */

const props = defineProps<{
  validate?: (state: any) => Promise<{ path: string; message: string }[]> | { path: string; message: string }[]
  state?: Record<string, any>
  class?: string
}>()

const emit = defineEmits<{
  (e: 'submit', event: Event): void
}>()

const handleSubmit = async (event: Event) => {
  event.preventDefault()
  emit('submit', event)
}
</script>

<template>
  <form :class="props.class" @submit="handleSubmit">
    <slot />
  </form>
</template>
