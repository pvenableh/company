<!--
  AppSlideOverStack — single mount-point that renders the global slide-
  over stack with Framework7-style iOS push/pop visuals.

  Up to 2 panels render at once. Each panel's component is looked up
  from `panels/registry.ts` by type string and gets `{ id }` as a prop.
  Position + dim + slide animation live on the stack; chrome (header
  with close/back, body, optional footer) lives inside each panel via
  `<AppSlideOverShell>`.

  Mounted once from `app/layouts/apps.vue` — never per-page.

  Visual spec (matches Framework7's iOS curve):
    - Spring curve `cubic-bezier(0.36, 0.66, 0.04, 1)` at 400 ms.
    - Incoming panel:  translateX(100%) → 0.
    - Outgoing panel:  translateX(0)    → 100%.
    - Behind panel:    translateX(0) → -20%, scale(1) → 0.96, opacity 1 → 0.6.
    - Single shared backdrop: 0 → 0.35 at depth 1, → 0.55 at depth 2.
    - Top panel carries a left-edge shadow as the depth cue.

  Focus + a11y:
    - reka-ui `<FocusScope>` traps focus on the top panel.
    - `aria-modal="true"` + `role="dialog"` on the top panel only.
    - Body scroll lock on while the stack has any depth.
    - Escape key + backdrop click → `pop()`.
-->
<script setup lang="ts">
import { FocusScope } from 'reka-ui';
import { useScrollLock } from '@vueuse/core';
import { getPanelComponent } from './panels/registry';

const { stack, depth, pop } = useAppSlideOverStack();

// Render up to MAX_DEPTH (2) panels. `stack` is already capped by the
// composable, but slicing here keeps the v-for trivially safe.
const panels = computed(() => stack.value.slice(0, 2));

// Map each panel entry to its component + a stable key. Panels missing
// from the registry are filtered out — we'd rather render nothing than
// crash the layout on an unknown stack type from a stale URL.
const renderable = computed(() =>
	panels.value
		.map((panel, index) => {
			const component = getPanelComponent(panel.type);
			if (!component) return null;
			return {
				key: `${panel.type}:${panel.id}`,
				type: panel.type,
				id: panel.id,
				index,
				component,
				isTop: index === panels.value.length - 1,
			};
		})
		.filter((p): p is NonNullable<typeof p> => p !== null),
);

// Body scroll lock so the page underneath doesn't scroll while a panel
// is open. Tied to depth so it releases automatically when the stack
// empties.
const scrollLocked = import.meta.client
	? useScrollLock(document.body)
	: ref(false);
watchEffect(() => {
	scrollLocked.value = depth.value > 0;
});

// Escape closes the top panel. Bound at window level so a panel that
// has yielded focus (e.g. an interactive child without a focused
// element) can still be dismissed.
function onKeydown(event: KeyboardEvent) {
	if (event.key === 'Escape' && depth.value > 0) {
		event.preventDefault();
		pop();
	}
}

onMounted(() => {
	if (!import.meta.client) return;
	window.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
	if (!import.meta.client) return;
	window.removeEventListener('keydown', onKeydown);
});

function onBackdropClick() {
	pop();
}

function onShellClose() {
	pop();
}
</script>

<template>
	<Teleport to="body">
		<div
			class="app-slide-over-stack"
			:data-depth="depth"
			:aria-hidden="depth === 0 ? 'true' : null"
		>
			<!-- Shared backdrop. One element, opacity bumps with depth so
			     a second push deepens the dim instead of stacking layers. -->
			<Transition name="ios-backdrop">
				<div
					v-if="depth > 0"
					class="app-slide-over-stack__backdrop"
					@click="onBackdropClick"
				/>
			</Transition>

			<!-- Panel layer. TransitionGroup handles entering/leaving panels;
			     CSS transitions on [data-depth-state] handle the simultaneous
			     "top ↔ behind" shift when push/pop happens. -->
			<TransitionGroup name="ios-panel" tag="div" class="app-slide-over-stack__panels">
				<div
					v-for="panel in renderable"
					:key="panel.key"
					class="app-slide-over-stack__panel"
					:data-depth-state="panel.isTop ? 'top' : 'behind'"
					:role="panel.isTop ? 'dialog' : undefined"
					:aria-modal="panel.isTop ? 'true' : undefined"
				>
					<FocusScope :trapped="panel.isTop" :loop="true" as-child>
						<div class="app-slide-over-stack__panel-inner">
							<component
								:is="panel.component"
								:id="panel.id"
								@close="onShellClose"
							/>
						</div>
					</FocusScope>
				</div>
			</TransitionGroup>
		</div>
	</Teleport>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.app-slide-over-stack {
	--ios-spring: cubic-bezier(0.36, 0.66, 0.04, 1);
	--ios-spring-duration: 400ms;
	position: fixed;
	inset: 0;
	z-index: 60;
	pointer-events: none;
}

/* Stays mounted at depth 0 so a leaving panel can finish its
 * translate-out before disappearing. pointer-events on the wrapper
 * is already `none` (panels + backdrop re-enable themselves), so
 * the page underneath stays interactive. Setting `display: none`
 * here was the v2.0 bug that made the last pop snap instead of
 * animate. */

.app-slide-over-stack__backdrop {
	position: absolute;
	inset: 0;
	background: rgb(0 0 0 / 0.35);
	pointer-events: auto;
	transition: background var(--ios-spring-duration) var(--ios-spring);
}

/* Deepen the dim on a second push without compounding layers. */
.app-slide-over-stack[data-depth='2'] .app-slide-over-stack__backdrop {
	background: rgb(0 0 0 / 0.5);
}

.app-slide-over-stack__panels {
	position: absolute;
	inset: 0;
	pointer-events: none;
}

.app-slide-over-stack__panel {
	position: absolute;
	top: 0;
	right: 0;
	bottom: 0;
	width: 100%;
	max-width: 100vw;
	background: hsl(var(--background));
	pointer-events: auto;
	will-change: transform, opacity;
	transition:
		transform var(--ios-spring-duration) var(--ios-spring),
		opacity var(--ios-spring-duration) var(--ios-spring),
		box-shadow var(--ios-spring-duration) var(--ios-spring);
}

.app-slide-over-stack__panel-inner {
	width: 100%;
	height: 100%;
	display: flex;
	flex-direction: column;
	min-height: 0;
}

/* Desktop: panel is a right-anchored sheet at max-w-2xl. Mobile: full
 * width so the push feels like iOS view navigation. */
@media (min-width: 640px) {
	.app-slide-over-stack__panel {
		max-width: 42rem;
	}
}

/* Top panel — full position + signature left-edge shadow (Framework7's
 * iOS depth cue). Both selectors share specificity (1 class + 1 attr =
 * (0,2,0)); enter/leave transition classes below are written with the
 * same specificity so source order resolves them. */
.app-slide-over-stack__panel[data-depth-state='top'] {
	transform: translate3d(0, 0, 0);
	opacity: 1;
	box-shadow: -12px 0 24px -8px rgb(0 0 0 / 0.18);
	z-index: 2;
}

/* Behind panel — slid left 20% + slight scale + dim. pointer-events off
 * so the visible peek isn't interactive (iOS behaviour). */
.app-slide-over-stack__panel[data-depth-state='behind'] {
	transform: translate3d(-20%, 0, 0) scale(0.96);
	opacity: 0.6;
	pointer-events: none;
	box-shadow: -12px 0 24px -8px rgb(0 0 0 / 0.12);
	z-index: 1;
}

/* Backdrop fade. */
.ios-backdrop-enter-active,
.ios-backdrop-leave-active {
	transition: opacity var(--ios-spring-duration) var(--ios-spring);
}
.ios-backdrop-enter-from,
.ios-backdrop-leave-to {
	opacity: 0;
}

/* ── TransitionGroup enter/leave overrides ──
 *
 * Specificity: each rule chains the panel class with the transition
 * class, giving (0,2,0) — same as `.panel[data-depth-state='top']`.
 * Because these rules come *after* the data-depth rules in source
 * order, they win the tie and override transform/opacity during the
 * enter or leave window only. No !important needed. */

.app-slide-over-stack__panel.ios-panel-enter-from {
	transform: translate3d(100%, 0, 0);
	opacity: 1;
	box-shadow: -12px 0 24px -8px rgb(0 0 0 / 0.18);
	z-index: 3;
}

.app-slide-over-stack__panel.ios-panel-leave-to {
	transform: translate3d(100%, 0, 0);
	opacity: 1;
	box-shadow: -12px 0 24px -8px rgb(0 0 0 / 0.18);
}

.app-slide-over-stack__panel.ios-panel-leave-active {
	z-index: 3;
}
</style>
