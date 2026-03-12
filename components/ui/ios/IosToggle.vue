<template>
	<button
		role="switch"
		:aria-checked="modelValue"
		class="ios-toggle"
		:class="{ on: modelValue }"
		@click="toggle"
	>
		<span class="ios-toggle-knob" />
	</button>
</template>

<script setup lang="ts">
const props = defineProps<{
	modelValue: boolean;
}>();

const emit = defineEmits<{
	'update:modelValue': [value: boolean];
}>();

const { triggerHaptic } = useHaptic();

function toggle() {
	triggerHaptic('light');
	emit('update:modelValue', !props.modelValue);
}
</script>

<style scoped>
.ios-toggle {
	position: relative;
	width: 51px;
	height: 31px;
	border-radius: 16px;
	border: none;
	cursor: pointer;
	padding: 2px;
	transition: background 0.3s ease;
	background: hsl(var(--muted-foreground) / 0.2);
	-webkit-tap-highlight-color: transparent;
	flex-shrink: 0;
}

.ios-toggle.on {
	background: hsl(var(--primary));
}

.ios-toggle-knob {
	display: block;
	width: 27px;
	height: 27px;
	border-radius: 50%;
	background: white;
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15), 0 1px 2px rgba(0, 0, 0, 0.1);
	transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.ios-toggle.on .ios-toggle-knob {
	transform: translateX(20px);
}

.ios-toggle:active .ios-toggle-knob {
	width: 31px;
}

.ios-toggle.on:active .ios-toggle-knob {
	transform: translateX(16px);
}
</style>
