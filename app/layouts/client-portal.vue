<template>
	<component :is="activeShell">
		<slot />
	</component>
</template>

<script setup lang="ts">
/**
 * client-portal layout — reactive wrapper that picks the right shell.
 *
 * Mirrors `app/layouts/default.vue`'s `<component :is="activeLayoutComponent">`
 * pattern so the portal honours the same per-user Apps-vs-Classic preference
 * as the staff side, without duplicating the layout selection across every
 * portal page's `definePageMeta`.
 *
 *   - apps     → LayoutPortalAppsShell    (rail + chrome — current default)
 *   - classic  → LayoutPortalClassicShell (flat sidebar + chrome)
 *
 * Pages opt into this wrapper with `definePageMeta({ layout: 'client-portal' })`.
 * Switching at runtime (e.g. via the user menu's "Use Apps Layout" toggle)
 * reactively swaps the inner shell — no navigation required.
 */
const { mode } = useAppsMode();

const activeShell = computed(() =>
	mode.value === 'classic'
		? resolveComponent('LayoutPortalClassicShell')
		: resolveComponent('LayoutPortalAppsShell'),
);
</script>
