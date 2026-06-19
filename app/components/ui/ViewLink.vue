<template>
	<!--
		Canonical "see more" navigation link: UPPERCASE label + trailing chevron.
		This is the single source of truth for the inline nav-link style — use it
		instead of hand-rolling `<NuxtLink>…→</NuxtLink>` markup. Never use a unicode
		arrow (→/›/»); always the chevron icon.

		Renders a <NuxtLink> when `to` is provided, otherwise a <button> (forwards
		clicks via the parent's @click). Extra classes/attrs fall through to the root.
	-->
	<component
		:is="to ? NuxtLink : 'button'"
		:to="to || undefined"
		:type="to ? undefined : 'button'"
		class="ui-view-link inline-flex items-center gap-0.5 font-medium uppercase tracking-wide transition-colors group/vl"
		:class="[sizeClass, variantClass]"
	>
		<span><slot>{{ label }}</slot></span>
		<UIcon
			name="i-heroicons-chevron-right"
			class="shrink-0 transition-transform group-hover/vl:translate-x-0.5"
			:class="chevronSize"
		/>
	</component>
</template>

<script setup lang="ts">
import { NuxtLink } from '#components';

const props = withDefaults(
	defineProps<{
		to?: string;
		label?: string;
		variant?: 'primary' | 'muted';
		size?: 'xs' | 'sm';
	}>(),
	{ variant: 'primary', size: 'xs' },
);

const sizeClass = computed(() => (props.size === 'sm' ? 'text-[11px]' : 'text-[10px]'));
const chevronSize = computed(() => (props.size === 'sm' ? 'w-3.5 h-3.5' : 'w-3 h-3'));
const variantClass = computed(() =>
	props.variant === 'muted'
		? 'text-muted-foreground hover:text-foreground'
		: 'text-primary hover:text-primary/80',
);
</script>
