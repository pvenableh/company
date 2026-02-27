<script setup lang="ts">
/**
 * UToggle - NuxtUI-compatible toggle wrapper for shadcn-vue Switch
 */

import { Switch } from '@/components/ui/switch'

const props = withDefaults(
  defineProps<{
    modelValue?: boolean
    disabled?: boolean
    name?: string
    color?: string
    size?: 'xs' | 'sm' | 'md' | 'lg'
    class?: string
  }>(),
  {
    modelValue: false,
    disabled: false,
    size: 'md',
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'change', value: boolean): void
}>()

const checked = computed({
  get: () => props.modelValue,
  set: (value: boolean) => {
    emit('update:modelValue', value)
    emit('change', value)
  },
})
</script>

<template>
  <Switch
    v-model:checked="checked"
    :disabled="disabled"
    :name="name"
    :class="props.class"
  />
</template>
