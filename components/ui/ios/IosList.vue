<template>
	<div class="ios-list" :class="{ 'ios-list-inset': inset }">
		<div v-if="$slots.header" class="ios-list-header">
			<slot name="header" />
		</div>
		<div class="ios-list-group">
			<slot />
		</div>
		<div v-if="$slots.footer" class="ios-list-footer">
			<slot name="footer" />
		</div>
	</div>
</template>

<script setup lang="ts">
defineProps<{
	inset?: boolean;
}>();
</script>

<style scoped>
@reference "~/assets/css/tailwind.css";

.ios-list {
	margin: 0;
}

.ios-list-inset {
	margin: 0 16px;
}

.ios-list-header {
	padding: 0 16px 6px;
	font-size: 13px;
	text-transform: uppercase;
	letter-spacing: 0.02em;
	color: hsl(var(--muted-foreground));
}

.ios-list-inset .ios-list-header {
	padding-left: 0;
}

.ios-list-group {
	background: hsl(var(--card));
	overflow: hidden;
}

.ios-list-inset .ios-list-group {
	border-radius: 12px;
}

:not(.ios-list-inset) > .ios-list-group {
	border-top: 0.5px solid hsl(var(--border) / 0.5);
	border-bottom: 0.5px solid hsl(var(--border) / 0.5);
}

.ios-list-footer {
	padding: 6px 16px 0;
	font-size: 13px;
	color: hsl(var(--muted-foreground));
}

.ios-list-inset .ios-list-footer {
	padding-left: 0;
}
</style>
