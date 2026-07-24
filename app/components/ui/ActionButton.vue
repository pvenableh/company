<template>
	<button
		class="ui-action-button inline-flex items-center rounded-full border border-border text-xs font-medium transition-[colors,transform] duration-150"
		:class="[variantClasses, sizeClasses]"
		:disabled="disabled || loading"
		:title="title"
		:aria-label="title"
		@click="$emit('click', $event)"
	>
		<Icon v-if="loading" name="lucide:loader-2" class="w-3.5 h-3.5 animate-spin" />
		<EarnestIcon v-else-if="icon === 'earnest'" class="w-3.5 h-3.5" />
		<Icon v-else-if="icon" :name="icon" class="w-3.5 h-3.5" />
		<span v-if="$slots.default" :class="labelClass">
			<slot />
		</span>
		<!-- Spend marker: kept OUTSIDE the label span so it stays visible even
		     when the label is hidden (icon-only), signalling this action draws
		     from the AI token balance. Opt-in via `spend`. -->
		<AiSpendMark v-if="spend && !loading" muted />
	</button>
</template>

<script setup lang="ts">
const props = defineProps<{
	icon?: string;
	variant?: 'default' | 'primary' | 'destructive';
	loading?: boolean;
	disabled?: boolean;
	/** Hide the label responsively: 'sm'/'md' below that breakpoint, 'always' for icon-only. */
	hideLabel?: string;
	/** Native tooltip + accessible name — set this whenever the label may be hidden. */
	title?: string;
	/** Show the AI token-spend marker (this action makes an LLM call). */
	spend?: boolean;
	/**
	 * Height/padding preset. `sm` (default) is the T3 pill (h-7 px-2.5). `md`
	 * (h-8 px-3, wider gap) matches the h-8 filter pills / shadcn Select
	 * triggers so this button lines up when placed in a filter/control row.
	 */
	size?: 'sm' | 'md';
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

const sizeClasses = computed(() => (props.size === 'md' ? 'gap-1.5 h-8 px-3' : 'gap-1 h-7 px-2.5'));

const labelClass = computed(() => {
	if (props.hideLabel === 'sm') return 'hidden sm:inline';
	if (props.hideLabel === 'md') return 'hidden md:inline';
	if (props.hideLabel === 'always') return 'hidden';
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
