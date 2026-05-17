<!--
  AppSlideOverShell — shared chrome for any panel rendered inside
  `AppSlideOverStack`.

  Renders a sticky header (back chevron when stacked deeper than 1, X
  close otherwise) + scrollable body + optional sticky footer. Panels
  only need to declare their title, optional subtitle, and content —
  positioning, animation, and focus management live on the stack.

  Panels render *inside* a transformed container, so anything fixed-
  positioned inside the body will not behave like a viewport overlay.
  Keep modals/popovers that need viewport-level positioning out of the
  panel body — push them up to the page instead.
-->
<script setup lang="ts">
import { Icon } from '#components';

defineProps<{
	title?: string | null;
	subtitle?: string | null;
}>();

defineEmits<{
	(e: 'close'): void;
}>();

const { depth } = useAppSlideOverStack();

// Back chevron when there's a panel beneath, X close when this panel
// IS the stack's bottom. iOS convention: chevron only points back if
// pressing it reveals something prior.
const isBack = computed(() => depth.value > 1);
</script>

<template>
	<div class="app-slide-over-shell">
		<header class="app-slide-over-shell__header">
			<!-- Back/close row — matches AppHeader's back-button style
			     (small uppercase) so the chrome reads as one navigation
			     family across full-page detail surfaces and slide-overs. -->
			<div class="app-slide-over-shell__nav-row">
				<button
					type="button"
					class="app-slide-over-shell__back"
					:aria-label="isBack ? 'Back' : 'Close'"
					@click="$emit('close')"
				>
					<Icon :name="isBack ? 'lucide:chevron-left' : 'lucide:x'" class="size-3.5" />
					<span>{{ isBack ? 'Back' : 'Close' }}</span>
				</button>
			</div>

			<div class="app-slide-over-shell__title-row">
				<div class="app-slide-over-shell__heading">
					<h2 v-if="title" class="app-slide-over-shell__title">{{ title }}</h2>
					<p v-if="subtitle" class="app-slide-over-shell__subtitle">{{ subtitle }}</p>
				</div>

				<div v-if="$slots.actions" class="app-slide-over-shell__actions">
					<slot name="actions" />
				</div>
			</div>
		</header>

		<div class="app-slide-over-shell__body">
			<slot />
		</div>

		<footer v-if="$slots.footer" class="app-slide-over-shell__footer">
			<slot name="footer" />
		</footer>
	</div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.app-slide-over-shell {
	display: flex;
	flex-direction: column;
	height: 100%;
	min-height: 0;
	background: hsl(var(--background));
}

.app-slide-over-shell__header {
	display: flex;
	flex-direction: column;
	gap: 0.375rem;
	padding: 0.5rem 1.25rem 0.875rem;
	border-bottom: 1px solid hsl(var(--border) / 0.4);
	background: hsl(var(--background) / 0.92);
	backdrop-filter: blur(8px);
	position: relative;
	flex-shrink: 0;
}

.app-slide-over-shell__nav-row {
	display: flex;
	align-items: center;
}

.app-slide-over-shell__title-row {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 0.5rem;
}

/* Match the AppSlideOver accent stripe so panels rendered inside the
 * stack still read as part of the same app. The stripe pulls colour
 * from the global --app-accent-* vars set on the layout. */
.app-slide-over-shell__header::before {
	content: '';
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	height: 2px;
	background: linear-gradient(
		90deg,
		hsl(var(--app-accent-h, 220) var(--app-accent-s, 10%) var(--app-accent-l, 48%)) 0%,
		hsl(var(--app-accent-h, 220) var(--app-accent-s, 10%) calc(var(--app-accent-l, 48%) + 12%)) 100%
	);
	opacity: 0.7;
	pointer-events: none;
}

/* Back/close button — matches `.app-header__back` so a slide-over
 * reads as part of the same navigation family as a full-page header
 * (small uppercase, chevron or X depending on stack depth). */
.app-slide-over-shell__back {
	display: inline-flex;
	align-items: center;
	gap: 0.25rem;
	margin-left: -0.375rem;
	padding: 0.25rem 0.5rem;
	border-radius: 0.375rem;
	color: hsl(var(--muted-foreground));
	font-size: 11px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.06em;
	transition: background 120ms ease, color 120ms ease;
}

.app-slide-over-shell__back:hover {
	background: hsl(var(--muted) / 0.4);
	color: hsl(var(--foreground));
}

.app-slide-over-shell__heading {
	min-width: 0;
}

.app-slide-over-shell__title {
	font-size: 0.9375rem;
	font-weight: 600;
	line-height: 1.2;
	color: hsl(var(--foreground));
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.app-slide-over-shell__subtitle {
	font-size: 0.75rem;
	color: hsl(var(--muted-foreground));
	margin-top: 1px;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.app-slide-over-shell__actions {
	display: flex;
	align-items: center;
	gap: 0.25rem;
}

.app-slide-over-shell__body {
	flex: 1 1 auto;
	min-height: 0;
	overflow-y: auto;
	padding: 1rem 1.25rem 1.5rem;
}

.app-slide-over-shell__footer {
	flex-shrink: 0;
	padding: 0.75rem 1.25rem;
	border-top: 1px solid hsl(var(--border) / 0.4);
	background: hsl(var(--background) / 0.92);
	backdrop-filter: blur(8px);
}
</style>
