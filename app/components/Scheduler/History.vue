<!-- components/Scheduler/History.vue -->
<script setup>
import { format, subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';

const toast = useToast();

// State
const loading = ref(true);
const dateRange = ref('month');
const statusFilter = ref('all');

// Data
const meetings = ref([]);
const stats = ref({ total: 0, completed: 0, cancelled: 0, noShow: 0, avgDuration: 0, totalDuration: 0 });

// Options
const dateRangeOptions = [
	{ label: 'This Week', value: 'week' },
	{ label: 'This Month', value: 'month' },
	{ label: 'Last 30 Days', value: '30days' },
	{ label: 'Last 90 Days', value: '90days' },
	{ label: 'All Time', value: 'all' },
];

const statusFilterOptions = [
	{ label: 'All', value: 'all' },
	{ label: 'Completed', value: 'completed' },
	{ label: 'Cancelled', value: 'cancelled' },
	{ label: 'No Show', value: 'no_show' },
];

// Computed
const dateRangeFilter = computed(() => {
	const now = new Date();
	switch (dateRange.value) {
		case 'week': return { start: startOfWeek(now), end: endOfWeek(now) };
		case 'month': return { start: startOfMonth(now), end: endOfMonth(now) };
		case '30days': return { start: subDays(now, 30), end: now };
		case '90days': return { start: subDays(now, 90), end: now };
		default: return null;
	}
});

const filteredMeetings = computed(() => {
	let result = meetings.value;
	
	if (dateRangeFilter.value) {
		result = result.filter((m) => {
			const date = new Date(m.scheduled_start || m.start_time);
			return date >= dateRangeFilter.value.start && date <= dateRangeFilter.value.end;
		});
	}
	
	if (statusFilter.value !== 'all') {
		result = result.filter((m) => m.status === statusFilter.value);
	}
	
	return result.sort((a, b) => new Date(b.scheduled_start || b.start_time) - new Date(a.scheduled_start || a.start_time));
});

const chartData = computed(() => {
	if (!dateRangeFilter.value) return [];
	
	const days = eachDayOfInterval({ start: dateRangeFilter.value.start, end: dateRangeFilter.value.end });
	
	return days.map((day) => {
		const dayStr = format(day, 'yyyy-MM-dd');
		const dayMeetings = meetings.value.filter((m) => {
			const meetingDate = format(new Date(m.scheduled_start || m.start_time), 'yyyy-MM-dd');
			return meetingDate === dayStr;
		});
		
		return {
			date: format(day, 'MMM d'),
			total: dayMeetings.length,
			completed: dayMeetings.filter((m) => m.status === 'completed').length,
			cancelled: dayMeetings.filter((m) => ['cancelled', 'canceled'].includes(m.status)).length,
		};
	});
});

// Methods
const fetchHistory = async () => {
	loading.value = true;
	try {
		const response = await $fetch('/api/scheduler/history');
		meetings.value = response.data || [];
		
		const completed = meetings.value.filter((m) => m.status === 'completed');
		const cancelled = meetings.value.filter((m) => ['cancelled', 'canceled'].includes(m.status));
		const noShow = meetings.value.filter((m) => m.status === 'no_show');
		const totalDuration = completed.reduce((sum, m) => sum + (m.actual_duration_minutes || m.duration_minutes || 0), 0);
		
		stats.value = {
			total: meetings.value.length,
			completed: completed.length,
			cancelled: cancelled.length,
			noShow: noShow.length,
			avgDuration: completed.length > 0 ? Math.round(totalDuration / completed.length) : 0,
			totalDuration,
		};
	} catch (error) {
		console.error('Error:', error);
	}
	loading.value = false;
};

const getStatusColor = (status) => {
	const colors = { completed: 'green', cancelled: 'red', canceled: 'red', no_show: 'orange', scheduled: 'blue' };
	return colors[status] || 'gray';
};

// Uses formatDateWithTime from utils/dates.ts
const formatDateTime = (dateStr) => {
	if (!dateStr) return '';
	return formatDateWithTime(dateStr);
};

const formatDuration = (minutes) => {
	if (!minutes) return '-';
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;
	return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
};

const exportCsv = () => {
	const headers = ['Title', 'Date', 'Duration', 'Status', 'Invitee', 'Type'];
	const rows = filteredMeetings.value.map((m) => [
		m.title,
		formatDateTime(m.scheduled_start || m.start_time),
		m.actual_duration_minutes || m.duration_minutes || '',
		m.status,
		m.invitee_name || m.invitee_email || '',
		m.meeting_type || '',
	]);
	
	const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
	const blob = new Blob([csv], { type: 'text/csv' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `meeting-history-${format(new Date(), 'yyyy-MM-dd')}.csv`;
	a.click();
	URL.revokeObjectURL(url);
	toast.add({ title: 'Export complete', color: 'green' });
};

onMounted(() => fetchHistory());
</script>

<template>
	<div class="space-y-6">
		<!-- Stats -->
		<div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
			<UCard :ui="{ body: 'p-4' }">
				<div class="text-center">
					<div class="text-2xl font-bold">{{ stats.total }}</div>
					<div class="text-xs text-gray-500">Total Meetings</div>
				</div>
			</UCard>
			<UCard :ui="{ body: 'p-4' }">
				<div class="text-center">
					<div class="text-2xl font-bold text-green-500">{{ stats.completed }}</div>
					<div class="text-xs text-gray-500">Completed</div>
				</div>
			</UCard>
			<UCard :ui="{ body: 'p-4' }">
				<div class="text-center">
					<div class="text-2xl font-bold text-red-500">{{ stats.cancelled }}</div>
					<div class="text-xs text-gray-500">Cancelled</div>
				</div>
			</UCard>
			<UCard :ui="{ body: 'p-4' }">
				<div class="text-center">
					<div class="text-2xl font-bold text-orange-500">{{ stats.noShow }}</div>
					<div class="text-xs text-gray-500">No Show</div>
				</div>
			</UCard>
			<UCard :ui="{ body: 'p-4' }">
				<div class="text-center">
					<div class="text-2xl font-bold">{{ stats.avgDuration }}m</div>
					<div class="text-xs text-gray-500">Avg Duration</div>
				</div>
			</UCard>
			<UCard :ui="{ body: 'p-4' }">
				<div class="text-center">
					<div class="text-2xl font-bold">{{ formatDuration(stats.totalDuration) }}</div>
					<div class="text-xs text-gray-500">Total Time</div>
				</div>
			</UCard>
		</div>

		<!-- Filters -->
		<div class="flex flex-wrap items-center justify-between gap-4">
			<div class="flex items-center gap-4">
				<USelect v-model="dateRange" :options="dateRangeOptions" size="sm" class="w-40" />
				<USelect v-model="statusFilter" :options="statusFilterOptions" size="sm" class="w-32" />
			</div>
			<UButton color="gray" variant="soft" icon="i-heroicons-arrow-down-tray" size="sm" @click="exportCsv">
				Export CSV
			</UButton>
		</div>

		<!-- Chart -->
		<UCard v-if="chartData.length > 0 && chartData.length <= 31">
			<template #header>
				<span class="font-semibold">Meeting Activity</span>
			</template>
			<div class="h-48 flex items-end gap-1">
				<div v-for="(day, index) in chartData" :key="index" class="flex-1 flex flex-col items-center gap-1">
					<div class="w-full flex flex-col gap-0.5">
						<div v-if="day.completed > 0" class="w-full bg-green-500 rounded-t" :style="{ height: `${Math.max(day.completed * 20, 4)}px` }" />
						<div v-if="day.cancelled > 0" class="w-full bg-red-400" :style="{ height: `${Math.max(day.cancelled * 20, 4)}px` }" />
					</div>
					<span class="text-[10px] text-gray-400 truncate w-full text-center">{{ day.date }}</span>
				</div>
			</div>
			<div class="flex items-center justify-center gap-4 mt-4 text-xs">
				<div class="flex items-center gap-1"><div class="w-3 h-3 bg-green-500 rounded" /><span>Completed</span></div>
				<div class="flex items-center gap-1"><div class="w-3 h-3 bg-red-400 rounded" /><span>Cancelled</span></div>
			</div>
		</UCard>

		<!-- List -->
		<UCard>
			<template #header>
				<div class="flex items-center justify-between">
					<span class="font-semibold">Meeting History</span>
					<UBadge color="gray" variant="soft">{{ filteredMeetings.length }} meetings</UBadge>
				</div>
			</template>

			<div v-if="loading" class="text-center py-8">
				<UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin mx-auto text-gray-400" />
			</div>

			<div v-else-if="filteredMeetings.length === 0" class="text-center py-8 text-gray-500">
				<UIcon name="i-heroicons-calendar" class="w-8 h-8 mx-auto mb-2 opacity-50" />
				<p>No meetings found</p>
			</div>

			<div v-else class="divide-y divide-gray-100 dark:divide-gray-800">
				<div v-for="meeting in filteredMeetings" :key="meeting.id" class="py-3 flex items-center justify-between gap-4">
					<div class="flex items-center gap-3 min-w-0">
						<UIcon :name="meeting.room_name ? 'i-heroicons-video-camera' : 'i-heroicons-calendar'" :class="meeting.room_name ? 'text-green-500' : 'text-blue-500'" class="w-5 h-5 flex-shrink-0" />
						<div class="min-w-0">
							<div class="font-medium truncate">{{ meeting.title }}</div>
							<div class="text-sm text-gray-500">
								{{ formatDateTime(meeting.scheduled_start || meeting.start_time) }}
								<span v-if="meeting.invitee_name || meeting.invitee_email"> · {{ meeting.invitee_name || meeting.invitee_email }}</span>
							</div>
						</div>
					</div>
					<div class="flex items-center gap-3 flex-shrink-0">
						<span class="text-sm text-gray-500">{{ formatDuration(meeting.actual_duration_minutes || meeting.duration_minutes) }}</span>
						<UBadge :color="getStatusColor(meeting.status)" variant="soft" size="xs">{{ meeting.status }}</UBadge>
					</div>
				</div>
			</div>
		</UCard>
	</div>
</template>
