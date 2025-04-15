<template>
	<UCard>
		<template #header>
			<div class="flex justify-between items-center">
				<div class="flex items-center">
					<h2 class="font-bold uppercase tracking-wide text-sm">Your Completion Rate</h2>
					<UTooltip
						text="This chart shows how many non-completed tickets fall into each age category. Older tickets may require attention, while a high number of newer tickets might indicate a sudden influx of work."
					>
						<UIcon
							name="i-heroicons-information-circle"
							class="w-4 h-4 text-gray-400 hover:text-gray-600 cursor-help ml-1"
						/>
					</UTooltip>
				</div>
				<UBadge color="blue" variant="soft">Non-Completed Tickets</UBadge>
			</div>
		</template>
		<div class="h-80">
			<Bar v-if="chartData.labels && chartData.labels.length > 0" :data="chartData" :options="chartOptions" />
			<div v-else class="h-full flex items-center justify-center text-gray-500">No data available</div>
		</div>
	</UCard>
</template>

<script setup>
import { computed, watchEffect } from 'vue';

// Import chart.js
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'vue-chartjs';

// Register ChartJS components
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const props = defineProps({
	data: {
		type: Array,
		required: true,
	},
});

// Debug: log data when it changes
watchEffect(() => {
	console.log('Age Distribution Data:', props.data);
});

// Prepare chart data
const chartData = computed(() => {
	if (!props.data || props.data.length === 0) {
		return { labels: [], datasets: [] };
	}

	return {
		labels: props.data.map((item) => item.name),
		datasets: [
			{
				label: 'Number of Tickets',
				backgroundColor: 'rgba(75, 192, 192, 0.7)',
				data: props.data.map((item) => item.count),
			},
		],
	};
});

// Chart options
const chartOptions = {
	responsive: true,
	maintainAspectRatio: false,
	scales: {
		y: {
			beginAtZero: true,
			ticks: {
				precision: 0,
			},
		},
	},
	plugins: {
		legend: {
			display: true,
			position: 'top',
		},
		tooltip: {
			callbacks: {
				label: function (context) {
					return `${context.dataset.label}: ${context.raw} ticket${context.raw !== 1 ? 's' : ''}`;
				},
			},
		},
	},
};
</script>
