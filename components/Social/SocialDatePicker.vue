<script setup lang="ts">
/**
 * Social Date Picker Component
 * 
 * Uses reka-ui Calendar with shadcn-vue styling
 * Based on your existing shadcn-nuxt setup
 */

import { CalendarDate, getLocalTimeZone, today, parseDate } from '@internationalized/date'
import {
  CalendarRoot,
  CalendarHeader,
  CalendarHeading,
  CalendarGrid,
  CalendarGridHead,
  CalendarGridBody,
  CalendarGridRow,
  CalendarHeadCell,
  CalendarCell,
  CalendarCellTrigger,
  CalendarPrev,
  CalendarNext,
} from 'reka-ui'
import { format } from 'date-fns'

const props = defineProps<{
  modelValue: Date
  minDate?: Date
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [date: Date]
}>()

const isOpen = ref(false)

// Convert Date to CalendarDate
const calendarValue = computed({
  get: () => {
    const d = props.modelValue
    return new CalendarDate(d.getFullYear(), d.getMonth() + 1, d.getDate())
  },
  set: (val: CalendarDate) => {
    const date = new Date(val.year, val.month - 1, val.day)
    // Preserve time from original
    date.setHours(props.modelValue.getHours(), props.modelValue.getMinutes())
    emit('update:modelValue', date)
    isOpen.value = false
  },
})

const minCalendarDate = computed(() => {
  if (!props.minDate) return undefined
  const d = props.minDate
  return new CalendarDate(d.getFullYear(), d.getMonth() + 1, d.getDate())
})

const formattedDate = computed(() => format(props.modelValue, 'EEEE, MMMM d, yyyy'))
</script>

<template>
  <UPopover v-model:open="isOpen">
    <UButton variant="outline" class="w-full justify-start text-left font-normal">
      <UIcon name="i-lucide-calendar" class="mr-2 h-4 w-4" />
      {{ formattedDate }}
    </UButton>

    <template #panel>
      <div class="p-3">
        <CalendarRoot
          v-model="calendarValue"
          :min-value="minCalendarDate"
          class="rounded-md border"
        >
          <CalendarHeader class="flex items-center justify-between px-2 py-2">
            <CalendarPrev
              class="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
            >
              <UIcon name="i-lucide-chevron-left" class="h-4 w-4" />
            </CalendarPrev>
            <CalendarHeading class="text-sm font-medium" />
            <CalendarNext
              class="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
            >
              <UIcon name="i-lucide-chevron-right" class="h-4 w-4" />
            </CalendarNext>
          </CalendarHeader>

          <CalendarGrid class="w-full border-collapse space-y-1">
            <CalendarGridHead>
              <CalendarGridRow class="flex">
                <CalendarHeadCell
                  v-for="day in ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']"
                  :key="day"
                  class="text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]"
                >
                  {{ day }}
                </CalendarHeadCell>
              </CalendarGridRow>
            </CalendarGridHead>

            <CalendarGridBody>
              <CalendarGridRow
                v-for="(weekDates, index) in 6"
                :key="`week-${index}`"
                class="flex w-full mt-2"
              >
                <CalendarCell
                  v-for="dayIndex in 7"
                  :key="`day-${dayIndex}`"
                  class="h-9 w-9 text-center text-sm p-0 relative focus-within:relative focus-within:z-20"
                >
                  <CalendarCellTrigger
                    class="inline-flex items-center justify-center rounded-md text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:bg-accent hover:text-accent-foreground h-9 w-9 p-0 font-normal aria-selected:opacity-100 data-[selected]:bg-primary data-[selected]:text-primary-foreground data-[disabled]:text-muted-foreground data-[disabled]:opacity-50 data-[outside-month]:text-muted-foreground data-[outside-month]:opacity-50 data-[today]:bg-accent data-[today]:text-accent-foreground"
                  />
                </CalendarCell>
              </CalendarGridRow>
            </CalendarGridBody>
          </CalendarGrid>
        </CalendarRoot>
      </div>
    </template>
  </UPopover>
</template>
