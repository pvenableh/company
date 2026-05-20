<template>
	<button
		class="ui-action-button inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-border text-xs font-medium transition-[colors,transform] duration-150"
		:class="variantClasses"
		:disabled="disabled || loading"
		@click="$emit('click', $event)"
	>
		<Icon v-if="loading" name="lucide:loader-2" class="w-3.5 h-3.5 animate-spin" />
		<EarnestIcon v-else-if="icon === 'earnest'" class="w-3.5 h-3.5" />
		<Icon v-else-if="icon" :name="icon" class="w-3.5 h-3.5" />
		<span v-if="$slots.default" :class="labelClass">
			<slot />
		</span>
	</button>
</template>

<script setup lang="ts">
const props = defineProps<{
	icon?: string;
	variant?: 'default' | 'primary' | 'destructive';
	loading?: boolean;
	disabled?: boolean;
	hideLabel?: string;
}>();

defineEmits<{
	click: [event: MouseEvent];
}>();

const variantClasses = computed(() => {
	switch (props.variant) {
		case 'primary':
			return 'text-primary hover:bg-primary/10 hover:border-primary/30';
		case 'destructive':
			return 'text-destructive hover:bg-destructive/10 hover:border-destructive/30';
		default:
			return 'text-foreground hover:bg-muted/50 hover:border-primary/30';
	}
});

const labelClass = computed(() => {
	if (props.hideLabel === 'sm') return 'hidden sm:inline';
	if (props.hideLabel === 'md') return 'hidden md:inline';
	return '';
});
</script>

<style scoped>
/* iOS press-down: brief scale snap on active. Faster than the iOS spring
 * (which is reserved for positional moves); 120ms ease feels like a real
 * tap. :disabled excluded so disabled buttons don't appear to react.
 * No hover-translate here — desktop hover + touch active would conflict. */
.ui-action-button:not(:disabled):active {
	transform: scale(0.96);
	transition-duration: 120ms;
}
</style>
