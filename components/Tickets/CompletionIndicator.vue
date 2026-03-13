<template>
  <span class="flex items-center" :class="colorClass">
    <UIcon :name="iconName" class="w-3 h-3 mr-1" />
    <span class="text-xs font-medium">{{ formattedValue }}</span>
  </span>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  value: {
    type: Number,
    required: true
  },
  // Whether higher is better (true) or lower is better (false)
  higherIsBetter: {
    type: Boolean,
    default: true
  },
  // Show the percentage symbol
  showPercentage: {
    type: Boolean,
    default: true
  },
  // Text to display before the value
  prefix: {
    type: String,
    default: ''
  }
});

const isPositive = computed(() => {
  if (props.higherIsBetter) {
    return props.value >= 0;
  } else {
    return props.value <= 0;
  }
});

const iconName = computed(() => {
  if (props.value === 0) {
    return 'i-heroicons-minus';
  } else if (isPositive.value) {
    return 'i-heroicons-arrow-up';
  } else {
    return 'i-heroicons-arrow-down';
  }
});

const colorClass = computed(() => {
  if (props.value === 0) {
    return 'text-muted-foreground';
  } else if (isPositive.value) {
    return 'text-green-500';
  } else {
    return 'text-red-500';
  }
});

const formattedValue = computed(() => {
  const absValue = Math.abs(props.value);
  const formattedNum = absValue.toFixed(1).replace(/\.0$/, '');
  
  let result = props.prefix;
  
  if (props.value > 0) {
    result += '+';
  } else if (props.value < 0) {
    result += '-';
  }
  
  result += formattedNum;
  
  if (props.showPercentage) {
    result += '%';
  }
  
  return result;
});
</script>