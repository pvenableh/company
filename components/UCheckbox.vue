<script setup lang="ts">
/**
 * UCheckbox - NuxtUI-compatible checkbox wrapper for shadcn-vue Checkbox
 */

import { Checkbox } from '@/components/ui/checkbox'

const props = withDefaults(
  defineProps<{
    modelValue?: boolean
    disabled?: boolean
    name?: string
    label?: string
    color?: string
    class?: string
  }>(),
  {
    modelValue: false,
    disabled: false,
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
  <div class="flex items-center gap-2">
    <Checkbox
      :id="name"
      v-model:checked="checked"
      :disabled="disabled"
      :name="name"
      :class="props.class"
    />
    <label v-if="label" :for="name" class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
      {{ label }}
    </label>
  </div>
</template>
