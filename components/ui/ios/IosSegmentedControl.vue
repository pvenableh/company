<template>
	<div class="ios-segmented" role="tablist">
		<button
			v-for="(option, index) in options"
			:key="option.value"
			role="tab"
			:aria-selected="modelValue === option.value"
			class="ios-segmented-button"
			:class="{ active: modelValue === option.value }"
			@click="select(option.value)"
		>
			{{ option.label }}
		</button>
		<div
			class="ios-segmented-indicator"
			:style="indicatorStyle"
		/>
	</div>
</template>

<script setup lang="ts">
interface Option {
	label: string;
	value: string;
}

const props = defineProps<{
	options: Option[];
	modelValue: string;
}>();

const emit = defineEmits<{
	'update:modelValue': [value: string];
}>();

const { triggerHaptic } = useHaptic();

const select = (value: string) => {
	if (value !== props.modelValue) {
		triggerHaptic('light');
		emit('update:modelValue', value);
	}
};

const indicatorStyle = computed(() => {
	const idx = props.options.findIndex((o) => o.value === props.modelValue);
	const width = 100 / props.options.length;
	return {
		width: `${width}%`,
		transform: `translateX(${idx * 100}%)`,
	};
});
</script>

<style scoped>
.ios-segmented {
	position: relative;
	display: flex;
	padding: 2px;
	border-radius: 9px;
	background: hsl(var(--muted) / 0.6);
	overflow: hidden;
}

.ios-segmented-button {
	position: relative;
	z-index: 1;
	flex: 1;
	padding: 7px 12px;
	font-size: 13px;
	font-weight: 500;
	text-align: center;
	color: hsl(var(--foreground));
	background: none;
	border: none;
	cursor: pointer;
	transition: color 0.2s ease;
	-webkit-tap-highlight-color: transparent;
	white-space: nowrap;
}

.ios-segmented-button.active {
	color: hsl(var(--foreground));
}

.ios-segmented-indicator {
	position: absolute;
	top: 2px;
	left: 2px;
	height: calc(100% - 4px);
	border-radius: 7px;
	background: hsl(var(--card));
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06);
	transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
	z-index: 0;
}
</style>
