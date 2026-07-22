<template>
	<FormSegmentedControl
		v-model="statusValue"
		:options="statuses"
		label="Status"
		:custom-gradient="gradient"
		:animation-duration="animationDuration"
	/>
</template>

<script setup>
const props = defineProps({
	modelValue: {
		type: String,
		required: true,
	},
	animationDuration: {
		type: Number,
		default: 0.3,
	},
});

const emit = defineEmits(['update:modelValue']);

// Same single source of truth the priority bar reads from — Capitalized
// values matching ticketColumns, and a palette-driven lifecycle gradient.
const { statusGradient, statusOptions } = useStatusStyle();

const statuses = [...statusOptions];
const gradient = statusGradient;

const statusValue = computed({
	get() {
		return props.modelValue;
	},
	set(newValue) {
		emit('update:modelValue', newValue);
	},
});
</script>
