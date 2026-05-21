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
import type { FlipFromPayload } from '~/composables/useFlipFromRow';

const props = defineProps<{
	title?: string | null;
	subtitle?: string | null;
	/**
	 * Pull-from-anywhere FLIP source. When set, the shell mounts a fixed-
	 * position ghost (innerHTML = flipFrom.html) at the source rect,
	 * animates it to the `#hero` slot's measured position via inline-style
	 * transform + CSS transition (400ms iOS spring), then cross-fades into
	 * the hero. Compositor-only — no GSAP ticker, no Vue Transition class
	 * swap. See [[feedback_motion_stack_policy]].
	 *
	 * Pair with `useAppSlideOver(type).open(id, { flipFrom })`; the stack
	 * threads the payload here automatically.
	 */
	flipFrom?: FlipFromPayload | null;
}>();

defineEmits<{
	(e: 'close'): void;
}>();

const { depth } = useAppSlideOverStack();

// Back chevron when there's a panel beneath, X close when this panel
// IS the stack's bottom. iOS convention: chevron only points back if
// pressing it reveals something prior.
const isBack = computed(() => depth.value > 1);

// ── Pull-from-anywhere FLIP ──────────────────────────────────────
// Mirrors AppBottomSheet's FLIP machinery: ghost rides on the compositor
// from the source rect to the hero's destination. The shell sits inside
// a transformed AppSlideOverStack__panel container, so the ghost MUST be
// teleported to body — `position: fixed` inside a transformed ancestor
// is positioned relative to that ancestor, not the viewport. `heroEl`'s
// getBoundingClientRect still returns viewport coords (browser handles
// the transform projection), so the FLIP math works out.

const SPRING_EASE_FN = 'cubic-bezier(0.36, 0.66, 0.04, 1)';
const ENTER_MS = 400;
const FLIP_LAND_MS = 100;

const heroEl = useTemplateRef<HTMLElement>('heroEl');
const ghostMounted = ref(false);
const ghostStyle = ref<Record<string, string | number>>({});
const heroLanded = ref(false);
let flipTimers: ReturnType<typeof setTimeout>[] = [];

function clearFlipTimers() {
	flipTimers.forEach((t) => clearTimeout(t));
	flipTimers = [];
}

async function startFlipFlight(flip: FlipFromPayload) {
	clearFlipTimers();
	const src = flip.rect;
	// Plant the ghost at the source rect with identity transform.
	ghostStyle.value = {
		position: 'fixed',
		top: `${src.y}px`,
		left: `${src.x}px`,
		width: `${src.width}px`,
		height: `${src.height}px`,
		transform: 'translate3d(0, 0, 0) scale(1, 1)',
		transformOrigin: 'top left',
		transition: 'none',
		zIndex: 75,
		pointerEvents: 'none',
		opacity: 1,
		willChange: 'transform, opacity',
	};
	ghostMounted.value = true;

	// Wait for the ghost to mount + the hero slot to lay out in its final
	// pose inside the panel body. setTimeout-not-RAF so this still kicks in
	// throttled / headless environments per the motion-stack policy.
	await nextTick();
	await new Promise((r) => setTimeout(r, 16));
	await new Promise((r) => setTimeout(r, 16));

	const dest = heroEl.value?.getBoundingClientRect();
	if (!dest || dest.width === 0 || dest.height === 0) {
		// No hero in the DOM (panel forgot the slot, or it hasn't laid out
		// yet) — drop the ghost and let the panel reveal normally.
		ghostMounted.value = false;
		heroLanded.value = true;
		return;
	}

	const dx = dest.left - src.x;
	const dy = dest.top - src.y;
	const sx = dest.width / src.width;
	const sy = dest.height / src.height;

	ghostStyle.value = {
		...ghostStyle.value,
		transform: `translate3d(${dx}px, ${dy}px, 0) scale(${sx}, ${sy})`,
		transition: `transform ${ENTER_MS}ms ${SPRING_EASE_FN}`,
	};

	// Land: crossfade ghost → hero, then unmount ghost.
	flipTimers.push(
		setTimeout(() => {
			heroLanded.value = true;
			ghostStyle.value = {
				...ghostStyle.value,
				transition: `opacity ${FLIP_LAND_MS}ms ease-out`,
				opacity: 0,
			};
			flipTimers.push(
				setTimeout(() => {
					ghostMounted.value = false;
				}, FLIP_LAND_MS + 20),
			);
		}, ENTER_MS + 16),
	);
}

const heroStyle = computed(() => {
	if (!props.flipFrom) return { opacity: 1 };
	return {
		opacity: heroLanded.value ? 1 : 0,
		transition: `opacity ${FLIP_LAND_MS}ms ease-out`,
	};
});

onMounted(() => {
	if (props.flipFrom) startFlipFlight(props.flipFrom);
});

onBeforeUnmount(() => {
	clearFlipTimers();
});
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
			<div
				v-if="flipFrom && $slots.hero"
				ref="heroEl"
				class="app-slide-over-shell__hero"
				:style="heroStyle"
			>
				<slot name="hero" />
			</div>
			<slot />
		</div>

		<footer v-if="$slots.footer" class="app-slide-over-shell__footer">
			<slot name="footer" />
		</footer>

		<!-- FLIP ghost — teleported to body so its fixed positioning is
		     viewport-relative, NOT relative to the transformed
		     AppSlideOverStack__panel ancestor. Kept inside the single
		     shell root so attribute fallthrough still works. -->
		<Teleport to="body">
			<div
				v-if="ghostMounted && flipFrom"
				class="app-slide-over-shell__flip-ghost"
				:style="ghostStyle"
				aria-hidden="true"
				v-html="flipFrom.html"
			/>
		</Teleport>
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

.app-slide-over-shell__hero {
	margin: 0 -0.25rem 1rem;
	padding: 0.5rem 0.25rem;
	border-radius: 12px;
	background: hsl(var(--muted) / 0.4);
	border: 1px solid hsl(var(--border) / 0.5);
}

.app-slide-over-shell__flip-ghost {
	/* Ghost rides on the compositor — fixed positioning + inline-style
	   transform. v-html injects the source row's outerHTML; styles
	   inherit from :root + the global Tailwind layer so the clone
	   resembles the source closely. */
	box-sizing: border-box;
	overflow: hidden;
}

.app-slide-over-shell__footer {
	flex-shrink: 0;
	padding: 0.75rem 1.25rem;
	border-top: 1px solid hsl(var(--border) / 0.4);
	background: hsl(var(--background) / 0.92);
	backdrop-filter: blur(8px);
}
</style>
