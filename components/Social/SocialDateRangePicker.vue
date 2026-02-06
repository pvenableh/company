<script setup lang="ts">
/**
 * Social Date Range Picker Component
 *
 * Allows selecting a date range with presets
 * Uses reka-ui RangeCalendar with shadcn-vue styling
 */

import { CalendarDate, getLocalTimeZone, today } from '@internationalized/date'
import {
  RangeCalendarRoot,
  RangeCalendarHeader,
  RangeCalendarHeading,
  RangeCalendarGrid,
  RangeCalendarGridHead,
  RangeCalendarGridBody,
  RangeCalendarGridRow,
  RangeCalendarHeadCell,
  RangeCalendarCell,
  RangeCalendarCellTrigger,
  RangeCalendarPrev,
  RangeCalendarNext,
} from 'reka-ui'
import { format, subDays, subWeeks, subMonths, startOfDay, endOfDay } from 'date-fns'

interface DateRange {
  start: Date
  end: Date
}

const props = defineProps<{
  modelValue: DateRange
}>()

const emit = defineEmits<{
  'update:modelValue': [range: DateRange]
}>()

const isOpen = ref(false)

// Presets
const presets = [
  { label: 'Last 7 days', getValue: () => ({ start: subDays(new Date(), 7), end: new Date() }) },
  { label: 'Last 14 days', getValue: () => ({ start: subDays(new Date(), 14), end: new Date() }) },
  { label: 'Last 30 days', getValue: () => ({ start: subDays(new Date(), 30), end: new Date() }) },
  { label: 'Last 3 months', getValue: () => ({ start: subMonths(new Date(), 3), end: new Date() }) },
  { label: 'Last 6 months', getValue: () => ({ start: subMonths(new Date(), 6), end: new Date() }) },
]

// Convert to CalendarDate for reka-ui
const calendarValue = computed({
  get: () => {
    return {
      start: new CalendarDate(
        props.modelValue.start.getFullYear(),
        props.modelValue.start.getMonth() + 1,
        props.modelValue.start.getDate()
      ),
      end: new CalendarDate(
        props.modelValue.end.getFullYear(),
        props.modelValue.end.getMonth() + 1,
        props.modelValue.end.getDate()
      ),
    }
  },
  set: (val: { start: CalendarDate; end: CalendarDate }) => {
    emit('update:modelValue', {
      start: startOfDay(new Date(val.start.year, val.start.month - 1, val.start.day)),
      end: endOfDay(new Date(val.end.year, val.end.month - 1, val.end.day)),
    })
  },
})

function applyPreset(preset: (typeof presets)[0]) {
  const range = preset.getValue()
  emit('update:modelValue', {
    start: startOfDay(range.start),
    end: endOfDay(range.end),
  })
  isOpen.value = false
}

const formattedRange = computed(() => {
  return `${format(props.modelValue.start, 'MMM d')} - ${format(props.modelValue.end, 'MMM d, yyyy')}`
})
</script>

<template>
  <UPopover v-model:open="isOpen">
    <UButton variant="outline" class="justify-start text-left font-normal min-w-[220px]">
      <UIcon name="i-lucide-calendar-range" class="mr-2 h-4 w-4" />
      {{ formattedRange }}
      <UIcon name="i-lucide-chevron-down" class="ml-auto h-4 w-4 opacity-50" />
    </UButton>

    <template #panel>
      <div class="flex">
        <!-- Presets -->
        <div class="border-r border-gray-200 dark:border-gray-700 p-2 space-y-1">
          <button
            v-for="preset in presets"
            :key="preset.label"
            class="block w-full text-left px-3 py-1.5 text-sm rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            @click="applyPreset(preset)"
          >
            {{ preset.label }}
          </button>
        </div>

        <!-- Calendar -->
        <div class="p-3">
          <RangeCalendarRoot
            v-model="calendarValue"
            :number-of-months="2"
            class="rounded-md"
          >
            <RangeCalendarHeader class="flex items-center justify-between px-2 py-2">
              <RangeCalendarPrev
                class="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
              >
                <UIcon name="i-lucide-chevron-left" class="h-4 w-4" />
              </RangeCalendarPrev>
              <RangeCalendarHeading class="text-sm font-medium" />
              <RangeCalendarNext
                class="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
              >
                <UIcon name="i-lucide-chevron-right" class="h-4 w-4" />
              </RangeCalendarNext>
            </RangeCalendarHeader>

            <div class="flex gap-4">
              <RangeCalendarGrid class="w-full border-collapse space-y-1">
                <RangeCalendarGridHead>
                  <RangeCalendarGridRow class="flex">
                    <RangeCalendarHeadCell
                      v-for="day in ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']"
                      :key="day"
                      class="text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]"
                    >
                      {{ day }}
                    </RangeCalendarHeadCell>
                  </RangeCalendarGridRow>
                </RangeCalendarGridHead>

                <RangeCalendarGridBody />
              </RangeCalendarGrid>
            </div>
          </RangeCalendarRoot>
        </div>
      </div>
    </template>
  </UPopover>
</template>
