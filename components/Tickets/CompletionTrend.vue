<template>
	<div class="w-full h-full">
		<div v-if="!chartData.labels.length" class="flex justify-center items-center h-full text-muted-foreground">
			No data available
		</div>
		<client-only>
			<Line v-if="chartData.labels.length" :options="chartOptions" :data="chartData" :height="null" :width="null" />
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
				borderColor: '#0ef62d',
				backgroundColor: 'rgba(14, 246, 45, 0.2)',
				borderWidth: 2,
				pointBackgroundColor: '#0ef62d',
				tension: 0.4,
				fill: true,
				data: processedData.value.map((item) => item.completed),
			},
			{
				label: 'Created',
				borderColor: '#00bfff',
				backgroundColor: 'rgba(0, 191, 255, 0.2)',
				borderWidth: 2,
				pointBackgroundColor: '#00bfff',
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
