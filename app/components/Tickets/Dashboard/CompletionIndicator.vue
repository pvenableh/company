<template>
  <div class="flex items-center text-xs">
    <span class="text-muted-foreground">{{ prefix }}</span>
    <template v-if="value > 0">
      <UIcon 
        :name="higherIsBetter ? 'i-heroicons-arrow-up' : 'i-heroicons-arrow-down'" 
        class="w-3 h-3 ml-1" 
        :class="getColorClass()" 
      />
      <span :class="getColorClass()">{{ formatValue(value) }}%</span>
    </template>
    <template v-else-if="value < 0">
      <UIcon 
        :name="higherIsBetter ? 'i-heroicons-arrow-down' : 'i-heroicons-arrow-up'" 
        class="w-3 h-3 ml-1" 
        :class="getColorClass()" 
      />
      <span :class="getColorClass()">{{ formatValue(value) }}%</span>
    </template>
    <template v-else>
      <UIcon name="i-heroicons-minus" class="w-3 h-3 ml-1 text-muted-foreground" />
      <span class="text-muted-foreground">0%</span>
    </template>
  </div>
</template>

<script setup>
const props = defineProps({
  value: {
    type: Number,
    required: true
  },
  higherIsBetter: {
    type: Boolean,
    default: true
  },
  prefix: {
    type: String,
    default: ''
  }
});

// Format value to absolute with 1 decimal place
const formatValue = (val) => {
  return Math.abs(parseFloat(val.toFixed(1)));
};

// Determine color class based on value and whether higher is better
const getColorClass = () => {
  const isPositive = props.value > 0;
  const isBetter = (isPositive && props.higherIsBetter) || (!isPositive && !props.higherIsBetter);
  
  return isBetter ? 'text-green-500' : 'text-red-500';
};
</script>