<script setup lang="ts">
/**
 * <EarnestPresenceDot> — a tiny living presence, sized for a button or chip.
 *
 * The full <EarnestAura> is a viewport-scale Focus backdrop (its orbs are sized
 * in vmax), so shrunk into a 36px circle it just fills solid. This is the small
 * counterpart: two or three soft, blurred brand-blue orbs that FLOAT and breathe
 * inside their circle — Earnest's presence, distilled to a dot. GSAP owns the
 * drift (per the motion policy); reduced motion settles it to a calm centre.
 *
 *   <button class="relative size-9 rounded-full overflow-hidden">
 *     <EarnestPresenceDot />
 *   </button>
 *
 * Renders on a light OR dark surface (normal blend, real opacity) — no dark
 * ground required. Pointer-transparent; the host button owns interaction.
 */
import { gsap } from 'gsap';

const props = withDefaults(defineProps<{
	/** Overall liveliness of the drift (1 = calm float; >1 = livelier). */
	pace?: number;
}>(), { pace: 1 });

const rootEl = ref<HTMLElement | null>(null);
let tweens: gsap.core.Tween[] = [];
let reduce = false;

// Deterministic orbs (no Math.random → SSR/hydration stable). Positions +
// drifts are in % / px, tuned to float within the circle without ever leaving.
const ORBS = [
	{ w: 74, l: 14, t: 10, from: '#38bdf8', dx: 3.2, dy: 2.6, dur: 5.4, scale: 1.14, o: 0.9 },
	{ w: 58, l: 40, t: 42, from: '#22d3ee', dx: -2.8, dy: 3.0, dur: 6.6, scale: 1.18, o: 0.72 },
	{ w: 46, l: 26, t: 48, from: '#6a8cff', dx: 2.4, dy: -2.4, dur: 7.4, scale: 1.2, o: 0.6 },
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
</template>

<style scoped>
.pdot {
	position: absolute; inset: 0; overflow: hidden; border-radius: inherit;
	pointer-events: none;
	/* soft focus — the orbs melt into one gently glowing presence */
	filter: blur(2.5px) saturate(1.05);
}
.pdot__orb {
	position: absolute; border-radius: 50%;
	will-change: transform;
}
</style>
