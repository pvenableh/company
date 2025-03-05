<template>
	<div class="relative w-1/3">
		<UFormGroup label="Priority:">
			<URange v-model="priorityValue" :max="rangeMax" :step="1" :color="color" />
			<div class="absolute -top-[27px] left-[80px]">
				<p class="uppercase text-[12px] inline-block tracking-wide font-bold" :style="{ color: color }">
					{{ priorities[priorityValue].label }}
				</p>
			</div>
		</UFormGroup>
	</div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
	modelValue: {
		type: String,
		required: true,
	},
});

const emit = defineEmits(['update:modelValue']);

const priorities = [
	{ value: 'low', label: 'Low', icon: '😎👍' },
	{ value: 'medium', label: 'Medium', icon: '👀💪' },
	{ value: 'high', label: 'High', icon: '🙀❗️' },
];

const priorityLevels = ['Low', 'Medium', 'High'];

const priorityValue = computed({
	get() {
		// Find the index of the *capitalized* version in priorityLevels
		const capitalizedPriority = priorities.find((p) => p.value === props.modelValue)?.label || 'Low'; // Default to Low if not found
		return priorityLevels.indexOf(capitalizedPriority);
	},
	set(newValue) {
		// Get the lowercase value from the priorities array
		emit('update:modelValue', priorities[newValue].value);
	},
});

const color = computed(() => {
	switch (priorityLevels[priorityValue.value]) {
		case 'Low':
			return 'gray';
		case 'Medium':
			return 'orange';
		case 'High':
			return 'red';
		default:
			return 'gray';
	}
});

const rangeMax = priorityLevels.length - 1;
</script>
