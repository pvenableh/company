<template>
	<div class="grid grid-cols-2 md:grid-cols-4 gap-4">
		<UCard class="border-l-4 border-[var(--cyan)]">
			<div class="flex justify-between items-center">
				<div>
					<div class="flex items-center">
						<h3 class="text-xs uppercase font-bold text-gray-500">Pending</h3>
						<UTooltip
							text="Tickets that have been created but not yet assigned or scheduled. The average age indicates how long these tickets have been waiting."
						>
							<UIcon
								name="i-heroicons-information-circle"
								class="w-4 h-4 text-gray-400 hover:text-gray-600 cursor-help ml-1"
							/>
						</UTooltip>
					</div>
					<p class="text-2xl font-bold">{{ ticketCounts.pending }}</p>
				</div>
				<UIcon name="i-heroicons-clock" class="w-10 h-10 text-gray-300" />
			</div>
			<p class="text-xs mt-2">Avg. age: {{ formatDuration(avgTicketAge.pending) }}</p>
		</UCard>

		<UCard class="border-l-4 border-[var(--cyan2)]">
			<div class="flex justify-between items-center">
				<div>
					<div class="flex items-center">
						<h3 class="text-xs uppercase font-bold text-gray-500">Scheduled</h3>
						<UTooltip
							text="Tickets that have been assigned and scheduled for future work. The average age measures time since ticket creation, not time until scheduled work begins."
						>
							<UIcon
								name="i-heroicons-information-circle"
								class="w-4 h-4 text-gray-400 hover:text-gray-600 cursor-help ml-1"
							/>
						</UTooltip>
					</div>
					<p class="text-2xl font-bold">{{ ticketCounts.scheduled }}</p>
				</div>
				<UIcon name="i-heroicons-calendar" class="w-10 h-10 text-gray-300" />
			</div>
			<p class="text-xs mt-2">Avg. age: {{ formatDuration(avgTicketAge.scheduled) }}</p>
		</UCard>

		<UCard class="border-l-4 border-[var(--green2)]">
			<div class="flex justify-between items-center">
				<div>
					<div class="flex items-center">
						<h3 class="text-xs uppercase font-bold text-gray-500">In Progress</h3>
						<UTooltip
							text="Tickets currently being worked on. The average age indicates how long these tickets have been in the system total, not just in the 'In Progress' state."
						>
							<UIcon
								name="i-heroicons-information-circle"
								class="w-4 h-4 text-gray-400 hover:text-gray-600 cursor-help ml-1"
							/>
						</UTooltip>
					</div>
					<p class="text-2xl font-bold">{{ ticketCounts.inProgress }}</p>
				</div>
				<UIcon name="i-heroicons-arrow-path" class="w-10 h-10 text-gray-300" />
			</div>
			<p class="text-xs mt-2">Avg. age: {{ formatDuration(avgTicketAge.inProgress) }}</p>
		</UCard>

		<UCard class="border-l-4 border-[var(--green)]">
			<div class="flex justify-between items-center">
				<div>
					<div class="flex items-center">
						<h3 class="text-xs uppercase font-bold text-gray-500">Completed</h3>
						<UTooltip
							text="Total number of tickets that have been resolved. 'Last 30 days' shows the count of tickets completed in the past month."
						>
							<UIcon
								name="i-heroicons-information-circle"
								class="w-4 h-4 text-gray-400 hover:text-gray-600 cursor-help ml-1"
							/>
						</UTooltip>
					</div>
					<p class="text-2xl font-bold">{{ ticketCounts.completed }}</p>
				</div>
				<UIcon name="i-heroicons-check-circle" class="w-10 h-10 text-gray-300" />
			</div>
			<p class="text-xs mt-2">Last 30 days: {{ ticketCounts.recentlyCompleted }}</p>
		</UCard>
	</div>
</template>

<script setup>
const props = defineProps({
	ticketCounts: {
		type: Object,
		required: true,
	},
	avgTicketAge: {
		type: Object,
		required: true,
	},
});

// Format duration for display (copied from parent component)
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
