<template>
	<svg
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		:class="props.class"
	>
		<!-- Placeholder: replace with your custom Earnest brand icon SVG paths -->
		<circle cx="12" cy="12" r="10" />
		<path d="M9 8h6M9 12h4M9 16h6" />
	</svg>
</template>

<script setup lang="ts">
const props = defineProps<{
	class?: string;
}>();
</script>
