<template>
  <div class="w-full h-full">
    <div v-if="!chartData.length" class="flex justify-center items-center h-full text-gray-400">
      No data available
    </div>
    <client-only>
      <Bar 
        v-if="chartData.length"
        :chart-options="chartOptions"
        :chart-data="chartData"
        :height="null"
        :width="null"
      />
    </client-only>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { Bar } from 'vue-chartjs';
import { Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale } from 'chart.js';

// Register Chart.js components
ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale);

const props = defineProps({
  data: {
    type: Array,
    required: true
  }
});

// Process chart data
const processedData = computed(() => {
  if (!props.data || !props.data.length) {
    return [];
  }
  
  return props.data.map(item => ({
    name: item.name,
    count: item.count
  }));
});

// Chart data formatting
const chartData = computed(() => {
  return {
    labels: processedData.value.map(item => item.name),
    datasets: [
      {
        label: 'Number of Tickets',
        backgroundColor: '#0EA5E9',
        data: processedData.value.map(item => item.count),
        borderRadius: 4
      }
    ]
  };
});

// Chart options
const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: true,
      position: 'top'
    },
    tooltip: {
      callbacks: {
        label: function(context) {
          return `${context.dataset.label}: ${context.raw} tickets`;
        }
      }
    }
  },
  scales: {
    y: {
      beginAtZero: true,
      ticks: {
        precision: 0
      }
    },
    x: {
      ticks: {
        maxRotation: 45,
        minRotation: 45
      }
    }
  }
};
</script>