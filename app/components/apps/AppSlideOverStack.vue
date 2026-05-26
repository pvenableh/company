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

  Motion stack — compositor + reactive inline-style (P3.5 rewrite,
  2026-05-21):
    Previously drove enter/leave through Vue `<Transition>` +
    `<TransitionGroup>`, which use a `requestAnimationFrame` callback to
    swap `enter-from` → `enter-to`. In HMR / headless / throttled-RAF
    environments that swap stalls and panels get stuck mid-flight at
    `translate3d(209px, 0, 0)` (the symptom logged during P3
    proposal+mailing-list verification). Now each rendered panel carries
    `{ visible, leaving }` flags; a computed builds an inline-style
    binding so the compositor runs the CSS transition without a main-
    thread RAF callback. Mirrors the AppBottomSheet rewrite from P2
    slice 2. See [[feedback_motion_stack_policy]].

  Focus + a11y:
    - reka-ui `<FocusScope>` traps focus on the top panel.
    - `aria-modal="true"` + `role="dialog"` on the top panel only.
    - Body scroll lock on while the stack has any depth.
    - Escape key + backdrop click → `pop()`.
-->
<script setup lang="ts">
import { FocusScope } from 'reka-ui';
import { useScrollLock } from '@vueuse/core';
import type { FlipFromPayload } from '~/composables/useFlipFromRow';
import { getPanelComponent } from './panels/registry';

const { stack, depth, pop } = useAppSlideOverStack();
const flips = useSlideOverFlips();
// When a modal/drawer mounts above the stack (FormModal sheet, settings
// drawer, etc.) it increments this counter and we drop FocusScope.trapped.
// Otherwise reka-ui's focusin catcher bounces focus on every input click,
// rendering the modal effectively un-editable (see [[feedback_universal_button_hierarchy]]'s
// neighbor: dialogs over slide-overs).
const { count: trapSuspend } = useSlideOverFocusTrapSuspend();

const SPRING_EASE_FN = 'cubic-bezier(0.36, 0.66, 0.04, 1)';
const ANIM_MS = 400;
// One macrotask after mount, then flip the `visible` flag so the closed
// pose paints first and the CSS transition has something to interpolate
// from. setTimeout-not-RAF survives throttled environments where the
// previous Vue `<Transition>` class-swap stalled.
const SETTLE_MS = 16;

type PanelComponent = NonNullable<ReturnType<typeof getPanelComponent>>;

type RenderedPanel = {
	key: string;
	type: string;
	id: string;
	mode?: string;
	component: PanelComponent;
	visible: boolean;
	leaving: boolean;
	/**
	 * One-shot FLIP source consumed from the global flips map at the
	 * moment this panel enters the rendered list. Threaded down to the
	 * panel component as a prop so AppSlideOverShell can FLIP the
	 * row clone into its hero slot.
	 */
	flipFrom: FlipFromPayload | null;
};

const rendered = ref<RenderedPanel[]>([]);
const enterTimers = new Map<string, ReturnType<typeof setTimeout>>();
const leaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

function panelKey(p: { type: string; id: string }): string {
	return `${p.type}:${p.id}`;
}

function syncRendered() {
	const next = stack.value
		.slice(0, 2)
		.map((p) => {
			const component = getPanelComponent(p.type);
			return component
				? { type: p.type, id: p.id, mode: p.mode, component, key: panelKey(p) }
				: null;
		})
		.filter(
			(p): p is { type: string; id: string; mode?: string; component: PanelComponent; key: string } => p !== null,
		);

	const nextKeys = new Set(next.map((p) => p.key));

	// Mark panels that disappeared from the stack as leaving + schedule
	// unmount once their slide-out has finished. Mutating through the
	// proxied array element keeps reactivity intact.
	for (let i = 0; i < rendered.value.length; i++) {
		const r = rendered.value[i]!;
		if (!nextKeys.has(r.key) && !r.leaving) {
			const et = enterTimers.get(r.key);
			if (et) {
				clearTimeout(et);
				enterTimers.delete(r.key);
			}
			r.leaving = true;
			r.visible = false;
			const t = setTimeout(() => {
				rendered.value = rendered.value.filter((x) => x.key !== r.key);
				leaveTimers.delete(r.key);
			}, ANIM_MS + 32);
			leaveTimers.set(r.key, t);
		}
	}

	// Add new panels at the closed (off-screen-right) pose, then flip
	// `visible` true on the next macrotask so the compositor interpolates
	// from translateX(100%) → translateX(0). FLIP-bound entries skip the
	// slide-from-right and mount at the open pose directly; the shell's
	// own FLIP machinery animates the row clone into the #hero slot.
	for (const n of next) {
		const existing = rendered.value.find((r) => r.key === n.key);
		if (!existing) {
			const flipFrom = flips.value[n.key] ?? null;
			if (flipFrom) {
				// Consume — re-mounts (URL replay, back-nav) won't FLIP again.
				const { [n.key]: _drop, ...rest } = flips.value;
				flips.value = rest;
			}
			rendered.value.push({
				key: n.key,
				type: n.type,
				id: n.id,
				mode: n.mode,
				component: n.component,
				visible: !!flipFrom,
				leaving: false,
				flipFrom,
			});
			if (!flipFrom) {
				const t = setTimeout(() => {
					const found = rendered.value.find((r) => r.key === n.key);
					if (found) found.visible = true;
					enterTimers.delete(n.key);
				}, SETTLE_MS);
				enterTimers.set(n.key, t);
			}
		} else if (existing.leaving) {
			// Resurrected before the unmount timer fired — cancel leave,
			// snap back to settled. (Rare: rapid pop→push of the same id.)
			const lt = leaveTimers.get(n.key);
			if (lt) {
				clearTimeout(lt);
				leaveTimers.delete(n.key);
			}
			existing.leaving = false;
			existing.visible = true;
		}
	}

	// Reorder so non-leaving entries follow the stack order (drives
	// behind ↔ top depth shifts via the computed `renderable`). Leaving
	// entries hang at the end with z-index 3 so they paint over the
	// settled top while sliding out.
	const settledOrdered = next
		.map((n) => rendered.value.find((r) => r.key === n.key))
		.filter((r): r is RenderedPanel => !!r);
	const leaving = rendered.value.filter((r) => r.leaving);
	rendered.value = [...settledOrdered, ...leaving];
}

// Track every field we care about so the watcher fires for id swaps,
// mode swaps, and length changes — but not for unrelated query-param
// churn elsewhere on the route.
watch(
	() => stack.value.map((p) => `${p.type}:${p.id}:${p.mode ?? ''}`).join('/'),
	() => syncRendered(),
	{ immediate: true },
);

const renderable = computed(() => {
	const settled = rendered.value.filter((r) => !r.leaving);
	const settledKeys = settled.map((r) => r.key);
	const topKey = settledKeys[settledKeys.length - 1];
	return rendered.value.map((r) => {
		const isTop = r.key === topKey && !r.leaving;
		const inSettled = settledKeys.includes(r.key);
		let pose: Record<string, string | number>;
		if (!r.visible) {
			// Entering or leaving — sit off-screen to the right. Same pose
			// for both directions; the visible→!visible flip carries leave,
			// the !visible→visible flip carries enter.
			pose = {
				transform: 'translate3d(100%, 0, 0)',
				opacity: 1,
				boxShadow: '-12px 0 24px -8px rgb(0 0 0 / 0.18)',
				zIndex: 3,
			};
		} else if (isTop) {
			pose = {
				transform: 'translate3d(0, 0, 0)',
				opacity: 1,
				boxShadow: '-12px 0 24px -8px rgb(0 0 0 / 0.18)',
				zIndex: 2,
			};
		} else if (inSettled) {
			// Behind — slid left, scaled down, dimmed.
			pose = {
				transform: 'translate3d(-20%, 0, 0) scale(0.96)',
				opacity: 0.6,
				boxShadow: '-12px 0 24px -8px rgb(0 0 0 / 0.12)',
				zIndex: 1,
			};
		} else {
			// Leaving panel that hadn't paid into settled — keep it on top
			// while it slides out.
			pose = {
				transform: 'translate3d(100%, 0, 0)',
				opacity: 1,
				boxShadow: '-12px 0 24px -8px rgb(0 0 0 / 0.18)',
				zIndex: 3,
			};
		}
		return {
			key: r.key,
			type: r.type,
			id: r.id,
			mode: r.mode,
			component: r.component,
			flipFrom: r.flipFrom,
			isTop,
			style: {
				...pose,
				// FLIP-bound entries skip the slide-from-right; no need for a
				// transform transition on their first paint. Subsequent
				// transitions (e.g. transitioning to behind on a deeper push)
				// still want the spring — kept always-on so the compositor
				// handles both.
				transition: `transform ${ANIM_MS}ms ${SPRING_EASE_FN}, opacity ${ANIM_MS}ms ${SPRING_EASE_FN}, box-shadow ${ANIM_MS}ms ${SPRING_EASE_FN}`,
			},
		};
	});
});

// Backdrop — same mounted/visible pair as the panels. Keeps the
// element in the DOM during fade-out so opacity 1 → 0 has a starting
// frame.
const backdropMounted = ref(false);
const backdropVisible = ref(false);
let backdropLeaveTimer: ReturnType<typeof setTimeout> | null = null;
let backdropEnterTimer: ReturnType<typeof setTimeout> | null = null;

const settledDepth = computed(() => rendered.value.filter((r) => !r.leaving).length);

watch(
	settledDepth,
	(d) => {
		if (d > 0) {
			if (backdropLeaveTimer) {
				clearTimeout(backdropLeaveTimer);
				backdropLeaveTimer = null;
			}
			backdropMounted.value = true;
			if (backdropEnterTimer) clearTimeout(backdropEnterTimer);
			backdropEnterTimer = setTimeout(() => {
				backdropVisible.value = true;
				backdropEnterTimer = null;
			}, SETTLE_MS);
		} else if (backdropMounted.value) {
			if (backdropEnterTimer) {
				clearTimeout(backdropEnterTimer);
				backdropEnterTimer = null;
			}
			backdropVisible.value = false;
			backdropLeaveTimer = setTimeout(() => {
				backdropMounted.value = false;
				backdropLeaveTimer = null;
			}, ANIM_MS + 32);
		}
	},
	{ immediate: true },
);

const backdropStyle = computed(() => ({
	opacity: backdropVisible.value ? 1 : 0,
	background: settledDepth.value >= 2 ? 'rgb(0 0 0 / 0.5)' : 'rgb(0 0 0 / 0.35)',
	transition: `opacity ${ANIM_MS}ms ${SPRING_EASE_FN}, background ${ANIM_MS}ms ${SPRING_EASE_FN}`,
}));

// Body scroll lock so the page underneath doesn't scroll while a panel
// is open. Bound to the URL-driven depth (not the rendered depth) so the
// lock releases the moment the user pops, not after the slide-out.
const scrollLocked = import.meta.client ? useScrollLock(document.body) : ref(false);
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
	for (const t of enterTimers.values()) clearTimeout(t);
	for (const t of leaveTimers.values()) clearTimeout(t);
	if (backdropLeaveTimer) clearTimeout(backdropLeaveTimer);
	if (backdropEnterTimer) clearTimeout(backdropEnterTimer);
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
			<!-- Shared backdrop. One element, opacity bumps with depth so a
			     second push deepens the dim instead of stacking layers. -->
			<div
				v-if="backdropMounted"
				class="app-slide-over-stack__backdrop"
				:style="backdropStyle"
				@click="onBackdropClick"
			/>

			<!-- Panel layer. Each panel carries its full visual pose via
			     inline style; the CSS class only declares position +
			     base/idle styling. No Vue <Transition> here — see header
			     comment for rationale. -->
			<div class="app-slide-over-stack__panels">
				<div
					v-for="panel in renderable"
					:key="panel.key"
					class="app-slide-over-stack__panel"
					:style="panel.style"
					:role="panel.isTop ? 'dialog' : undefined"
					:aria-modal="panel.isTop ? 'true' : undefined"
				>
					<FocusScope :trapped="panel.isTop && trapSuspend === 0" :loop="true" as-child>
						<div class="app-slide-over-stack__panel-inner">
							<component
								:is="panel.component"
								:id="panel.id"
								:mode="panel.mode"
								:flip-from="panel.flipFrom"
								@close="onShellClose"
							/>
						</div>
					</FocusScope>
				</div>
			</div>
		</div>
	</Teleport>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.app-slide-over-stack {
	position: fixed;
	inset: 0;
	z-index: 60;
	pointer-events: none;
}

/* Stays mounted at depth 0 so a leaving panel can finish its
 * translate-out before disappearing. pointer-events on the wrapper
 * is already `none` (panels + backdrop re-enable themselves), so the
 * page underneath stays interactive. */

.app-slide-over-stack__backdrop {
	position: absolute;
	inset: 0;
	background: rgb(0 0 0 / 0.35);
	pointer-events: auto;
	opacity: 0;
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
	/* Closed pose — overridden by the reactive inline transform on
	 * every render. Acts as a safety net during SSR / hydration. */
	transform: translate3d(100%, 0, 0);
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

	/* Fullscreen shell host — the editor inside legitimately owns its
	 * chrome (NewsletterBlockBuilder is the canonical case: block
	 * palette + canvas + preview pane) and would be crushed by the
	 * 42rem column. The shell sets `data-fullscreen`; we lift the cap
	 * via :has() so the panel spreads to the viewport. */
	.app-slide-over-stack__panel:has(> .app-slide-over-stack__panel-inner .app-slide-over-shell[data-fullscreen]) {
		max-width: 100vw;
	}
}
</style>
