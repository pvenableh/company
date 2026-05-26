<script setup lang="ts">
/**
 * CompositionCanvas — depth-zoom host for the Composition Canvas redesign.
 *
 * P3 Phase 3.1. Replaces the floor segmented control's grid hand-off with a
 * single host that ramps a `z` level. The default slot renders the lens
 * surface (river/inbox/approval/etc.) at `z=1`; at `z=2` a `#lifted` slot
 * (optional) fades in over a dimmed-and-shifted river. Higher z levels are
 * reserved for future phases (3.2: composer, 3.4: blocks).
 *
 * Motion contract (load-bearing — see feedback_motion_stack_policy):
 *   - Scale + parallax are reactive inline transform + CSS transition.
 *   - NO Vue Transition for the zoom payoff. NO GSAP. The compositor drives
 *     the spring directly off the reactive `z` value. This keeps the zoom
 *     smooth under CPU throttling and headless / hidden-tab conditions
 *     where RAF stalls.
 *   - prefers-reduced-motion → opacity crossfade only, scale locked to 1.
 *
 * Input handlers (pinch / Cmd+= / wheel+modifier) live in
 * useCompositionZoom. The canvas just calls `installAll(rootEl)` so the
 * gestures are scoped to its bounding region — they don't fight global
 * browser zoom on the rest of the page.
 *
 * @see app/composables/useCompositionZoom.ts — state + handler installers.
 * @see project_composition_canvas_redesign — design rationale.
 */

withDefaults(
	defineProps<{
		/** Current zoom level. Parent owns the source-of-truth ref (typically
		 *  via useCompositionZoom().z). Phase 3.1 only renders z=1 ↔ z=2. */
		z: number;
		/** Which lens the default slot is showing. Informational — the canvas
		 *  doesn't switch surfaces itself; the parent does. */
		lens?: 'calendar' | 'inbox' | 'approval' | 'analytics' | 'upcoming';
		/** Id of the leaf the user is drilling into. When set and z crosses
		 *  the lift threshold, the `#lifted` slot is rendered. */
		activeId?: string | null;
	}>(),
	{ lens: 'calendar', activeId: null },
);

const emit = defineEmits<{
	(e: 'update:z', n: number): void;
	(e: 'update:activeId', id: string | null): void;
}>();

const zoom = useCompositionZoom();
const rootEl = ref<HTMLElement | null>(null);

let teardown: (() => void) | null = null;

onMounted(() => {
	if (rootEl.value) teardown = zoom.installAll(rootEl.value);
});

onBeforeUnmount(() => {
	if (teardown) teardown();
	teardown = null;
});

// Bridge the composable singleton back to the parent's v-model. The parent
// hands z down as a prop; the composable owns the value. We emit whenever
// the composable's z changes so consumers stay in sync.
watch(
	() => zoom.z.value,
	(next) => emit('update:z', next),
);

const prefersReducedMotion = ref(false);
onMounted(() => {
	if (typeof window === 'undefined') return;
	const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
	prefersReducedMotion.value = mq.matches;
	const onChange = (e: MediaQueryListEvent) => {
		prefersReducedMotion.value = e.matches;
	};
	mq.addEventListener('change', onChange);
	onBeforeUnmount(() => mq.removeEventListener('change', onChange));
});

/**
 * z=1 → identity. z=2 → river dimmed, pushed up; the lifted card occupies the
 * foreground. We interpolate linearly between integers so the gesture feels
 * continuous; CSS transition catches the snap-on-release that
 * useCompositionZoom emits.
 *
 * Future z=3/z=4/z=5 will lift the canvas further (and reveal more lifted
 * layers), but Phase 3.1 only renders the first two levels — anything past
 * z=2 falls through to the z=2 pose.
 */
const surfaceStyle = computed(() => {
	const z = Math.max(1, Math.min(2, zoom.z.value));
	const t = z - 1; // 0..1
	const reduce = prefersReducedMotion.value;
	const scale = reduce ? 1 : 1 - 0.06 * t;
	const translateY = reduce ? 0 : -12 * t;
	const opacity = 1 - 0.6 * t;
	return {
		transform: `translate3d(0, ${translateY}px, 0) scale(${scale})`,
		opacity: String(opacity),
	};
});

const liftedActive = computed(() => zoom.z.value >= 1.5);

const liftedStyle = computed(() => {
	const z = Math.max(1, Math.min(2, zoom.z.value));
	const t = Math.max(0, Math.min(1, (z - 1.2) / 0.8)); // 0 until z>=1.2, 1 at z=2
	const reduce = prefersReducedMotion.value;
	const scale = reduce ? 1 : 0.94 + 0.06 * t;
	return {
		transform: `translate3d(0, 0, 0) scale(${scale})`,
		opacity: String(t),
		pointerEvents: liftedActive.value ? ('auto' as const) : ('none' as const),
	};
});

function closeLifted() {
	zoom.setZ(1);
	emit('update:activeId', null);
}
</script>

<template>
	<div
		ref="rootEl"
		class="composition-canvas"
		:data-z="Math.round(zoom.z.value)"
		:data-lens="lens"
		:data-gesturing="zoom.gesturing.value ? 'true' : 'false'"
	>
		<!-- Surface (river / inbox / etc.). Scales + dims as z ramps. The
		     compositor drives the transform — see file-header docstring. -->
		<div class="composition-canvas__surface" :style="surfaceStyle">
			<slot />
		</div>

		<!-- Lifted leaf overlay. Only mounted when there's an active id AND
		     the user has crossed the lift threshold. Pointer-events gated
		     so the underlying surface stays interactive at z=1. -->
		<div
			v-if="activeId && liftedActive"
			class="composition-canvas__lifted"
			:style="liftedStyle"
			@click.self="closeLifted"
		>
			<slot name="lifted" :active-id="activeId" :close="closeLifted">
				<!-- Default lifted scaffold — surface displays this if the parent
				     doesn't override the slot. Phase 3.1 ships with a stub; the
				     real lifted card content lands in 3.2 alongside the composer. -->
				<div class="composition-canvas__lifted-stub">
					<Icon name="lucide:expand" class="w-6 h-6 mb-2 opacity-60" />
					<p class="text-xs font-medium text-foreground/80">
						Lifted: {{ activeId }}
					</p>
					<p class="text-[10px] text-muted-foreground mt-1">
						z={{ zoom.z.value.toFixed(2) }} — full composer ships in Phase 3.2
					</p>
					<button
						type="button"
						class="composition-canvas__lifted-close"
						@click="closeLifted"
					>
						Back to river
					</button>
				</div>
			</slot>
		</div>
	</div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.composition-canvas {
	@apply relative w-full;
	/* The Studio segmented control + tab pills above us assume a normal
	   stacking context; we don't introduce a transform on the host itself,
	   only on the inner surface, so layout above the canvas is unaffected. */
	contain: layout style;
	/* Prevent the trackpad pinch / wheel+ctrl from triggering native
	   browser zoom inside the canvas region. preventDefault in JS only
	   works when the listener is non-passive (which it is in the
	   composable), but pairing with CSS belt-and-braces helps on iOS
	   Safari's pinch handling. */
	touch-action: pan-y;
}

.composition-canvas__surface {
	@apply w-full;
	transform-origin: center top;
	will-change: transform, opacity;
	transition:
		transform 400ms cubic-bezier(0.36, 0.66, 0.04, 1),
		opacity 400ms cubic-bezier(0.36, 0.66, 0.04, 1);
}

.composition-canvas[data-gesturing='true'] .composition-canvas__surface {
	/* During an active gesture, kill the spring so the transform tracks the
	   fingers 1:1. The CSS transition re-engages on snap. */
	transition: none;
}

.composition-canvas__lifted {
	@apply absolute inset-0 z-10 flex items-center justify-center;
	transform-origin: center;
	will-change: transform, opacity;
	transition:
		transform 400ms cubic-bezier(0.36, 0.66, 0.04, 1),
		opacity 400ms cubic-bezier(0.36, 0.66, 0.04, 1);
	background: radial-gradient(
		circle at center,
		hsl(var(--accent-h, 220) 30% 8% / 0.18),
		hsl(var(--accent-h, 220) 30% 6% / 0.08) 60%,
		transparent 100%
	);
	backdrop-filter: blur(2px);
}

.composition-canvas[data-gesturing='true'] .composition-canvas__lifted {
	transition: none;
}

.composition-canvas__lifted-stub {
	@apply flex flex-col items-center justify-center
		rounded-2xl border border-border bg-card/95
		px-6 py-5 max-w-sm text-center shadow-2xl;
}

.composition-canvas__lifted-close {
	@apply mt-3 inline-flex items-center gap-1 rounded-full
		px-3 py-1 text-[11px] font-medium
		bg-muted/60 text-foreground/80 hover:bg-muted
		transition-colors;
}

@media (prefers-reduced-motion: reduce) {
	.composition-canvas__surface,
	.composition-canvas__lifted {
		transition: opacity 200ms linear;
	}
}
</style>
