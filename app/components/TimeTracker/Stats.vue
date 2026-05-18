<template>
	<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
		<!-- Today -->
		<div class="cg-card-compact">
			<p class="cg-text-label mb-1">Today</p>
			<p class="cg-text-stat tabular-nums text-foreground">{{ todayFormatted }}</p>
			<p class="cg-text-child text-muted-foreground mt-0.5">
				{{ todayEntryCount }} {{ todayEntryCount === 1 ? 'entry' : 'entries' }}
			</p>
		</div>

		<!-- This Week -->
		<div class="cg-card-compact">
			<p class="cg-text-label mb-1">This Week</p>
			<p class="cg-text-stat tabular-nums text-foreground">{{ weekFormatted }}</p>
			<p class="cg-text-child text-muted-foreground mt-0.5">
				{{ weekEntryCount }} {{ weekEntryCount === 1 ? 'entry' : 'entries' }}
			</p>
		</div>

		<!-- Billable -->
		<div class="cg-card-compact">
			<p class="cg-text-label mb-1">Billable</p>
			<p class="cg-text-stat tabular-nums text-success">
				${{ billableAmount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) }}
			</p>
			<p class="cg-text-child text-muted-foreground mt-0.5">
				{{ billableFormatted }} billable time
			</p>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { TimeEntry } from '~~/shared/directus';
import { isToday, startOfWeek, isWithinInterval, endOfWeek } from 'date-fns';

const props = defineProps<{
	entries: TimeEntry[];
}>();

const { formatDuration } = useTimeTracker();

// Today stats
const todayEntries = computed(() =>
	props.entries.filter((e) => {
		if (!e.date) return false;
		return isToday(new Date(e.date));
	}),
);

const todayMinutes = computed(() =>
	todayEntries.value.reduce((sum, e) => sum + (e.duration_minutes || 0), 0),
);

const todayFormatted = computed(() => formatDuration(todayMinutes.value));
const todayEntryCount = computed(() => todayEntries.value.length);

// This week stats
const weekEntries = computed(() => {
	const now = new Date();
	const weekStart = startOfWeek(now, { weekStartsOn: 1 });
	const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

	return props.entries.filter((e) => {
		if (!e.date) return false;
		const entryDate = new Date(e.date);
		return isWithinInterval(entryDate, { start: weekStart, end: weekEnd });
	});
});

const weekMinutes = computed(() =>
	weekEntries.value.reduce((sum, e) => sum + (e.duration_minutes || 0), 0),
);

const weekFormatted = computed(() => formatDuration(weekMinutes.value));
const weekEntryCount = computed(() => weekEntries.value.length);

// Billable stats
const billableEntries = computed(() =>
	props.entries.filter((e) => e.billable),
);

const billableMinutes = computed(() =>
	billableEntries.value.reduce((sum, e) => sum + (e.duration_minutes || 0), 0),
);

const billableAmount = computed(() =>
	billableEntries.value.reduce((sum, e) => {
		const hours = (e.duration_minutes || 0) / 60;
		return sum + hours * (e.hourly_rate || 0);
	}, 0),
);

const billableFormatted = computed(() => formatDuration(billableMinutes.value));
</script>
