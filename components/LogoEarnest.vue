<template>
	<span class="earnest-wordmark" :class="[sizeClass]">
		<span class="earnest-wordmark__text">Earnest</span><span class="earnest-wordmark__period">.</span>
	</span>
</template>

<script setup lang="ts">
const props = defineProps<{
	size?: 'sm' | 'md' | 'lg' | 'xl';
}>();

const sizeClass = computed(() => {
	switch (props.size) {
		case 'sm':
			return 'earnest-sm';
		case 'lg':
			return 'earnest-lg';
		case 'xl':
			return 'earnest-xl';
		default:
			return 'earnest-md';
	}
});
</script>

<style scoped>
.earnest-wordmark {
	display: inline-flex;
	align-items: baseline;
	font-weight: 600;
	letter-spacing: -0.02em;
	line-height: 1;
	color: currentColor;
	user-select: none;
	transition: opacity 0.2s ease;
}

.earnest-wordmark__text {
	font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto,
		Helvetica, Arial, sans-serif;
}

.earnest-wordmark__period {
	color: hsl(var(--primary));
	font-weight: 700;
}

/* Sizes */
.earnest-sm {
	font-size: 1rem;
}
.earnest-md {
	font-size: 1.375rem;
}
.earnest-lg {
	font-size: 1.75rem;
}
.earnest-xl {
	font-size: 2.5rem;
}
</style>
