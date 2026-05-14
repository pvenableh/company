<script setup lang="ts">
/**
 * AppHeader — per-app top strip.
 *
 * Slots:
 *   default → page/section title
 *   actions → right-side controls (e.g. "+ New", filters)
 *
 * Pass `:show-back="true"` on detail/sub-pages to render an iOS-style
 * back chevron + previous-screen-name. Landing pages (e.g.
 * /apps/clients/index.vue) leave it off so the rail itself is the
 * top-level way-finding.
 *
 * The back behaviour is intentionally generic — Phase 1 just calls
 * `router.back()`. Phase 2+ apps may want app-scoped history (e.g. an
 * in-app stack); revisit then.
 */

const router = useRouter();
const route = useRoute();
// `useCurrentAccent` dispatches between `useAppAccent` (for /apps/*)
// and `usePortalAccent` (for /portal/*) so this header looks/feels
// identical in both shells without duplicating the component.
const { accent } = useCurrentAccent();

const props = withDefaults(
	defineProps<{
		title?: string;
		backLabel?: string;
		/**
		 * Show the iOS-style back chevron. Landing pages omit it.
		 */
		showBack?: boolean;
	}>(),
	{
		showBack: false,
	},
);

function goBack() {
	router.back();
}

const fallbackBackLabel = computed(() => {
	if (accent.value) return accent.value.name;
	const seg = route.path.split('/').filter(Boolean);
	// Recognise both /apps/<id> and /portal/<id> as "<Id>".
	if ((seg[0] === 'apps' || seg[0] === 'portal') && seg.length >= 2) {
		const appId = seg[1];
		return appId ? appId.charAt(0).toUpperCase() + appId.slice(1) : 'Back';
	}
	return 'Back';
});
</script>

<template>
	<header class="app-header">
		<div class="app-header__inner">
			<div class="app-header__left">
				<button
					v-if="showBack"
					type="button"
					class="app-header__back"
					@click="goBack"
				>
					<Icon name="lucide:chevron-left" class="size-4" />
					<span class="hidden sm:inline">{{ backLabel ?? fallbackBackLabel }}</span>
				</button>
				<span
					v-if="accent && !showBack"
					class="app-header__accent-icon"
					aria-hidden="true"
				>
					<span class="app-header__accent-glyph">
						<Icon :name="accent.icon" class="app-header__accent-layer app-header__accent-base" />
						<span class="app-header__accent-layer app-header__accent-highlight-mask">
							<Icon :name="accent.icon" class="app-header__accent-highlight" />
						</span>
					</span>
				</span>
				<h1 v-if="title || $slots.default" class="app-header__title">
					<slot>{{ title }}</slot>
				</h1>
			</div>
			<div v-if="$slots.actions" class="app-header__actions">
				<slot name="actions" />
			</div>
		</div>
	</header>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

/* Bar background + bottom border span the full width; the inner container
 * is constrained + padded to the same max-w/p- as LayoutPageContainer so
 * the title aligns vertically with the page content below it. The extra
 * pt-5 pushes the title down from the layout chrome above. */
.app-header {
	@apply relative shrink-0 border-b border-border/40 bg-background z-30;
}

.app-header__inner {
	@apply flex items-center justify-between gap-3
		max-w-7xl mx-auto w-full
		px-4 md:px-6 pt-5 pb-4;
}

.app-header__left {
	@apply flex items-center gap-2 min-w-0;
}

.app-header__back {
	@apply flex items-center gap-1 text-muted-foreground hover:text-foreground text-sm transition-colors -ml-1 px-1.5 py-1 rounded-md hover:bg-muted/40;
}

/* Small app-accent chip echoing the rail's at-rest tile — light tinted
 * bg + colored icon. Same iOS-app-icon proportion (~22% corner radius)
 * so the header chip reads as a smaller member of the rail family. */
.app-header__accent-icon {
	@apply inline-flex items-center justify-center shrink-0;
	position: relative;
	width: 24px;
	height: 24px;
	border-radius: 5px;
	background: hsl(var(--app-accent-h, 220) var(--app-accent-s, 10%) var(--app-accent-l, 48%) / 0.15);
}

/* Sheen overlay from the previous rich treatment is no longer used —
 * keep the rule so the ::after pseudo-element stays inert. */
.app-header__accent-icon::after {
	display: none;
}

/* Single-layer icon glyph in the accent's true colour. Dual-layer
 * highlight markup is kept (hidden via CSS) so the richer treatment
 * can be restored later without touching the template. */
.app-header__accent-glyph {
	position: relative;
	display: inline-block;
	width: 14px;
	height: 14px;
	z-index: 2;
}

.app-header__accent-layer {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	display: block;
}

.app-header__accent-base {
	color: hsl(var(--app-accent-h, 220) var(--app-accent-s, 10%) var(--app-accent-l, 48%));
	z-index: 0;
}

.app-header__accent-highlight-mask {
	display: none;
}

.app-header__title {
	@apply text-base font-semibold truncate;
}

.app-header__actions {
	@apply flex items-center gap-1.5 shrink-0;
}
</style>
