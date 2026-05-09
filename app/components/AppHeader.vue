<script setup lang="ts">
/**
 * AppHeader — per-app top strip.
 *
 * Slots:
 *   default → page/section title
 *   actions → right-side controls (e.g. "+ New", filters)
 *
 * Auto-renders an iOS-style back chevron + previous-screen-name when
 * the router has navigation history within the current app. Top-level
 * app landing pages omit the chevron.
 *
 * The back behaviour is intentionally generic — Phase 1 just calls
 * `router.back()`. Phase 2+ apps may want app-scoped history (e.g. an
 * in-app stack); revisit then.
 */

const router = useRouter();
const route = useRoute();

const props = defineProps<{
	title?: string;
	backLabel?: string;
}>();

const canGoBack = ref(false);

onMounted(() => {
	if (typeof window !== 'undefined' && window.history) {
		canGoBack.value = window.history.length > 1;
	}
});

function goBack() {
	router.back();
}

const fallbackBackLabel = computed(() => {
	const seg = route.path.split('/').filter(Boolean);
	if (seg[0] === 'apps' && seg.length >= 2) {
		const appId = seg[1];
		return appId ? appId.charAt(0).toUpperCase() + appId.slice(1) : 'Back';
	}
	return 'Back';
});
</script>

<template>
	<header class="app-header">
		<div class="app-header__left">
			<button
				v-if="canGoBack"
				type="button"
				class="app-header__back"
				@click="goBack"
			>
				<Icon name="lucide:chevron-left" class="size-4" />
				<span class="hidden sm:inline">{{ backLabel ?? fallbackBackLabel }}</span>
			</button>
			<h1 v-if="title || $slots.default" class="app-header__title">
				<slot>{{ title }}</slot>
			</h1>
		</div>
		<div v-if="$slots.actions" class="app-header__actions">
			<slot name="actions" />
		</div>
	</header>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.app-header {
	@apply flex items-center justify-between gap-3 px-4 sm:px-6 h-12 shrink-0 border-b border-border/40 bg-background z-30;
}

.app-header__left {
	@apply flex items-center gap-2 min-w-0;
}

.app-header__back {
	@apply flex items-center gap-1 text-muted-foreground hover:text-foreground text-sm transition-colors -ml-1 px-1.5 py-1 rounded-md hover:bg-muted/40;
}

.app-header__title {
	@apply text-base font-semibold truncate;
}

.app-header__actions {
	@apply flex items-center gap-1.5 shrink-0;
}
</style>
