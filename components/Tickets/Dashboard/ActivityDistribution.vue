<template>
	<UCard>
		<template #header>
			<div class="flex justify-between items-center">
				<div class="flex items-center">
					<h2 class="font-bold uppercase tracking-wide text-sm">Activity Distribution</h2>
					<UTooltip
						text="This chart shows the breakdown of different activities performed on tickets. It helps identify which types of actions are most common in your workflow, revealing patterns in how tickets are processed and managed."
					>
						<UIcon
							name="i-heroicons-information-circle"
							class="w-4 h-4 text-gray-400 hover:text-gray-600 cursor-help ml-1"
						/>
					</UTooltip>
				</div>
				<UBadge color="purple" variant="soft">{{ teamFilter === null ? 'Organization' : 'Team' }}</UBadge>
			</div>
		</template>
		<div class="h-80">
			<PieChart v-if="data && data.length" :data="chartData" :options="chartOptions" />
			<div v-else class="h-full flex items-center justify-center text-gray-500">No activity data available</div>
		</div>
	</UCard>
</template>

<script setup>
import { computed } from 'vue';

// Import vue-chartjs components
import { Pie as PieChart } from 'vue-chartjs';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

// Register ChartJS components
ChartJS.register(ArcElement, Tooltip, Legend);

const props = defineProps({
	data: {
		type: Array,
		required: true,
	},
	teamFilter: {
		type: String,
		default: null,
	},
});

// Chart colors
const chartColors = [
	'rgba(255, 99, 132, 0.7)', // Red
	'rgba(54, 162, 235, 0.7)', // Blue
	'rgba(255, 206, 86, 0.7)', // Yellow
	'rgba(75, 192, 192, 0.7)', // Teal
	'rgba(153, 102, 255, 0.7)', // Purple
	'rgba(255, 159, 64, 0.7)', // Orange
];

// Prepare chart data
const chartData = computed(() => {
	return {
		labels: props.data.map((item) => item.type),
		datasets: [
			{
				data: props.data.map((item) => item.count),
				backgroundColor: chartColors.slice(0, props.data.length),
				borderWidth: 1,
			},
		],
	};
});

// Chart options
const chartOptions = {
	responsive: true,
	maintainAspectRatio: false,
	plugins: {
		legend: {
			position: 'bottom',
		},
		tooltip: {
			callbacks: {
				label: function (context) {
					const label = context.label || '';
					const value = context.raw || 0;
					const total = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
					const percentage = Math.round((value / total) * 100);
					return `${label}: ${value} (${percentage}%)`;
				},
			},
		},
	},
};
</script>
