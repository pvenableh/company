<script setup lang="ts">
/**
 * USelectMenu - NuxtUI-compatible select menu wrapper
 * Uses native <select> with shadcn-vue styling for broad compatibility
 */

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

const searchQuery = ref('')
const isOpen = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)

function getOptionLabel(option: any): string {
  if (typeof option === 'string') return option
  return option?.[props.optionAttribute] || option?.label || option?.name || String(option)
}

function getOptionValue(option: any): any {
  if (typeof option === 'string') return option
  if (props.valueAttribute) return option?.[props.valueAttribute]
  return option
}

function isSelected(option: any): boolean {
  const optionValue = getOptionValue(option)
  if (props.modelValue == null) return false
  if (typeof props.modelValue === 'object' && props.valueAttribute) {
    return props.modelValue[props.valueAttribute] === optionValue
  }
  return props.modelValue === optionValue
}

const selectedLabel = computed(() => {
  if (props.modelValue == null) return ''
  if (typeof props.modelValue === 'string') {
    const found = props.options.find((o: any) => getOptionValue(o) === props.modelValue)
    return found ? getOptionLabel(found) : props.modelValue
  }
  if (typeof props.modelValue === 'object') {
    return getOptionLabel(props.modelValue)
  }
  const found = props.options.find((o: any) => getOptionValue(o) === props.modelValue)
  return found ? getOptionLabel(found) : String(props.modelValue)
})

const filteredOptions = computed(() => {
  if (!props.searchable || !searchQuery.value) return props.options
  const q = searchQuery.value.toLowerCase()
  return props.options.filter((o: any) => getOptionLabel(o).toLowerCase().includes(q))
})

function selectOption(option: any) {
  const value = props.valueAttribute ? getOptionValue(option) : option
  emit('update:modelValue', value)
  emit('change', value)
  isOpen.value = false
  searchQuery.value = ''
}

const sizeClasses = computed(() => {
  const sizes: Record<string, string> = {
    xs: 'h-7 text-xs px-2',
    sm: 'h-8 text-xs px-2.5',
    md: 'h-9 text-sm px-3',
    lg: 'h-10 text-sm px-3.5',
  }
  return sizes[props.size] || sizes.sm
})

// Close on click outside
function onClickOutside(event: Event) {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    isOpen.value = false
    searchQuery.value = ''
  }
}

onMounted(() => {
  document.addEventListener('click', onClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', onClickOutside)
})
</script>

<template>
  <div ref="dropdownRef" :class="cn('relative inline-block', props.class)">
    <button
      type="button"
      :disabled="disabled"
      :class="cn(
        'flex w-full items-center justify-between rounded-md border border-input bg-background',
        'ring-offset-background placeholder:text-muted-foreground',
        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        sizeClasses,
        props.ui?.base
      )"
      @click="isOpen = !isOpen"
    >
      <slot name="label">
        <span :class="selectedLabel ? '' : 'text-muted-foreground'">
          {{ selectedLabel || placeholder || 'Select...' }}
        </span>
      </slot>
      <Icon name="lucide:chevron-down" class="ml-2 h-4 w-4 shrink-0 opacity-50" />
    </button>

    <Transition
      enter-active-class="transition duration-100 ease-out"
      leave-active-class="transition duration-75 ease-in"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="isOpen"
        class="absolute z-50 mt-1 w-full min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
      >
        <div v-if="searchable" class="p-1">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search..."
            class="w-full rounded-sm border-0 bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
            @click.stop
          />
        </div>
        <div class="max-h-60 overflow-y-auto p-1">
          <button
            v-for="(option, idx) in filteredOptions"
            :key="idx"
            type="button"
            :class="cn(
              'relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none',
              'hover:bg-accent hover:text-accent-foreground',
              isSelected(option) && 'bg-accent text-accent-foreground'
            )"
            @click.stop="selectOption(option)"
          >
            <Icon v-if="isSelected(option)" name="lucide:check" class="mr-2 h-4 w-4" />
            <span :class="isSelected(option) ? '' : 'ml-6'">{{ getOptionLabel(option) }}</span>
          </button>
          <div v-if="filteredOptions.length === 0" class="px-2 py-1.5 text-sm text-muted-foreground">
            No results found
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
