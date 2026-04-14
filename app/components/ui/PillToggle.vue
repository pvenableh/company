<template>
	<div class="inline-flex items-center gap-1 rounded-xl bg-muted/50 p-1 border border-border w-fit">
		<button
			v-for="option in options"
			:key="option.value"
			class="flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] uppercase tracking-wider font-semibold transition-all duration-200 whitespace-nowrap"
			:class="modelValue === option.value
				? 'bg-card text-foreground shadow-sm'
				: 'text-muted-foreground hover:text-foreground'"
			@click="$emit('update:modelValue', option.value)"
		>
			<Icon
				v-if="option.icon"
				:name="option.icon"
				class="size-4"
			/>
			{{ option.label }}
		</button>
	</div>
</template>

<script setup lang="ts">
export interface PillToggleOption {
	value: string;
	label: string;
	icon?: string;
}

defineProps<{
	modelValue: string;
	options: PillToggleOption[];
}>();

defineEmits<{
	'update:modelValue': [value: string];
}>();
</script>
