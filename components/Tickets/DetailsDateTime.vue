<template>
	<UFormGroup label="Due Date">
		<UInput
			type="datetime-local"
			:model-value="localValue"
			@update:model-value="handleUpdate"
		/>
	</UFormGroup>
</template>

<script setup>
const props = defineProps({
	modelValue: {
		type: String,
		default: '',
	},
});

const emit = defineEmits(['update:modelValue']);

const localValue = computed(() => {
	if (!props.modelValue) return '';
	// Convert ISO string to datetime-local format (YYYY-MM-DDTHH:mm)
	try {
		const date = new Date(props.modelValue);
		if (isNaN(date.getTime())) return '';
		const pad = (n) => String(n).padStart(2, '0');
		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
	} catch {
		return '';
	}
});

const handleUpdate = (value) => {
	if (!value) {
		emit('update:modelValue', '');
		return;
	}
	// Convert datetime-local value back to ISO string
	const date = new Date(value);
	if (!isNaN(date.getTime())) {
		emit('update:modelValue', date.toISOString());
	}
};
</script>
