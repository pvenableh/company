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
}>(), { pace: 1, aperture: false });

const rootEl = ref<HTMLElement | null>(null);
let tweens: gsap.core.Tween[] = [];
let reduce = false;

// Deterministic orbs (no Math.random → SSR/hydration stable). Positions +
// drifts are in % / px, tuned to float as one soft blob roughly centred.
const ORBS = [
	{ w: 72, l: 14, t: 12, from: '#38bdf8', dx: 3.2, dy: 2.6, dur: 5.4, scale: 1.14, o: 0.9 },
	{ w: 56, l: 34, t: 40, from: '#22d3ee', dx: -2.8, dy: 3.0, dur: 6.6, scale: 1.18, o: 0.72 },
	{ w: 44, l: 26, t: 30, from: '#6a8cff', dx: 2.4, dy: -2.4, dur: 7.4, scale: 1.2, o: 0.6 },
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
}
function kill() { tweens.forEach((t) => t.kill()); tweens = []; }

onMounted(() => {
	if (import.meta.client) reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	build();
});
onBeforeUnmount(() => { kill(); if (rootEl.value) gsap.killTweensOf(rootEl.value.querySelectorAll('*')); });
</script>

<template>
	<span ref="rootEl" class="pdot" aria-hidden="true">
		<span class="pdot__field">
			<span
				v-for="(o, i) in ORBS"
				:key="i"
				class="pdot__orb"
				:style="{
					width: o.w + '%', height: o.w + '%',
					left: o.l + '%', top: o.t + '%',
					opacity: o.o,
					background: `radial-gradient(circle at 42% 40%, ${o.from}, transparent 68%)`,
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
			stroke="#4ba3e6"
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
.pdot {
	position: absolute; inset: 0;
	pointer-events: none;
}
/* the orbs live in a soft-focus field that floats free — no clip, no chrome */
.pdot__field {
	position: absolute; inset: 0;
	filter: blur(2.5px) saturate(1.05);
}
.pdot__orb {
	position: absolute; border-radius: 50%;
	will-change: transform;
}
/* the iris eases + sharpens on host hover (host carries `group`) */
.pdot__iris {
	position: absolute; inset: 13%;
	width: auto; height: auto;
	filter: blur(0.4px);
	transition: opacity 450ms ease, transform 450ms cubic-bezier(0.36, 0.66, 0.04, 1);
	transform-origin: center;
}
@media (prefers-reduced-motion: reduce) {
	.pdot__iris { transition: none; }
}
</style>
