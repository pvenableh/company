<template>
	<div class="ios-search-bar" :class="{ focused: isFocused }">
		<div class="ios-search-field">
			<UIcon name="i-heroicons-magnifying-glass" class="ios-search-icon" />
			<input
				ref="inputRef"
				type="search"
				:value="modelValue"
				:placeholder="placeholder || 'Search'"
				class="ios-search-input"
				@input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
				@focus="isFocused = true"
				@blur="onBlur"
			/>
			<button
				v-if="modelValue"
				class="ios-search-clear"
				@click="clear"
			>
				<UIcon name="i-heroicons-x-circle-solid" class="w-4 h-4" />
			</button>
		</div>
		<Transition name="fade">
			<button v-if="isFocused" class="ios-search-cancel" @click="cancel">
				Cancel
			</button>
		</Transition>
	</div>
</template>

<script setup lang="ts">
defineProps<{
	modelValue?: string;
	placeholder?: string;
}>();

const emit = defineEmits<{
	'update:modelValue': [value: string];
}>();

const inputRef = ref<HTMLInputElement | null>(null);
const isFocused = ref(false);

function clear() {
	emit('update:modelValue', '');
	inputRef.value?.focus();
}

function cancel() {
	emit('update:modelValue', '');
	isFocused.value = false;
	inputRef.value?.blur();
}

function onBlur() {
	// Small delay so cancel click registers
	setTimeout(() => {
		isFocused.value = false;
	}, 150);
}
</script>

<style scoped>
.ios-search-bar {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 8px 16px;
}

.ios-search-field {
	display: flex;
	align-items: center;
	flex: 1;
	height: 36px;
	padding: 0 8px;
	border-radius: 10px;
	background: hsl(var(--muted) / 0.6);
	transition: background 0.2s ease;
}

.ios-search-icon {
	width: 16px;
	height: 16px;
	color: hsl(var(--muted-foreground) / 0.6);
	flex-shrink: 0;
}

.ios-search-input {
	flex: 1;
	border: none;
	background: none;
	outline: none;
	font-size: 17px;
	padding: 0 6px;
	color: hsl(var(--foreground));
	-webkit-appearance: none;
}

.ios-search-input::placeholder {
	color: hsl(var(--muted-foreground) / 0.5);
}

.ios-search-clear {
	display: flex;
	align-items: center;
	justify-content: center;
	background: none;
	border: none;
	cursor: pointer;
	color: hsl(var(--muted-foreground) / 0.5);
	padding: 0;
	-webkit-tap-highlight-color: transparent;
}

.ios-search-cancel {
	font-size: 17px;
	color: hsl(var(--primary));
	background: none;
	border: none;
	cursor: pointer;
	white-space: nowrap;
	-webkit-tap-highlight-color: transparent;
	transition: opacity 0.15s ease;
}

.ios-search-cancel:active {
	opacity: 0.5;
}
</style>
