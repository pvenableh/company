<script setup lang="ts">
/**
 * AppRail — top-level navigation rail for Apps Layout mode.
 *
 * Lists the 5 apps (Clients / Work / Money / Marketing / Organization)
 * as icon+label buttons. Active app is highlighted via `useRoute()`'s
 * leading path segment. Position respects `useAppsMode().railPosition`:
 *
 *   left     → vertical column on the left
 *   right    → vertical column on the right
 *   top      → horizontal strip below the header
 *   bottom   → horizontal strip pinned to the bottom (forced on mobile)
 *   floating → bottom-center pill, position: fixed, glass + shadow
 *
 * Phase 7 added bottom + floating; both are picker-selectable from the
 * apps shell chrome via LayoutAppRailPositionPicker.
 */

const APPS = [
	{ id: 'clients', name: 'Clients', icon: 'lucide:users', to: '/apps/clients' },
	{ id: 'work', name: 'Work', icon: 'lucide:briefcase', to: '/apps/work' },
	{ id: 'money', name: 'Money', icon: 'lucide:wallet', to: '/apps/money' },
	{ id: 'marketing', name: 'Marketing', icon: 'lucide:megaphone', to: '/apps/marketing' },
	{ id: 'organization', name: 'Organization', icon: 'lucide:building-2', to: '/apps/organization' },
] as const;

const route = useRoute();
const { railPosition } = useAppsMode();

const activeId = computed(() => {
	const seg = route.path.split('/').filter(Boolean);
	if (seg[0] !== 'apps') return null;
	return APPS.find((a) => a.id === seg[1])?.id ?? null;
});

const isHorizontal = computed(() => railPosition.value === 'top' || railPosition.value === 'bottom');
</script>

<template>
	<nav
		class="app-rail"
		:class="[
			`app-rail--${railPosition}`,
			isHorizontal ? 'app-rail--horizontal' : 'app-rail--vertical',
		]"
		aria-label="Apps"
	>
		<NuxtLink
			v-for="app in APPS"
			:key="app.id"
			:to="app.to"
			class="app-rail__item"
			:class="{ 'app-rail__item--active': activeId === app.id }"
		>
			<Icon :name="app.icon" class="app-rail__icon" />
			<span class="app-rail__label">{{ app.name }}</span>
		</NuxtLink>
	</nav>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.app-rail {
	@apply flex bg-background border-border/40 select-none;
}

.app-rail--vertical {
	@apply flex-col gap-1 p-2 w-20 shrink-0;
}

.app-rail--left {
	@apply border-r;
}

.app-rail--right {
	@apply border-l;
}

.app-rail--horizontal {
	@apply flex-row gap-1 px-2 py-1.5 w-full overflow-x-auto justify-center;
}

.app-rail--top {
	@apply border-b;
}

.app-rail--bottom {
	@apply border-t pb-[env(safe-area-inset-bottom)];
}

.app-rail--floating {
	@apply fixed left-1/2 -translate-x-1/2
		bottom-4 sm:bottom-6
		rounded-full border border-border/40 shadow-xl
		flex-row gap-0.5 px-1.5 py-1 w-auto z-40
		bg-background/85 backdrop-blur-md;
	bottom: calc(1rem + env(safe-area-inset-bottom));
}

.app-rail--floating .app-rail__item {
	@apply flex-row gap-1 rounded-full px-2.5 py-1 text-xs;
}

.app-rail--floating .app-rail__icon {
	@apply size-3.5;
}

.app-rail--floating .app-rail__label {
	@apply normal-case tracking-normal text-[11px];
}

.app-rail__item {
	@apply flex flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors;
}

.app-rail--horizontal .app-rail__item {
	@apply flex-row gap-1.5 px-3 py-1.5 text-sm;
}

.app-rail__item--active {
	@apply bg-primary/10 text-primary;
}

.app-rail__icon {
	@apply size-5 shrink-0;
}

.app-rail--horizontal .app-rail__icon {
	@apply size-4;
}

.app-rail__label {
	@apply text-[10px] uppercase tracking-wider font-medium leading-none;
}

.app-rail--horizontal .app-rail__label {
	@apply text-xs normal-case tracking-normal;
}
</style>
