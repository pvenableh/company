<script setup lang="ts">
/**
 * UTabs - NuxtUI-compatible tabs wrapper for shadcn-vue Tabs
 * Features a floating animated pill indicator for the active tab.
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

const internalValue = ref<string>('')

const activeTab = computed({
  get: () => {
    if (props.modelValue != null) return String(props.modelValue)
    if (internalValue.value) return internalValue.value
    if (props.items.length > 0) return props.items[0].key || '0'
    return '0'
  },
  set: (value: string) => {
    internalValue.value = value
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

// Custom compact styling applied via class overrides (keeps ui/tabs pristine)
const listClass = computed(() =>
  cn('relative !rounded-full !p-0.5 !gap-0.5', props.ui?.list)
)

const triggerClass = computed(() =>
  cn('relative z-10 !rounded-full !px-3 !py-1.5 !text-[10px] !gap-1.5 data-[state=active]:!bg-transparent data-[state=active]:!shadow-none', props.ui?.trigger)
)

// Floating pill indicator
const tabsListRef = ref<HTMLElement | null>(null)
const pillStyle = ref({ left: '0px', width: '0px', opacity: '0' })

function updatePill() {
  const el = tabsListRef.value?.$el || tabsListRef.value
  if (!el) return

  const activeTrigger = el.querySelector('[data-state="active"]') as HTMLElement
  if (!activeTrigger) {
    pillStyle.value = { ...pillStyle.value, opacity: '0' }
    return
  }

  const listRect = el.getBoundingClientRect()
  const triggerRect = activeTrigger.getBoundingClientRect()

  pillStyle.value = {
    left: `${triggerRect.left - listRect.left}px`,
    width: `${triggerRect.width}px`,
    opacity: '1',
  }
}

watch(activeTab, () => {
  nextTick(updatePill)
})

onMounted(() => {
  nextTick(() => setTimeout(updatePill, 50))
})

if (import.meta.client) {
  const ro = new ResizeObserver(() => updatePill())
  onMounted(() => {
    const el = tabsListRef.value?.$el || tabsListRef.value
    if (el) ro.observe(el)
  })
  onUnmounted(() => ro.disconnect())
}
</script>

<template>
  <Tabs v-model="activeTab" :class="cn(props.class)" :orientation="orientation">
    <div :class="cn(orientation !== 'vertical' ? 'overflow-x-auto -mx-1 px-1 scrollbar-hide' : '')">
    <TabsList ref="tabsListRef" :class="listClass">
      <!-- Floating pill indicator -->
      <div
        class="absolute top-0.5 h-[calc(100%-4px)] rounded-full bg-card shadow-sm border border-border/50 transition-all duration-300 ease-out pointer-events-none"
        :style="pillStyle"
      />
      <TabsTrigger
        v-for="item in tabItems"
        :key="item.key"
        :value="item.key!"
        :disabled="item.disabled"
        :class="triggerClass"
      >
        <UIcon v-if="item.icon" :name="item.icon" class="mr-1 h-3.5 w-3.5" />
        {{ item.label }}
      </TabsTrigger>
    </TabsList>
    </div>

    <template v-for="item in tabItems" :key="item.key">
      <TabsContent :value="item.key!" :class="props.ui?.content">
        <slot :name="item.slot || item.key" :item="item">
          <slot name="item" :item="item" />
        </slot>
      </TabsContent>
    </template>
  </Tabs>
</template>
