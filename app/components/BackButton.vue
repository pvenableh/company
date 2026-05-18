<script setup lang="ts">
const props = defineProps<{
	to?: string;
	label?: string;
}>();

const router = useRouter();

const handleClick = () => {
	if (props.to) {
		navigateTo(props.to);
	} else {
		router.back();
	}
};
</script>

<template>
	<button
		class="back-btn"
		@click="handleClick"
	>
		<UIcon name="i-heroicons-chevron-left" class="back-btn-icon" />
		<span v-if="label" class="back-btn-label">{{ label }}</span>
	</button>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

/* Matches the uppercase 10px convention used on AppHeader, invoice/contract
   detail pages, and the apps-clients sub-pages — so every "back to X" anchor
   looks the same across the project. */
.back-btn {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 4px 8px 4px 4px;
	border-radius: 8px;
	background: transparent;
	border: none;
	color: hsl(var(--muted-foreground));
	font-size: 10px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.05em;
	cursor: pointer;
	transition: color 0.15s, background 0.15s;
	-webkit-tap-highlight-color: transparent;
}

.back-btn:hover {
	color: hsl(var(--foreground));
	background: hsl(var(--muted) / 0.5);
}

.back-btn:active {
	transform: scale(0.97);
}

.back-btn-icon {
	width: 12px;
	height: 12px;
	flex-shrink: 0;
}

.back-btn-label {
	line-height: 1;
	white-space: nowrap;
}
</style>
