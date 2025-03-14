<template>
	<FormSegmentedControl v-model="statusValue" :options="columns" label="Status" :custom-gradient="statusGradient" />
</template>

<script setup>
const props = defineProps({
	modelValue: {
		type: String,
		required: true,
	},
});

const emit = defineEmits(['update:modelValue']);

const columns = [
	{ value: 'pending', label: 'Pending' },
	{ value: 'scheduled', label: 'Scheduled' },
	{ value: 'in progress', label: 'In Progress' },
	{ value: 'completed', label: 'Completed' },
];

// Status computed value with getter/setter for v-model binding
const statusValue = computed({
	get() {
		return props.modelValue;
	},
	set(newValue) {
		emit('update:modelValue', newValue);
	},
});

// Custom gradient using CSS variables for consistent theming
const statusGradient = 'linear-gradient(to right, var(--cyan), var(--cyan2), var(--green2), var(--green))';
</script>
