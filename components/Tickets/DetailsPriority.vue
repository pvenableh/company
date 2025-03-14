<template>
	<FormSegmentedControl
		v-model="priorityValue"
		:options="priorities"
		label="Priority"
		:custom-gradient="priorityGradient"
	/>
</template>

<script setup>
const props = defineProps({
	modelValue: {
		type: String,
		required: true,
	},
});

const emit = defineEmits(['update:modelValue']);

// Define our priority levels with values and labels
const priorities = [
	{ value: 'low', label: 'Low' },
	{ value: 'medium', label: 'Medium' },
	{ value: 'high', label: 'High' },
];

// Priority computed value with getter/setter for v-model binding
const priorityValue = computed({
	get() {
		return props.modelValue;
	},
	set(newValue) {
		emit('update:modelValue', newValue);
	},
});

// Single gradient that will be revealed progressively
const priorityGradient = 'linear-gradient(to right, var(--lightGrey), var(--cyan), var(--red)';
</script>
