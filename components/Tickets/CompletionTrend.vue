<template>
	<div class="w-full h-full">
		<div v-if="!chartData.labels.length" class="flex justify-center items-center h-full text-gray-400">
			No data available
		</div>
		<client-only>
			<Line
				v-if="chartData.labels.length"
				:chart-options="chartOptions"
				:chart-data="chartData"
				:height="null"
				:width="null"
			/>
		</client-only>
	</div>
</template>

<script setup>
import { Line } from 'vue-chartjs';
import {
	Chart as ChartJS,
	Title,
	Tooltip,
	Legend,
	LineElement,
	PointElement,
	LinearScale,
	CategoryScale,
	Filler,
} from 'chart.js';

// Register Chart.js components
ChartJS.register(Title, Tooltip, Legend, LineElement, PointElement, LinearScale, CategoryScale, Filler);

const props = defineProps({
	data: {
		type: Array,
		required: true,
	},
});

// Process chart data
const processedData = computed(() => {
	if (!props.data || !props.data.length) {
		return [];
	}

	return props.data.map((item) => ({
		name: item.name,
		completed: item.completed,
		created: item.created,
	}));
});

// Chart data formatting
const chartData = computed(() => {
	return {
		labels: processedData.value.map((item) => item.name),
		datasets: [
			{
				label: 'Completed',
				borderColor: '#10B981',
				backgroundColor: 'rgba(16, 185, 129, 0.1)',
				borderWidth: 2,
				pointBackgroundColor: '#10B981',
				tension: 0.4,
				fill: true,
				data: processedData.value.map((item) => item.completed),
			},
			{
				label: 'Created',
				borderColor: '#6366F1',
				backgroundColor: 'rgba(99, 102, 241, 0.1)',
				borderWidth: 2,
				pointBackgroundColor: '#6366F1',
				tension: 0.4,
				fill: true,
				data: processedData.value.map((item) => item.created),
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
			position: 'top',
		},
		tooltip: {
			callbacks: {
				footer: function (tooltipItems) {
					const datasetIndex = tooltipItems[0].datasetIndex;
					const otherDatasetIndex = datasetIndex === 0 ? 1 : 0;

					if (tooltipItems.length < 2) return '';

					const thisValue = tooltipItems[0].raw;
					const otherValue =
						tooltipItems[0].chart.data.datasets[otherDatasetIndex]?.data[tooltipItems[0].dataIndex] || 0;

					if (datasetIndex === 0 && otherValue > 0) {
						// Completed vs Created
						const ratio = Math.round((thisValue / otherValue) * 100);
						return `Completion Rate: ${ratio}%`;
					}

					return '';
				},
			},
		},
	},
	scales: {
		y: {
			beginAtZero: true,
			ticks: {
				precision: 0,
			},
		},
	},
	interaction: {
		mode: 'index',
		intersect: false,
	},
};
</script>
