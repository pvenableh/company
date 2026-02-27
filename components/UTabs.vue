<script setup lang="ts">
/**
 * UTabs - NuxtUI-compatible tabs wrapper for shadcn-vue Tabs
 */

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

interface TabItem {
  key?: string
  label: string
  icon?: string
  disabled?: boolean
  slot?: string
  [key: string]: any
}

const props = withDefaults(
  defineProps<{
    modelValue?: string | number
    items?: TabItem[]
    orientation?: 'horizontal' | 'vertical'
    class?: string
    ui?: Record<string, string>
  }>(),
  {
    items: () => [],
    orientation: 'horizontal',
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | number): void
  (e: 'change', index: number): void
}>()

const activeTab = computed({
  get: () => {
    if (props.modelValue != null) return String(props.modelValue)
    if (props.items.length > 0) return props.items[0].key || '0'
    return '0'
  },
  set: (value: string) => {
    // Try to emit as number if it was originally a number
    const idx = props.items.findIndex((item, i) => (item.key || String(i)) === value)
    if (typeof props.modelValue === 'number') {
      emit('update:modelValue', idx >= 0 ? idx : parseInt(value) || 0)
    } else {
      emit('update:modelValue', value)
    }
    if (idx >= 0) emit('change', idx)
  },
})

const tabItems = computed(() =>
  props.items.map((item, index) => ({
    ...item,
    key: item.key || String(index),
  }))
)
</script>

<template>
  <Tabs v-model="activeTab" :class="cn(props.class)" :orientation="orientation">
    <TabsList :class="cn(orientation === 'vertical' ? 'flex-col h-auto' : '', props.ui?.list)">
      <TabsTrigger
        v-for="item in tabItems"
        :key="item.key"
        :value="item.key!"
        :disabled="item.disabled"
        :class="props.ui?.trigger"
      >
        <UIcon v-if="item.icon" :name="item.icon" class="mr-2 h-4 w-4" />
        {{ item.label }}
      </TabsTrigger>
    </TabsList>

    <template v-for="item in tabItems" :key="item.key">
      <TabsContent :value="item.key!" :class="props.ui?.content">
        <slot :name="item.slot || item.key" :item="item">
          <slot name="item" :item="item" />
        </slot>
      </TabsContent>
    </template>
  </Tabs>
</template>
