<template>
	<div class="w-full h-full">
		<div v-if="!chartData.labels.length" class="flex justify-center items-center h-full text-gray-400">
			No data available
		</div>
		<client-only>
			<Doughnut v-if="chartData.labels.length" :options="chartOptions" :data="chartData" :height="null" :width="null" />
		</client-only>
	</div>
</template>

<script setup>
import { Doughnut } from 'vue-chartjs';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

// Register Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend);

const props = defineProps({
	data: {
		type: Array,
		required: true,
	},
});

// Chart colors
const COLORS = ['#00bfff', '#05d1ba', '#0ae470', '#0ef62d'];

// Process chart data with percentages
const processedData = computed(() => {
	if (!props.data || !props.data.length) {
		return [];
	}

	// Calculate total for percentages
	const total = props.data.reduce((sum, item) => sum + item.count, 0);

	return props.data.map((item, index) => ({
		type: item.type,
		count: item.count,
		percentage: total ? Math.round((item.count / total) * 100 * 10) / 10 : 0,
		color: COLORS[index % COLORS.length],
	}));
});

// Chart data formatting
const chartData = computed(() => {
	return {
		labels: processedData.value.map((item) => item.type),
		datasets: [
			{
				data: processedData.value.map((item) => item.count),
				backgroundColor: processedData.value.map((item) => item.color),
				borderWidth: 0,
			},
		],
	};
});

// Chart options
const chartOptions = {
	responsive: true,
	maintainAspectRatio: false,
	cutout: '50%',
	plugins: {
		legend: {
			position: 'bottom',
			labels: {
				padding: 20,
				boxWidth: 12,
			},
		},
		tooltip: {
			callbacks: {
				label: function (context) {
					const item = processedData.value[context.dataIndex];
					return `${context.label}: ${context.raw} (${item.percentage}%)`;
				},
			},
		},
	},
};
</script>
