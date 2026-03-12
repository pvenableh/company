<template>
	<div class="ios-page-header">
		<div class="ios-page-header-top" v-if="$slots.actions || backTo">
			<nuxt-link v-if="backTo" :to="backTo" class="ios-back-link" @click="triggerHaptic('light')">
				<UIcon name="i-heroicons-chevron-left" class="w-5 h-5" />
				<span>{{ backLabel || 'Back' }}</span>
			</nuxt-link>
			<div v-else />
			<div class="ios-page-header-actions">
				<slot name="actions" />
			</div>
		</div>
		<h1 class="ios-large-title" :class="{ 'ios-large-title-compact': compact }">
			<slot>{{ title }}</slot>
		</h1>
		<p v-if="subtitle" class="ios-page-subtitle">{{ subtitle }}</p>
	</div>
</template>

<script setup lang="ts">
defineProps<{
	title?: string;
	subtitle?: string;
	backTo?: string;
	backLabel?: string;
	compact?: boolean;
}>();

const { triggerHaptic } = useHaptic();
</script>

<style scoped>
.ios-page-header {
	padding: 8px 16px 12px;
}

.ios-page-header-top {
	display: flex;
	align-items: center;
	justify-content: space-between;
	min-height: 28px;
	margin-bottom: 4px;
}

.ios-back-link {
	display: flex;
	align-items: center;
	gap: 2px;
	font-size: 17px;
	color: hsl(var(--primary));
	text-decoration: none;
	-webkit-tap-highlight-color: transparent;
	transition: opacity 0.15s ease;
}

.ios-back-link:active {
	opacity: 0.5;
}

.ios-page-header-actions {
	display: flex;
	align-items: center;
	gap: 8px;
}

.ios-large-title {
	font-size: 34px;
	font-weight: 700;
	letter-spacing: -0.02em;
	line-height: 1.1;
	color: hsl(var(--foreground));
}

.ios-large-title-compact {
	font-size: 28px;
}

.ios-page-subtitle {
	font-size: 15px;
	color: hsl(var(--muted-foreground));
	margin-top: 4px;
}
</style>
