<template>
	<UCard>
		<template #header>
			<div class="flex justify-between items-center">
				<div class="flex items-center">
					<h2 class="font-bold uppercase tracking-wide text-sm">Your Completion Rate</h2>
					<UTooltip
						text="This chart tracks your ticket completion rate (percentage of assigned tickets resolved) and the absolute number of tickets you've completed over time. Higher completion rates indicate greater efficiency."
					>
						<UIcon
							name="i-heroicons-information-circle"
							class="w-4 h-4 text-gray-400 hover:text-gray-600 cursor-help ml-1"
						/>
					</UTooltip>
				</div>
				<UBadge color="green" variant="soft">Last {{ timePeriodLabel }}</UBadge>
			</div>
		</template>
		<div class="h-80">
			<BarChart v-if="data && data.length" :data="chartData" :options="chartOptions" />
			<div v-else class="h-full flex items-center justify-center text-gray-500">
				No personal completion data available
			</div>
		</div>
	</UCard>
</template>

<script setup>
import { computed } from 'vue';

// Import vue-chartjs components
import { Bar as BarChart } from 'vue-chartjs';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';

// Register ChartJS components
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const props = defineProps({
	data: {
		type: Array,
		required: true,
	},
	timePeriodLabel: {
		type: String,
		required: true,
	},
});

// Prepare chart data
const chartData = computed(() => {
	return {
		labels: props.data.map((item) => item.name),
		datasets: [
			{
				label: 'Completion Rate %',
				backgroundColor: 'rgba(75, 192, 192, 0.7)',
				borderColor: 'rgba(75, 192, 192, 1)',
				borderWidth: 1,
				data: props.data.map((item) => item.rate),
			},
			{
				label: 'Tickets Completed',
				backgroundColor: 'rgba(153, 102, 255, 0.7)',
				borderColor: 'rgba(153, 102, 255, 1)',
				borderWidth: 1,
				data: props.data.map((item) => item.tickets),
				yAxisID: 'tickets',
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
			title: {
				display: true,
				text: 'Completion Rate (%)',
			},
			max: 100,
			ticks: {
				callback: function (value) {
					return value + '%';
				},
			},
		},
		tickets: {
			position: 'right',
			beginAtZero: true,
			title: {
				display: true,
				text: 'Number of Tickets',
			},
			grid: {
				drawOnChartArea: false,
			},
			ticks: {
				precision: 0,
			},
		},
	},
	plugins: {
		legend: {
			position: 'top',
		},
		tooltip: {
			callbacks: {
				label: function (context) {
					const label = context.dataset.label || '';
					const value = context.raw || 0;

					if (label.includes('Rate')) {
						return `${label}: ${value}%`;
					} else {
						return `${label}: ${value}`;
					}
				},
			},
		},
	},
};
</script>
