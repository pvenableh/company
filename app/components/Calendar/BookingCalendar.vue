<template>
	<div class="w-full" ref="calendarContainer">
		<CalendarRoot
			v-model="calendarValue"
			v-model:placeholder="calendarPlaceholder"
			class="w-full"
			v-slot="{ grid, weekDays }"
		>
			<!-- Month header -->
			<CalendarHeader class="flex items-center justify-between px-1 pb-3">
				<CalendarPrevButton class="p-1.5 rounded-lg hover:bg-muted/30 transition-colors ios-press" />
				<CalendarHeading class="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/70" />
				<CalendarNextButton class="p-1.5 rounded-lg hover:bg-muted/30 transition-colors ios-press" />
			</CalendarHeader>

			<div class="w-full">
				<CalendarGrid v-for="month in grid" :key="month.value.toString()" class="w-full border-collapse">
					<CalendarGridHead>
						<CalendarGridRow class="flex w-full">
							<CalendarHeadCell
								v-for="day in weekDays"
								:key="day"
								class="flex-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground text-center py-2"
							>
								{{ day }}
							</CalendarHeadCell>
						</CalendarGridRow>
					</CalendarGridHead>
					<CalendarGridBody>
						<CalendarGridRow
							v-for="(weekDates, index) in month.rows"
							:key="`weekDate-${index}`"
							class="flex w-full"
						>
							<CalendarCell
								v-for="weekDate in weekDates"
								:key="weekDate.toString()"
								:date="weekDate"
								class="relative flex-1 p-0"
								:class="{
									'border-t border-border/20': true,
									'border-r border-border/10 last:border-r-0': true,
								}"
								:style="index % 2 === 1 ? 'background: rgba(0,0,0,0.015)' : ''"
							>
								<div
									class="h-[64px] p-1 flex flex-col gap-0.5 cursor-pointer hover:bg-muted/20 transition-colors overflow-hidden"
									:class="{
										'bg-primary/5 dark:bg-primary/10': isToday(weekDate),
									}"
									@click="dayClicked(weekDate)"
								>
									<!-- Date number -->
									<span
										class="text-[11px] leading-none self-start px-0.5"
										:class="{
											'font-bold text-primary': isSelected(weekDate),
											'text-muted-foreground/40': isOutsideMonth(weekDate, month.value),
											'font-semibold text-foreground/80': !isSelected(weekDate) && !isOutsideMonth(weekDate, month.value),
										}"
									>
										{{ weekDate.day }}
									</span>

									<!-- Event chips — max 2 visible -->
									<div class="flex flex-col gap-px overflow-hidden flex-1">
										<SchedulerCalendarEventChip
											v-for="event in getEventsForDate(dateKey(weekDate)).slice(0, 2)"
											:key="event.id"
											:event="event"
											compact
										/>
										<span
											v-if="getEventsForDate(dateKey(weekDate)).length > 2"
											class="text-[8px] text-muted-foreground/50 px-1 leading-tight"
										>
											+{{ getEventsForDate(dateKey(weekDate)).length - 2 }} more
										</span>
									</div>
								</div>
							</CalendarCell>
						</CalendarGridRow>
					</CalendarGridBody>
				</CalendarGrid>
			</div>
		</CalendarRoot>
	</div>
</template>

<script setup lang="ts">
import { format } from 'date-fns';
import { CalendarDate, getLocalTimeZone, today, type DateValue } from '@internationalized/date';
import { CalendarRoot } from 'reka-ui';
import {
	CalendarCell,
	CalendarGrid,
	CalendarGridBody,
	CalendarGridHead,
	CalendarGridRow,
	CalendarHeadCell,
	CalendarHeader,
	CalendarHeading,
	CalendarNextButton,
	CalendarPrevButton,
} from '~/components/ui/calendar';
import type { CalendarEvent } from '~/composables/useCalendarEvents';

const props = defineProps<{
	externalEvents: CalendarEvent[];
}>();

const emit = defineEmits(['date-selected']);

const calendarContainer = ref<HTMLElement | null>(null);
const selectedDate = ref(new Date());

// Bridge between native Date and @internationalized/date CalendarDate
const calendarPlaceholder = ref<DateValue>(today(getLocalTimeZone()));

const calendarValue = computed({
	get() {
		const d = selectedDate.value;
		return new CalendarDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
	},
	set(val) {
		if (val) {
			selectedDate.value = new Date(val.year, val.month - 1, val.day);
		}
	},
});

// ── Events by date map (from parent's externalEvents) ──
const eventsByDate = computed(() => {
	const map = new Map<string, CalendarEvent[]>();
	for (const e of props.externalEvents) {
		if (!e.start_time) continue;
		const k = e.start_time.substring(0, 10);
		if (!map.has(k)) map.set(k, []);
		map.get(k)!.push(e);
	}
	return map;
});

function dateKey(dateValue: any): string {
	return `${dateValue.year}-${String(dateValue.month).padStart(2, '0')}-${String(dateValue.day).padStart(2, '0')}`;
}

function getEventsForDate(key: string): CalendarEvent[] {
	return eventsByDate.value.get(key) || [];
}

// ── Date helpers ──
function isToday(dateValue: any) {
	const t = today(getLocalTimeZone());
	return dateValue.year === t.year && dateValue.month === t.month && dateValue.day === t.day;
}

function isSelected(dateValue: any) {
	const d = selectedDate.value;
	return dateValue.year === d.getFullYear() && dateValue.month === d.getMonth() + 1 && dateValue.day === d.getDate();
}

function isOutsideMonth(dateValue: any, monthValue: any) {
	return dateValue.month !== monthValue.month;
}

function dayClicked(dateValue: any) {
	selectedDate.value = new Date(dateValue.year, dateValue.month - 1, dateValue.day);
	emit('date-selected', format(selectedDate.value, 'yyyy-MM-dd'));
}
</script>

<style scoped>
/* Hidden scrollbars per Clean Gantt pattern */
:deep(*) {
	scrollbar-width: none;
	-ms-overflow-style: none;
}
:deep(*)::-webkit-scrollbar {
	display: none;
}
</style>
