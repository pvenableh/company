<script setup lang="ts">
/**
 * <EarnestPresenceDot> — a tiny living presence, sized for a button or chip.
 *
 * The full <EarnestAura> is a viewport-scale Focus backdrop (its orbs are sized
 * in vmax), so shrunk into a small circle it just fills solid. This is the small
 * counterpart: two or three soft, blurred brand-blue orbs that FLOAT and breathe
 * — Earnest's presence, distilled to a dot. It floats free (no clipping circle,
 * no chrome) so it can sit bare in the app. GSAP owns the drift (per the motion
 * policy); reduced motion settles it to a calm centre.
 *
 *   <button class="group relative size-9 flex items-center justify-center">
 *     <EarnestPresenceDot aperture />
 *   </button>
 *
 * With `aperture`, a faint iris sits over the orb — almost invisible at rest,
 * easing in on hover of the host (host must carry Tailwind's `group` class). It
 * shares the orb's blue + a soft blur, so it reads as the presence coming into
 * focus, not a hard icon.
 */
import { gsap } from 'gsap';

const props = withDefaults(defineProps<{
	/** Overall liveliness of the drift (1 = calm float; >1 = livelier). */
	pace?: number;
	/** Show a faint iris over the orb that sharpens on host hover. */
	aperture?: boolean;
	/** Override the three orb colours (e.g. from a mood). Interpolates smoothly
	 *  on change via registered @property color vars. Defaults to brand blue. */
	colors?: readonly [string, string, string];
}>(), { pace: 1, aperture: false });

// Drive the orb colours through inherited @property vars so a mood change eases
// instead of snapping (same trick <EarnestAura> uses for its field).
const colorVars = computed(() => (props.colors
	? { '--pd1': props.colors[0], '--pd2': props.colors[1], '--pd3': props.colors[2] }
	: undefined));

const rootEl = ref<HTMLElement | null>(null);
let tweens: gsap.core.Tween[] = [];
let reduce = false;

// Deterministic orbs (no Math.random → SSR/hydration stable). Sized large so the
// glow spreads WELL beyond the glyph (it floats free, unclipped), and drifts in
// % / px so the soft blob wanders. The whole field also breathes (see build()).
const ORBS = [
	{ w: 104, l: 0, t: 2, from: '#38bdf8', dx: 3.6, dy: 3.0, dur: 4.6, scale: 1.2, o: 0.82 },
	{ w: 82, l: 26, t: 34, from: '#22d3ee', dx: -3.2, dy: 3.4, dur: 5.8, scale: 1.24, o: 0.68 },
	{ w: 66, l: 16, t: 22, from: '#6a8cff', dx: 2.8, dy: -2.8, dur: 6.6, scale: 1.26, o: 0.58 },
] as const;

function build() {
	kill();
	const root = rootEl.value;
	if (!root || reduce) return;
	const els = Array.from(root.querySelectorAll<HTMLElement>('.pdot__orb'));
	const p = Math.max(0.2, props.pace);
	els.forEach((el, i) => {
		const o = ORBS[i];
		if (!o) return;
		tweens.push(
			gsap.to(el, { x: o.dx, duration: o.dur / p, ease: 'sine.inOut', repeat: -1, yoyo: true }),
			gsap.to(el, { y: o.dy, duration: (o.dur * 0.82) / p, ease: 'sine.inOut', repeat: -1, yoyo: true, delay: o.dur * 0.15 }),
			gsap.to(el, { scale: o.scale, duration: (o.dur * 0.6) / p, ease: 'sine.inOut', repeat: -1, yoyo: true, delay: i * 0.4 }),
		);
	});
	// The whole field breathes — an obvious, slow pulse (scale + glow) so the
	// presence clearly feels alive, not a static dot.
	const field = root.querySelector<HTMLElement>('.pdot__field');
	if (field) {
		tweens.push(
			gsap.to(field, { scale: 1.14, duration: 1.9 / p, ease: 'sine.inOut', repeat: -1, yoyo: true }),
			gsap.to(field, { opacity: 0.6, duration: 2.4 / p, ease: 'sine.inOut', repeat: -1, yoyo: true }),
		);
	}
}
function kill() { tweens.forEach((t) => t.kill()); tweens = []; }

onMounted(() => {
	if (import.meta.client) {
		reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		// Dev-only: expose the app gsap so a throttled automation tab can advance
		// the ticker to inspect the breathe (see the presence phase strategy).
		if (import.meta.dev) (window as any).__earnestGsap = gsap;
	}
	build();
});
onBeforeUnmount(() => { kill(); if (rootEl.value) gsap.killTweensOf(rootEl.value.querySelectorAll('*')); });
</script>

<template>
	<span ref="rootEl" class="pdot" aria-hidden="true" :style="colorVars">
		<span class="pdot__field">
			<span
				v-for="(o, i) in ORBS"
				:key="i"
				class="pdot__orb"
				:style="{
					width: o.w + '%', height: o.w + '%',
					left: o.l + '%', top: o.t + '%',
					opacity: o.o,
					background: `radial-gradient(circle at 42% 40%, var(--pd${i + 1}, ${o.from}), transparent 68%)`,
				}"
			/>
		</span>

		<!-- The iris: the Focus glyph in the foreground, the orb glowing behind it.
		     Legible at rest so the button reads as "Focus"; sharpens on host hover. -->
		<svg
			v-if="aperture"
			class="pdot__iris opacity-[0.62] scale-[0.96] group-hover:opacity-100 group-hover:scale-100"
			viewBox="0 0 24 24"
			fill="none"
			stroke="#ffffff"
			stroke-width="1.7"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<circle cx="12" cy="12" r="10" />
			<path d="M14.31 8 20.05 17.94" />
			<path d="M9.69 8h11.48" />
			<path d="M7.38 12 13.12 2.06" />
			<path d="M9.69 16 3.95 6.06" />
			<path d="M14.31 16H2.83" />
			<path d="M16.62 12 10.88 21.94" />
		</svg>
	</span>
</template>

<style scoped>
/* Registered so a mood change interpolates the orb colours instead of snapping. */
@property --pd1 { syntax: '<color>'; inherits: true; initial-value: #38bdf8; }
@property --pd2 { syntax: '<color>'; inherits: true; initial-value: #22d3ee; }
@property --pd3 { syntax: '<color>'; inherits: true; initial-value: #6a8cff; }

.pdot {
	position: absolute; inset: 0;
	pointer-events: none;
	transition: --pd1 900ms ease, --pd2 900ms ease, --pd3 900ms ease;
}
/* the orbs live in a soft-focus field that floats free — no clip, no chrome */
.pdot__field {
	position: absolute; inset: 0;
	filter: blur(3.6px) saturate(1.08);
	transform-origin: center;
	will-change: transform, opacity;
}
.pdot__orb {
	position: absolute; border-radius: 50%;
	will-change: transform;
}
/* the iris eases + sharpens on host hover (host carries `group`) */
.pdot__iris {
	position: absolute; inset: 13%;
	width: auto; height: auto;
	transition: opacity 450ms ease, transform 450ms cubic-bezier(0.36, 0.66, 0.04, 1);
	transform-origin: center;
}
@media (prefers-reduced-motion: reduce) {
	.pdot__iris { transition: none; }
}
</style>
