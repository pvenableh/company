<template>
	<UCard>
		<template #header>
			<h2 class="text-base font-bold">Your Performance Summary</h2>
		</template>
		<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
			<div class="border-r border-gray-200 pr-4">
				<h3 class="text-xs uppercase font-bold text-gray-500">Average Resolution Time</h3>
				<p class="text-xl font-bold">{{ formatDuration(performance.avgResolutionTime) }}</p>
				<div class="mt-1">
					<TicketsDashboardCompletionIndicator
						:value="performance.comparison.avgResolutionTime"
						:higher-is-better="false"
						prefix="vs team: "
					/>
				</div>
			</div>
			<div class="border-r border-gray-200 px-4">
				<h3 class="text-xs uppercase font-bold text-gray-500">Completion Rate</h3>
				<p class="text-xl font-bold">{{ performance.completionRate }}%</p>
				<div class="mt-1">
					<TicketsDashboardCompletionIndicator :value="performance.comparison.completionRate" prefix="vs team: " />
				</div>
			</div>
			<div class="pl-4">
				<h3 class="text-xs uppercase font-bold text-gray-500">Activity Level</h3>
				<p class="text-xl font-bold">{{ performance.activityLevel }} actions/ticket</p>
				<div class="mt-1">
					<TicketsDashboardCompletionIndicator :value="performance.comparison.activityLevel" prefix="vs team: " />
				</div>
			</div>
		</div>
	</UCard>
</template>

<script setup>
const props = defineProps({
	performance: {
		type: Object,
		required: true,
	},
});

// Format duration for display
const formatDuration = (hours) => {
	if (hours === 0) return 'N/A';

	if (hours < 24) {
		return `${Math.round(hours)}h`;
	} else {
		const days = Math.floor(hours / 24);
		const remainingHours = Math.round(hours % 24);
		return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
	}
};
</script>
