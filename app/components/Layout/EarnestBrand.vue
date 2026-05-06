<script setup lang="ts">
defineProps<{
	tagline?: string;
	to?: string;
	retracted?: boolean;
}>();
</script>

<template>
	<component
		:is="to ? 'NuxtLink' : 'div'"
		:to="to"
		class="earnest-brand"
		:class="{ 'earnest-brand--retracted': retracted }"
	>
		<LogoEarnest size="md" />
		<span v-if="tagline" class="earnest-brand__tagline">{{ tagline }}</span>
	</component>
</template>

<style scoped>
.earnest-brand {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	transform: scale(1);
	transform-origin: center center;
	transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.earnest-brand--retracted {
	transform: scale(0.78);
}

.earnest-brand__tagline {
	font-family: var(--font-signature);
	font-size: 11px;
	line-height: 1;
	letter-spacing: 0.02em;
	color: hsl(var(--muted-foreground));
	margin-top: 1px;
}
</style>
