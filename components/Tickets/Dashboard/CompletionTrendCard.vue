<template>
	<UCard>
		<template #header>
			<div class="flex justify-between items-center">
				<div class="flex items-center">
					<h2 class="font-bold uppercase tracking-wide text-sm">Completion Rate Trend</h2>
					<UPopover mode="hover" :ui="{ rounded: 'rounded-sm' }">
						<UIcon
							name="i-heroicons-information-circle"
							class="w-4 h-4 text-muted-foreground hover:text-foreground cursor-help ml-1"
						/>

						<template #panel>
							<div class="p-4 max-w-sm">
								<p class="text-xs text-gray-600">
									This chart shows the number of tickets created versus completed over time. The completion rate (shown
									in tooltips) is calculated as (completed tickets ÷ created tickets) x 100%. Higher rates indicate more
									efficient ticket processing.
								</p>
							</div>
						</template>
					</UPopover>
				</div>
				<UBadge color="cyan" variant="soft">Last {{ timePeriodLabel }}</UBadge>
			</div>
		</template>
		<div class="h-80">
			<LineChart v-if="data && data.length" :data="chartData" :options="chartOptions" />
			<div v-else class="h-full flex items-center justify-center text-muted-foreground">No trend data available</div>
		</div>
	</UCard>
</template>

<script setup>
import { computed } from 'vue';

// Import vue-chartjs components
import { Line as LineChart } from 'vue-chartjs';
import {
	Chart as ChartJS,
	CategoryScale,
	LinearScale,
	PointElement,
	LineElement,
	Title,
	Tooltip,
	Legend,
} from 'chart.js';

// Register ChartJS components
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

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
				label: 'Completed',
				backgroundColor: 'rgba(14, 246, 45, 0.5)',
				borderColor: 'rgba(14, 246, 45, 1)',
				data: props.data.map((item) => item.completed),
				tension: 0.2,
			},
			{
				label: 'Created',
				backgroundColor: 'rgba(0, 191, 255, 0.5)',
				borderColor: 'rgba(0, 191, 255, 1)',
				data: props.data.map((item) => item.created),
				tension: 0.2,
			},
		],
	};
});

// Calculate completion rates
const completionRates = computed(() => {
	return props.data.map((item) => {
		if (item.created === 0) return 0;
		return Math.round((item.completed / item.created) * 100);
	});
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
			position: 'top',
		},
		tooltip: {
			callbacks: {
				afterLabel: function (context) {
					const datasetIndex = context.datasetIndex;
					const index = context.dataIndex;
					const data = context.chart.data;

					// Skip calculation for Created dataset
					if (datasetIndex === 1) return;

					const completed = data.datasets[0].data[index];
					const created = data.datasets[1].data[index];

					if (created === 0) return 'Completion rate: 0%';
					const rate = Math.round((completed / created) * 100);
					return `Completion rate: ${rate}%`;
				},
			},
		},
	},
};
</script>
