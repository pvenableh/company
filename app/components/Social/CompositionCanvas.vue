<script setup lang="ts">
/**
 * CompositionCanvas — depth-zoom host for the Composition Canvas redesign.
 *
 * P3 Phase 3.1 + 3.2 + 3.3. Replaces the floor segmented control's grid
 * hand-off with a single host that ramps a `z` level. Layers:
 *   z=1 (river surface)         default slot
 *   z=2 (lifted card)           LiftedCard | EmailLiftedCard (kind-dispatched)
 *   z=3 (composer)              CompositionComposer | EmailComposer
 *
 * Kind dispatch (Phase 3.3): the active id encodes the kind.
 *   - UUID prefix → social post → LiftedCard + CompositionComposer.
 *   - `touch:<n>` prefix → email touch → EmailLiftedCard + EmailComposer.
 *
 * The lifted card and the composer are siblings, NOT swapped. As z crosses
 * the composer threshold (2.5) the lifted card fades + dilates slightly and
 * the composer fades in on top, both running on the master spring.
 *
 * Motion contract (load-bearing — see feedback_motion_stack_policy):
 *   - Scale + parallax + crossfades are reactive inline transform + CSS
 *     transition. NO Vue Transition. NO GSAP.
 *   - prefers-reduced-motion → opacity crossfades only.
 *
 * Input handlers (pinch / Cmd+= / wheel+modifier) live in
 * useCompositionZoom. The canvas just calls `installAll(rootEl)` so the
 * gestures are scoped to its bounding region — they don't fight global
 * browser zoom on the rest of the page.
 *
 * @see app/composables/useCompositionZoom.ts — state + handler installers.
 * @see app/components/Social/LiftedCard.vue — z=2 FLIP card (social).
 * @see app/components/Social/EmailLiftedCard.vue — z=2 FLIP card (email).
 * @see app/components/Social/CompositionComposer.vue — z=3 composer (social).
 * @see app/components/Social/EmailComposer.vue — z=3 composer (email).
 * @see project_composition_canvas_redesign — design rationale.
 */
import type { SocialPost } from '~~/shared/social';
import type { EmailComposition } from '~~/shared/composition';
import LiftedCard from '~/components/Social/LiftedCard.vue';
import EmailLiftedCard from '~/components/Social/EmailLiftedCard.vue';
import CompositionComposer from '~/components/Social/CompositionComposer.vue';
import EmailComposer from '~/components/Social/EmailComposer.vue';

withDefaults(
	defineProps<{
		/** Current zoom level. Parent owns the source-of-truth ref (typically
		 *  via useCompositionZoom().z). The canvas reads zoom internally as
		 *  well; this prop is kept so external observers can still bind a
		 *  v-model:z, but the canvas does NOT depend on it for layout. */
		z: number;
		/** Which lens the default slot is showing. Informational — the canvas
		 *  doesn't switch surfaces itself; the parent does. */
		lens?: 'calendar' | 'inbox' | 'approval' | 'analytics' | 'upcoming';
		/** Active id, mirrored from the composable singleton. Kept on the
		 *  prop surface so existing parents can still bind a v-model:activeId
		 *  if they want to control externally. */
		activeId?: string | null;
	}>(),
	{ lens: 'calendar', activeId: null },
);

const emit = defineEmits<{
	(e: 'update:z', n: number): void;
	(e: 'update:activeId', id: string | null): void;
	(e: 'post-updated', post: SocialPost): void;
	(e: 'touch-updated', composition: EmailComposition): void;
}>();

const zoom = useCompositionZoom();
const rootEl = ref<HTMLElement | null>(null);

// ── Kind dispatch ──────────────────────────────────────────────────
// P3.0's encoding: `touch:<n>` for email touches, UUID for social posts.
// The canvas dispatches the lift+composer pair on this prefix; the
// composable singleton stays kind-agnostic.
function kindFor(id: string | null): 'social' | 'email' | null {
	if (!id) return null;
	return id.startsWith('touch:') ? 'email' : 'social';
}

const activeKind = computed(() => kindFor(zoom.activeId.value));

// ── Active post fetch (FLIP source + composer source) ────────────────
// The river hands us the post id (+ source rect) via useCompositionZoom.lift().
// We hold a lightweight cache so re-targeting the same leaf is instant.
const composition = useComposition();
const activePost = ref<SocialPost | null>(null);
const activeEmail = ref<EmailComposition | null>(null);
const activePostLoading = ref(false);
const activePostErr = ref<string | null>(null);

async function loadActive(id: string) {
	activePostLoading.value = true;
	activePostErr.value = null;
	try {
		const kind = kindFor(id);
		if (kind === 'email') {
			// Email branch (Phase 3.3) — the view-model already carries
			// everything the lifted card needs (subject, preview, body
			// excerpt, segment, status). No second raw-row fetch.
			const comp = await composition.fetchById(id);
			if (!comp || comp.kind !== 'email') {
				throw new Error('Email not found');
			}
			activeEmail.value = comp;
			activePost.value = null;
			return;
		}
		// Social branch — same as Phase 3.2.
		const comp = await composition.fetchById(id);
		if (!comp || comp.kind !== 'social') {
			throw new Error('Post not found');
		}
		// Raw row preferred so the lifted card has Studio-specific fields
		// (design_image_url etc.) the composition view-model doesn't carry.
		const res = await $fetch<{ data: SocialPost }>(`/api/social/posts/${id}`, {
			credentials: 'include',
		});
		activePost.value = res.data;
		activeEmail.value = null;
	} catch (err: any) {
		activePostErr.value = err?.message || 'Could not load';
		activePost.value = null;
		activeEmail.value = null;
	} finally {
		activePostLoading.value = false;
	}
}

watch(
	() => zoom.activeId.value,
	(id) => {
		emit('update:activeId', id);
		if (!id) {
			activePost.value = null;
			activeEmail.value = null;
			activePostErr.value = null;
			return;
		}
		// Cache hit: skip refetch when re-entering the same leaf.
		const kind = kindFor(id);
		if (kind === 'social' && activePost.value?.id === id) return;
		if (kind === 'email' && activeEmail.value?.id === id) return;
		loadActive(id);
	},
	{ immediate: true },
);

function onComposerSaved(post: SocialPost) {
	// Refresh local card AND notify parent so the river leaf can update in
	// place without a full refetch.
	activePost.value = post;
	emit('post-updated', post);
}

function onEmailComposerSaved(comp: EmailComposition) {
	activeEmail.value = comp;
	emit('touch-updated', comp);
}

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
 * z=1 → identity. As z ramps to 3 the river surface dims and shifts up,
 * making room for the lifted card → composer stack. We interpolate
 * linearly between integers so the gesture feels continuous; CSS
 * transition catches the snap-on-release.
 */
const surfaceStyle = computed(() => {
	const z = Math.max(1, Math.min(3, zoom.z.value));
	// 0 at floor, 1 at lifted, 1 at composer too (surface doesn't keep
	// receding past the lifted pose — the composer takes over the focus).
	const t = Math.min(1, z - 1);
	const reduce = prefersReducedMotion.value;
	const scale = reduce ? 1 : 1 - 0.06 * t;
	const translateY = reduce ? 0 : -12 * t;
	const opacity = 1 - 0.6 * t;
	return {
		transform: `translate3d(0, ${translateY}px, 0) scale(${scale})`,
		opacity: String(opacity),
	};
});

const liftedActive = computed(() => zoom.z.value >= 1.5 && !!zoom.activeId.value);
const composerActive = computed(
	() => zoom.z.value >= zoom.Z_COMPOSER_THRESHOLD && !!zoom.activeId.value,
);

/**
 * Lifted card style — fully visible at z=2, then dilates + fades as the
 * composer takes over (z=2 → z=3). We compute the lift-in (z=1.2→2) and
 * the hand-off (z=2.5→3) as two ramps.
 */
const liftedStyle = computed(() => {
	const z = Math.max(1, Math.min(3, zoom.z.value));
	// Phase A: lift in 0→1 across z=1.2→2.0
	const a = Math.max(0, Math.min(1, (z - 1.2) / 0.8));
	// Phase B: hand-off 0→1 across z=2.5→3.0
	const b = Math.max(0, Math.min(1, (z - 2.5) / 0.5));
	const reduce = prefersReducedMotion.value;
	// Scale dilates from 1 → 1.06 as we hand off, opacity drops to 0.
	const scale = reduce ? 1 : 1 + 0.06 * b;
	const opacity = a * (1 - b);
	return {
		transform: `translate3d(0, 0, 0) scale(${scale})`,
		opacity: String(opacity),
		pointerEvents: liftedActive.value && b < 0.5 ? ('auto' as const) : ('none' as const),
	};
});

/**
 * Composer style — fades in starting at z=2.5, full at z=3. Enters at
 * scale 0.98 → 1.0 for a tactile settle. Mounted only when activeId is
 * set so deep-links land cleanly.
 */
const composerStyle = computed(() => {
	const z = Math.max(1, Math.min(3, zoom.z.value));
	const t = Math.max(0, Math.min(1, (z - 2.5) / 0.5));
	const reduce = prefersReducedMotion.value;
	const scale = reduce ? 1 : 0.98 + 0.02 * t;
	return {
		transform: `translate3d(0, 0, 0) scale(${scale})`,
		opacity: String(t),
		pointerEvents: composerActive.value && t > 0.4 ? ('auto' as const) : ('none' as const),
	};
});

function closeLifted() {
	zoom.closeLift();
}

function closeComposer() {
	// Step back one level — from z=3 to z=2 (still lifted, just back to
	// the focused card). Pressing back from there closes the lift.
	zoom.setZ(2);
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

		<!-- Lifted leaf overlay — z=2 focus. Click backdrop to close back to
		     the river. Active id comes from the composable singleton (the
		     river handed it over via lift()). Source rect drives FLIP. -->
		<div
			v-if="liftedActive"
			class="composition-canvas__lifted"
			:style="liftedStyle"
			@click.self="closeLifted"
		>
			<slot
				name="lifted"
				:active-id="zoom.activeId.value"
				:post="activePost"
				:email="activeEmail"
				:loading="activePostLoading"
				:close="closeLifted"
			>
				<div v-if="activePostLoading" class="composition-canvas__lifted-stub">
					<Icon name="lucide:loader-2" class="w-5 h-5 animate-spin mb-2 opacity-60" />
					<p class="text-xs text-muted-foreground">Loading…</p>
				</div>
				<div v-else-if="activePostErr" class="composition-canvas__lifted-stub">
					<Icon name="lucide:alert-circle" class="w-5 h-5 mb-2 text-rose-500" />
					<p class="text-xs text-foreground">{{ activePostErr }}</p>
					<button
						type="button"
						class="composition-canvas__lifted-close"
						@click="closeLifted"
					>
						Back to river
					</button>
				</div>
				<EmailLiftedCard
					v-else-if="activeKind === 'email' && activeEmail"
					:composition="activeEmail"
					:source-rect="zoom.sourceRect.value"
				/>
				<LiftedCard
					v-else-if="activePost"
					:post="activePost"
					:source-rect="zoom.sourceRect.value"
				/>
			</slot>
		</div>

		<!-- z=3 composer overlay. Mounts when the user crosses the composer
		     threshold AND we have an activeId. Sits above the lifted card
		     via z-index; click outside the composer surface drops back to
		     z=2 so the lifted card is the natural fallback. -->
		<div
			v-if="composerActive"
			class="composition-canvas__composer"
			:style="composerStyle"
			@click.self="closeComposer"
		>
			<EmailComposer
				v-if="zoom.activeId.value && activeKind === 'email'"
				:touch-id="zoom.activeId.value"
				@close="closeComposer"
				@saved="onEmailComposerSaved"
			/>
			<CompositionComposer
				v-else-if="zoom.activeId.value"
				:post-id="zoom.activeId.value"
				@close="closeComposer"
				@saved="onComposerSaved"
			/>
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

.composition-canvas__composer {
	@apply absolute inset-0 z-20 flex items-start justify-center
		px-4 py-6 overflow-hidden;
	transform-origin: center top;
	will-change: transform, opacity;
	transition:
		transform 400ms cubic-bezier(0.36, 0.66, 0.04, 1),
		opacity 400ms cubic-bezier(0.36, 0.66, 0.04, 1);
	background: hsl(var(--accent-h, 220) 30% 6% / 0.42);
	backdrop-filter: blur(6px);
}

.composition-canvas[data-gesturing='true'] .composition-canvas__composer {
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
