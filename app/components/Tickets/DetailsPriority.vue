<template>
	<FormSegmentedControl
		v-model="priorityValue"
		:options="priorities"
		label="Priority"
		:custom-gradient="gradient"
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

const { priorityGradient, priorityOptions } = useStatusStyle();

const priorities = [...priorityOptions];
const gradient = priorityGradient;

const priorityValue = computed({
	get() {
		return props.modelValue;
	},
	set(newValue) {
		emit('update:modelValue', newValue);
	},
});
</script>
