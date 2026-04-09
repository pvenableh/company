<template>
	<div class="calendar-view ios-card overflow-hidden">
		<!-- Calendar Header -->
		<div class="flex items-center justify-between p-4 border-b border-border">
			<button class="p-1.5 rounded-lg hover:bg-muted transition-colors" @click="prevMonth">
				<UIcon name="i-heroicons-chevron-left" class="w-5 h-5 text-muted-foreground" />
			</button>
			<h2 class="text-sm font-semibold tracking-wide">
				{{ monthLabel }}
			</h2>
			<div class="flex items-center gap-1">
				<button
					class="px-2.5 py-1 text-xs font-medium rounded-md hover:bg-muted transition-colors text-muted-foreground"
					@click="goToToday"
				>
					Today
				</button>
				<button class="p-1.5 rounded-lg hover:bg-muted transition-colors" @click="nextMonth">
					<UIcon name="i-heroicons-chevron-right" class="w-5 h-5 text-muted-foreground" />
				</button>
			</div>
		</div>

		<!-- Day Headers -->
		<div class="grid grid-cols-7 border-b border-border">
			<div
				v-for="day in dayNames"
				:key="day"
				class="py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
			>
				{{ day }}
			</div>
		</div>

		<!-- Calendar Grid -->
		<div class="grid grid-cols-7">
			<div
				v-for="(cell, idx) in calendarCells"
				:key="idx"
				class="calendar-cell border-b border-r border-border/50 min-h-[80px] p-1.5 transition-colors"
				:class="{
					'bg-muted/30': !cell.isCurrentMonth,
					'bg-primary/5': cell.isToday,
				}"
			>
				<span
					class="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium"
					:class="{
						'text-muted-foreground/50': !cell.isCurrentMonth,
						'bg-primary text-primary-foreground': cell.isToday,
						'text-foreground': cell.isCurrentMonth && !cell.isToday,
					}"
				>
					{{ cell.day }}
				</span>
				<!-- Event dots -->
				<div v-if="cell.events.length" class="mt-1 space-y-0.5">
					<div
						v-for="event in cell.events.slice(0, 3)"
						:key="event.id"
						class="text-[10px] leading-tight px-1 py-0.5 rounded bg-primary/10 text-primary truncate cursor-pointer hover:bg-primary/20 transition-colors"
						:title="event.title"
					>
						{{ event.title }}
					</div>
					<p v-if="cell.events.length > 3" class="text-[10px] text-muted-foreground px-1">
						+{{ cell.events.length - 3 }} more
					</p>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup>
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isToday, parseISO, isSameDay } from 'date-fns';

const schedulerData = inject('schedulerData', {
	videoMeetings: ref([]),
});

const currentDate = ref(new Date());

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const monthLabel = computed(() => format(currentDate.value, 'MMMM yyyy'));

const prevMonth = () => {
	const d = new Date(currentDate.value);
	d.setMonth(d.getMonth() - 1);
	currentDate.value = d;
};

const nextMonth = () => {
	const d = new Date(currentDate.value);
	d.setMonth(d.getMonth() + 1);
	currentDate.value = d;
};

const goToToday = () => {
	currentDate.value = new Date();
};

const calendarCells = computed(() => {
	const monthStart = startOfMonth(currentDate.value);
	const monthEnd = endOfMonth(currentDate.value);
	const calStart = startOfWeek(monthStart);
	const calEnd = endOfWeek(monthEnd);

	const days = eachDayOfInterval({ start: calStart, end: calEnd });
	const meetings = schedulerData.videoMeetings?.value || [];

	return days.map((day) => {
		const events = meetings.filter((m) => {
			if (!m.scheduled_start) return false;
			try {
				return isSameDay(parseISO(m.scheduled_start), day);
			} catch {
				return false;
			}
		});

		return {
			day: day.getDate(),
			isCurrentMonth: isSameMonth(day, currentDate.value),
			isToday: isToday(day),
			events: events.map((e) => ({
				id: e.id,
				title: e.title || 'Meeting',
			})),
		};
	});
});
</script>

<style scoped>
@reference "~/assets/css/tailwind.css";

.calendar-cell:nth-child(7n) {
	border-right: none;
}
</style>
