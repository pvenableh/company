<script setup lang="ts">
/**
 * USelectMenu - NuxtUI-compatible select wrapper using shadcn-vue Select
 *
 * Maps NuxtUI's USelectMenu API (v-model, :options, option-attribute,
 * value-attribute, searchable, placeholder) onto shadcn-vue's
 * Select / SelectTrigger / SelectValue / SelectContent / SelectItem.
 *
 * shadcn-vue Select only accepts string values, so we serialise option
 * values to strings and resolve them back on change.
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    modelValue?: any
    options?: any[]
    placeholder?: string
    searchable?: boolean
    disabled?: boolean
    multiple?: boolean
    optionAttribute?: string
    valueAttribute?: string
    size?: 'xs' | 'sm' | 'md' | 'lg'
    color?: string
    variant?: string
    class?: string
    ui?: Record<string, string>
  }>(),
  {
    options: () => [],
    optionAttribute: 'label',
    size: 'sm',
    searchable: false,
    disabled: false,
    multiple: false,
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: any): void
  (e: 'change', value: any): void
}>()

// ── Helpers ──────────────────────────────────────────────────────────────

function getOptionLabel(option: any): string {
  if (typeof option === 'string') return option
  return option?.[props.optionAttribute] || option?.label || option?.name || String(option)
}

function getOptionValue(option: any): any {
  if (typeof option === 'string') return option
  if (props.valueAttribute) return option?.[props.valueAttribute]
  return option
}

/**
 * Convert any option value to a string key for shadcn-vue Select
 */
function toStringKey(option: any, index: number): string {
  const val = getOptionValue(option)
  if (val == null) return `__null_${index}`
  if (typeof val === 'string') return val
  if (typeof val === 'number') return String(val)
  // Object value – use index as key
  return `__idx_${index}`
}

/**
 * Resolve a string key back to the original value
 */
function fromStringKey(key: string): any {
  if (key.startsWith('__null_')) return null
  if (key.startsWith('__idx_')) {
    const idx = parseInt(key.replace('__idx_', ''), 10)
    const option = props.options[idx]
    return props.valueAttribute ? getOptionValue(option) : option
  }
  // Direct string or numeric value – check if it matches a valueAttribute
  const found = props.options.find((o: any, i: number) => toStringKey(o, i) === key)
  if (found) return props.valueAttribute ? getOptionValue(found) : found
  return key
}

// ── Computed selected key for shadcn-vue Select ─────────────────────────

const selectedKey = computed(() => {
  if (props.modelValue == null) return undefined
  // Find the matching option
  for (let i = 0; i < props.options.length; i++) {
    const optVal = getOptionValue(props.options[i])
    if (props.modelValue === optVal) return toStringKey(props.options[i], i)
    if (
      typeof props.modelValue === 'object' &&
      typeof optVal === 'object' &&
      props.valueAttribute &&
      props.modelValue?.[props.valueAttribute] === optVal
    ) {
      return toStringKey(props.options[i], i)
    }
  }
  // Fallback: if modelValue is a string itself, use it
  if (typeof props.modelValue === 'string') return props.modelValue
  if (typeof props.modelValue === 'number') return String(props.modelValue)
  return undefined
})

function onValueChange(key: string) {
  const resolved = fromStringKey(key)
  emit('update:modelValue', resolved)
  emit('change', resolved)
}

// ── Search filter (for searchable mode) ─────────────────────────────────

const searchQuery = ref('')

const filteredOptions = computed(() => {
  if (!props.searchable || !searchQuery.value) return props.options
  const q = searchQuery.value.toLowerCase()
  return props.options.filter((o: any) => getOptionLabel(o).toLowerCase().includes(q))
})

const sizeMap: Record<string, 'sm' | 'default'> = {
  xs: 'sm',
  sm: 'sm',
  md: 'default',
  lg: 'default',
}
</script>

<template>
  <Select
    :model-value="selectedKey"
    :disabled="disabled"
    @update:model-value="onValueChange"
  >
    <SelectTrigger :size="sizeMap[size] || 'default'" :class="cn(props.class, props.ui?.base)">
      <slot name="label">
        <SelectValue :placeholder="placeholder || 'Select...'" />
      </slot>
    </SelectTrigger>

    <SelectContent>
      <!-- Optional inline search -->
      <div v-if="searchable" class="px-2 pb-1 pt-1">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search..."
          class="w-full rounded-sm border border-input bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
          @keydown.stop
        />
      </div>

      <SelectItem
        v-for="(option, idx) in filteredOptions"
        :key="toStringKey(option, idx)"
        :value="toStringKey(option, idx)"
      >
        {{ getOptionLabel(option) }}
      </SelectItem>

      <div
        v-if="searchable && filteredOptions.length === 0"
        class="px-2 py-1.5 text-center text-sm text-muted-foreground"
      >
        No results found
      </div>
    </SelectContent>
  </Select>
</template>
