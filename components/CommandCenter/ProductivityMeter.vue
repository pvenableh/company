<script setup lang="ts">
const props = withDefaults(
	defineProps<{
		score: number;
		overdueItems: number;
		pendingInvoiceTotal: number;
		tasksCompletedToday: number;
		activeProjects?: number;
		unreadMessages?: number;
		upcomingMeetings?: number;
	}>(),
	{
		activeProjects: 0,
		unreadMessages: 0,
		upcomingMeetings: 0,
	},
);

const scoreColor = computed(() => {
	if (props.score >= 80) return 'text-green-500';
	if (props.score >= 60) return 'text-blue-500';
	if (props.score >= 40) return 'text-amber-500';
	return 'text-red-500';
});

const scoreLabel = computed(() => {
	if (props.score >= 80) return 'Excellent';
	if (props.score >= 60) return 'Good';
	if (props.score >= 40) return 'Fair';
	return 'Needs Attention';
});

const progressColor = computed(() => {
	if (props.score >= 80) return 'bg-green-500';
	if (props.score >= 60) return 'bg-blue-500';
	if (props.score >= 40) return 'bg-amber-500';
	return 'bg-red-500';
});

// Show expanded metrics only when extra data is available
const hasExtendedMetrics = computed(() => {
	return props.activeProjects > 0 || props.unreadMessages > 0 || props.upcomingMeetings > 0;
});
</script>

<template>
	<div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
		<div class="flex items-center justify-between mb-3">
			<h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
				Productivity
			</h3>
			<span :class="scoreColor" class="text-2xl font-bold">{{ score }}</span>
		</div>

		<div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-2">
			<div
				:class="progressColor"
				class="h-2 rounded-full transition-all duration-500"
				:style="{ width: score + '%' }"
			/>
		</div>
		<p class="text-xs text-gray-500 dark:text-gray-400 mb-4" :class="scoreColor">{{ scoreLabel }}</p>

		<!-- Primary metrics row -->
		<div class="grid grid-cols-3 gap-3 text-center">
			<div>
				<p class="text-lg font-bold text-gray-900 dark:text-white">{{ tasksCompletedToday }}</p>
				<p class="text-[10px] uppercase tracking-wide text-gray-500">Done Today</p>
			</div>
			<div>
				<p class="text-lg font-bold" :class="overdueItems > 0 ? 'text-red-500' : 'text-gray-900 dark:text-white'">
					{{ overdueItems }}
				</p>
				<p class="text-[10px] uppercase tracking-wide text-gray-500">Overdue</p>
			</div>
			<div>
				<p class="text-lg font-bold text-emerald-600">${{ (pendingInvoiceTotal / 1000).toFixed(1) }}k</p>
				<p class="text-[10px] uppercase tracking-wide text-gray-500">Pending</p>
			</div>
		</div>

		<!-- Extended metrics row -->
		<div v-if="hasExtendedMetrics" class="grid grid-cols-3 gap-3 text-center mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
			<div v-if="activeProjects > 0">
				<p class="text-lg font-bold text-purple-500">{{ activeProjects }}</p>
				<p class="text-[10px] uppercase tracking-wide text-gray-500">Projects</p>
			</div>
			<div v-if="unreadMessages > 0">
				<p class="text-lg font-bold text-cyan-500">{{ unreadMessages }}</p>
				<p class="text-[10px] uppercase tracking-wide text-gray-500">Messages</p>
			</div>
			<div v-if="upcomingMeetings > 0">
				<p class="text-lg font-bold text-amber-500">{{ upcomingMeetings }}</p>
				<p class="text-[10px] uppercase tracking-wide text-gray-500">Meetings</p>
			</div>
		</div>
	</div>
</template>
