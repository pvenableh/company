<template>
	<svg
		ref="svgEl"
		class="earnest-mark"
		:width="size"
		:height="size"
		viewBox="0 0 256 256"
		fill="none"
		xmlns="http://www.w3.org/2000/svg"
		role="img"
		:aria-label="ariaLabel"
	>
		<defs>
			<linearGradient id="ear-spark" x1="0" y1="0" x2="1" y2="1">
				<stop offset="0" stop-color="#00ff87" />
				<stop offset="1" stop-color="#4da6ff" />
			</linearGradient>
			<!-- colored glow spread for the celebrate sparkles -->
			<filter id="ear-glow" x="-80%" y="-80%" width="260%" height="260%">
				<feDropShadow dx="0" dy="0" stdDeviation="5" flood-color="#00ff87" flood-opacity="0.85" />
			</filter>
		</defs>

		<!-- The mark itself: one morphing path (the Earnest "E" at rest) + the
		     brand dot. Grouped so a gesture can pop the whole lockup. -->
		<g id="ear-mark">
			<path id="ear-morph" :d="SHAPES.E" fill="currentColor" />

			<!-- two grey thinking-dots (hidden until `think`); the blue dot below
			     becomes the third, so the "…" ends on the brand accent. -->
			<circle id="ear-dot-l" cx="80" cy="140" r="13" fill="currentColor" opacity="0" />
			<circle id="ear-dot-m" cx="128" cy="140" r="13" fill="currentColor" opacity="0" />

			<!-- the period — the brand's blue dot, a small live actor -->
			<circle id="ear-dot" cx="242.6" cy="221.9" r="12" fill="#00BFFF" />

			<!-- celebrate sparkles: a ring around the mark, on top, burst outward -->
			<g id="ear-sparks" opacity="0" filter="url(#ear-glow)">
				<circle class="ear-spark" cx="128" cy="16" r="9" fill="url(#ear-spark)" />
				<circle class="ear-spark" cx="236" cy="82" r="7" fill="url(#ear-spark)" />
				<circle class="ear-spark" cx="214" cy="214" r="8" fill="url(#ear-spark)" />
				<circle class="ear-spark" cx="42" cy="214" r="7" fill="url(#ear-spark)" />
				<circle class="ear-spark" cx="20" cy="82" r="8" fill="url(#ear-spark)" />
			</g>
		</g>
	</svg>
</template>

<script setup lang="ts">
/**
 * <EarnestMark> — the Earnest logo, alive.
 *
 * At rest it's the brand mark: the serif "E" + its blue dot. On a real event it
 * morphs the "E" into a gesture (thumbs-up, clap, check, star) for a beat, then
 * melts back. `think` is the only sustained state — the E becomes a "…" typing
 * indicator (ending on the blue dot). Monochrome `currentColor` so it drops onto any surface
 * and inherits the surrounding text color, exactly like the logo; the blue dot
 * carries the brand accent and bursts into mint→blue sparkles on a celebrate.
 *
 * Rigged for GSAP MorphSVG: one morphable <path id="ear-morph">, a stable
 * #ear-mark group for the pop, #ear-dot and #ear-sparks for accent motion.
 */
import { gsap } from 'gsap';

const props = withDefaults(
	defineProps<{
		size?: number | string;
		/** Freeze at the resting "E" — reduced-motion / disabled. */
		still?: boolean;
	}>(),
	{ size: 40, still: false },
);

const ariaLabel = 'Earnest';

// Morph targets. `E` is the resting logo (baked into the 256 artboard); the
// gestures are single-path glyphs normalized to the same box.
const SHAPES = {
	E: 'M68.38 226.32V29.68H42.59V25H198.76L202.27 74.74H197.58C197.58 41.09 175.32 29.68 144.26 29.68H98.26V123.9H120.24C150.71 123.9 153.64 105.47 153.64 86.45H158.32V164.28H153.64C153.64 142.05 150.71 128.58 119.94 128.58H98.26V226.32H138.4C185.87 226.32 208.72 220.76 208.72 171.01H213.41V231H42.59V226.32H68.38Z',
	thumbsup:
		'M234 80.12A24 24 0 0 0 216 72h-56V56a40 40 0 0 0-40-40a8 8 0 0 0-7.16 4.42L75.06 96H32a16 16 0 0 0-16 16v88a16 16 0 0 0 16 16h172a24 24 0 0 0 23.82-21l12-96A24 24 0 0 0 234 80.12M32 112h40v88H32Z',
	clap:
		'M188.87 65a18 18 0 0 0-31.25 18l-24.26-42a18 18 0 0 0-31.22 18L96.4 49a18 18 0 0 0-31.22 18l3.34 5.77A26 26 0 0 0 39.74 111l3 5.2A26 26 0 0 0 23.5 155l35.27 61a80.14 80.14 0 0 0 149.52-39.57a71.92 71.92 0 0 0 1.71-74.85Zm1.2 127.56A64.12 64.12 0 0 1 72.65 208l-35.27-61a10 10 0 0 1 17.34-10L75 172a8 8 0 0 0 13.87-8l-35.25-61A10 10 0 0 1 71 93l31.81 55a8 8 0 0 0 13.87-8l-26-45a10 10 0 0 1 17.35-10l36.5 63a8 8 0 0 0 13.87-8l-12.6-21.75a10 10 0 0 1 17.64-9.25l20.22 35a63.52 63.52 0 0 1 6.41 48.57ZM160.22 24V8a8 8 0 0 1 16 0v16a8 8 0 0 1-16 0m33.22 6l8-13.1a8 8 0 0 1 13.68 8.33l-8 13.11a8 8 0 0 1-6.84 3.83A8 8 0 0 1 193.44 30m45 33.66l-15.05 4.85a8.2 8.2 0 0 1-2.46.39a8 8 0 0 1-2.46-15.62l15.06-4.85a8 8 0 1 1 4.91 15.23',
	check:
		'M243.31 90.91l-128.4 128.4a16 16 0 0 1-22.62 0l-71.62-72a16 16 0 0 1 0-22.61l20-20a16 16 0 0 1 22.58 0L104 144.22l96.76-95.57a16 16 0 0 1 22.59 0l19.95 19.54a16 16 0 0 1 .01 22.72Z',
	star:
		'M234.29 114.85l-45 38.83L203 211.75a16.4 16.4 0 0 1-24.5 17.82L128 198.49l-50.53 31.08A16.4 16.4 0 0 1 53 211.75l13.76-58.07l-45-38.83A16.46 16.46 0 0 1 31.08 86l59-4.76l22.76-55.08a16.36 16.36 0 0 1 30.27 0l22.75 55.08l59 4.76a16.46 16.46 0 0 1 9.37 28.86Z',
};

type Gesture = 'thumbsup' | 'clap' | 'check' | 'celebrate' | 'think' | 'idle';

const svgEl = ref<SVGSVGElement | null>(null);
const els: Record<string, SVGElement | null> = {};
function q(id: string) {
	return svgEl.value?.querySelector<SVGElement>(`#${id}`) ?? null;
}

let morphOk = false;
let ready = false;
let thinkTl: gsap.core.Timeline | null = null;
let current = 'E';

const MIN_GAP = 700;
let lastReactAt = -Infinity;

async function ensureMorph() {
	try {
		const mod = await import('gsap/MorphSVGPlugin');
		gsap.registerPlugin(mod.MorphSVGPlugin);
		morphOk = true;
	} catch {
		morphOk = false;
	}
}

function morphTo(shape: keyof typeof SHAPES, dur = 0.4, ease = 'power3.inOut') {
	const p = els.morph;
	if (!p) return;
	current = shape;
	const d = SHAPES[shape];
	if (morphOk) {
		gsap.to(p, { duration: dur, ease, morphSVG: d, overwrite: 'auto' });
	} else {
		gsap.to(p, {
			duration: dur / 2,
			opacity: 0.4,
			overwrite: 'auto',
			onComplete: () => {
				p.setAttribute('d', d);
				gsap.to(p, { duration: dur / 2, opacity: 1 });
			},
		});
	}
}

/** A quick springy scale-pop of the whole lockup (with an optional tilt). */
function pop(scale = 1.14, rot = 0) {
	if (!els.mark) return;
	gsap
		.timeline({ defaults: { transformOrigin: '50% 55%', overwrite: 'auto' } })
		.to(els.mark, { duration: 0.16, scale, rotation: rot, ease: 'power2.out' })
		.to(els.mark, { duration: 0.6, scale: 1, rotation: 0, ease: 'elastic.out(1, 0.45)' });
}

/** The dot does a little hop and flashes the accent. */
function dotHop() {
	if (!els.dot) return;
	gsap
		.timeline({ defaults: { transformOrigin: '50% 50%', overwrite: 'auto' } })
		.to(els.dot, { duration: 0.14, y: -10, scale: 1.3, ease: 'power2.out' })
		.to(els.dot, { duration: 0.45, y: 0, scale: 1, ease: 'bounce.out' });
}

// ── Gestures: morph out → hold → melt back to the E ─────────────────────────
// `rot` gives a subtle upward tilt as the gesture lands (thumbs-up / clap).
function gestureOnce(shape: keyof typeof SHAPES, hold = 0.7, rot = 0) {
	morphTo(shape, 0.42, 'back.out(1.6)');
	pop(1.14, rot);
	dotHop();
	gsap.delayedCall(hold, () => morphTo('E', 0.5, 'power3.inOut'));
}

// thumbs-up: rises from a slight downward tilt up to level, with an elastic
// overshoot (thumb swings up and settles).
function thumbsUp(hold = 0.7) {
	morphTo('thumbsup', 0.42, 'back.out(1.6)');
	if (els.mark) {
		const tl = gsap.timeline({ defaults: { transformOrigin: '50% 62%', overwrite: 'auto' } });
		// wind up: dip down a touch, then swing up with an elastic settle
		tl.fromTo(els.mark, { rotation: 0 }, { rotation: 15, duration: 0.16, ease: 'power2.out' }, 0);
		tl.to(els.mark, { rotation: 0, duration: 0.9, ease: 'elastic.out(1, 0.4)' }, 0.16);
		tl.to(els.mark, { duration: 0.16, scale: 1.14, ease: 'power2.out' }, 0);
		tl.to(els.mark, { duration: 0.6, scale: 1, ease: 'elastic.out(1, 0.5)' }, 0.16);
	}
	dotHop();
	gsap.delayedCall(hold, () => morphTo('E', 0.5, 'power3.inOut'));
}

function clap() {
	// morph to hands, tilt up a touch, then a quick double "clap" shake
	morphTo('clap', 0.4, 'back.out(1.6)');
	dotHop();
	if (els.mark)
		gsap
			.timeline({ defaults: { transformOrigin: '50% 55%', overwrite: 'auto' } })
			.to(els.mark, { duration: 0.1, scaleX: 0.86, rotation: -9, ease: 'power2.in' })
			.to(els.mark, { duration: 0.12, scaleX: 1.06, ease: 'power2.out' })
			.to(els.mark, { duration: 0.09, scaleX: 0.9, ease: 'power2.in' }, '+=0.04')
			.to(els.mark, { duration: 0.5, scaleX: 1, rotation: 0, ease: 'elastic.out(1, 0.5)' });
	gsap.delayedCall(0.9, () => morphTo('E', 0.5, 'power3.inOut'));
}

function celebrate() {
	morphTo('star', 0.4, 'back.out(2)');
	pop(1.22);
	// the blue dot collapses; sparkles fly out of the centre at varied speeds
	if (els.dot) gsap.to(els.dot, { duration: 0.2, scale: 0, transformOrigin: '50% 50%', overwrite: 'auto' });
	const sparks = svgEl.value?.querySelectorAll<SVGCircleElement>('.ear-spark');
	if (els.sparks && sparks?.length) {
		gsap.set(els.sparks, { opacity: 1 });
		// staggered, each drifts outward from centre → past its ring slot, own speed
		const speeds = [0.5, 0.72, 0.44, 0.82, 0.6];
		sparks.forEach((sp, i) => {
			const cx = +(sp.getAttribute('cx') || '128');
			const cy = +(sp.getAttribute('cy') || '128');
			const dx = cx - 128; // outward vector from centre
			const dy = cy - 128;
			const dur = speeds[i % speeds.length];
			const delay = i * 0.09;
			gsap.fromTo(
				sp,
				{ x: -dx * 0.9, y: -dy * 0.9, scale: 0, opacity: 0, transformOrigin: '50% 50%' },
				{ duration: dur, x: dx * 0.18, y: dy * 0.18, scale: 1, opacity: 1, ease: 'power3.out', delay, overwrite: 'auto' },
			);
			// keep drifting outward while fading
			gsap.to(sp, { duration: 0.55, x: dx * 0.4, y: dy * 0.4, scale: 0, opacity: 0, delay: delay + dur + 0.15, ease: 'power1.in' });
		});
	}
	gsap.delayedCall(1.15, () => {
		morphTo('E', 0.5, 'power3.inOut');
		if (els.dot) gsap.to(els.dot, { duration: 0.4, scale: 1, ease: 'back.out(2)' });
	});
	gsap.delayedCall(1.7, () => {
		if (els.sparks) gsap.set(els.sparks, { opacity: 0 });
	});
}

// ── think: the E becomes a "…" typing indicator (loops) ─────────────────────
// Two grey dots come from the morphed E; the blue dot flies in as the third,
// so the ellipsis ends on the brand accent. Each dot bounces in sequence.
const THINK_DOTS =
	'M67 140a13 13 0 1 0 26 0a13 13 0 1 0 -26 0ZM115 140a13 13 0 1 0 26 0a13 13 0 1 0 -26 0Z';

function killThinkLoop() {
	if (thinkTl) {
		thinkTl.kill();
		thinkTl = null;
	}
}

function startThink() {
	killThinkLoop();
	current = 'thinkdots';
	// morph the E into the two left dots; fly the blue dot to the third slot
	if (els.morph) {
		if (morphOk) gsap.to(els.morph, { duration: 0.4, morphSVG: THINK_DOTS, ease: 'power3.inOut', overwrite: 'auto' });
		else els.morph.setAttribute('d', THINK_DOTS);
	}
	if (els.dot) gsap.to(els.dot, { duration: 0.4, attr: { cx: 176, cy: 140, r: 13 }, ease: 'power3.inOut', overwrite: 'auto' });

	// once formed, swap the morph-path for 3 independently-bounceable dots
	gsap.delayedCall(0.42, () => {
		if (current !== 'thinkdots') return;
		if (els.morph) gsap.set(els.morph, { opacity: 0 });
		if (els.dotL) gsap.set(els.dotL, { opacity: 1, y: 0 });
		if (els.dotM) gsap.set(els.dotM, { opacity: 1, y: 0 });
		const dots = [els.dotL, els.dotM, els.dot].filter(Boolean) as SVGElement[];
		thinkTl = gsap.timeline({ repeat: -1, defaults: { overwrite: 'auto' } });
		dots.forEach((d, i) => {
			thinkTl!
				.to(d, { duration: 0.26, y: -16, ease: 'sine.out', transformOrigin: '50% 50%' }, i * 0.16)
				.to(d, { duration: 0.42, y: 0, ease: 'sine.in' }, i * 0.16 + 0.26);
		});
		thinkTl.to({}, { duration: 0.4 }); // a beat before the loop repeats
	});
}

function stopThink() {
	killThinkLoop();
	if (current !== 'thinkdots') return;
	current = 'E';
	if (els.dotL) gsap.to(els.dotL, { duration: 0.2, opacity: 0, y: 0, overwrite: 'auto' });
	if (els.dotM) gsap.to(els.dotM, { duration: 0.2, opacity: 0, y: 0, overwrite: 'auto' });
	if (els.morph) {
		els.morph.setAttribute('d', SHAPES.E);
		gsap.fromTo(els.morph, { opacity: 0 }, { duration: 0.3, opacity: 1, overwrite: 'auto' });
	}
	if (els.dot)
		gsap.to(els.dot, { duration: 0.3, attr: { cx: 242.6, cy: 221.9, r: 12 }, y: 0, ease: 'power2.out', overwrite: 'auto' });
}

export type MarkGesture = Gesture;

function react(g: Gesture) {
	if (!ready || props.still) return;
	const now = Date.now();
	const bypass = g === 'think' || g === 'idle' || g === 'celebrate';
	if (!bypass && now - lastReactAt < MIN_GAP) return;
	lastReactAt = now;
	if (g !== 'think') stopThink();

	switch (g) {
		case 'thumbsup':
			thumbsUp();
			break;
		case 'check':
			gestureOnce('check', 0.6);
			break;
		case 'clap':
			clap();
			break;
		case 'celebrate':
			celebrate();
			break;
		case 'think':
			startThink();
			break;
		case 'idle':
			if (current !== 'E') morphTo('E', 0.45);
			break;
	}
}

onMounted(async () => {
	els.mark = q('ear-mark');
	els.morph = q('ear-morph');
	els.dot = q('ear-dot');
	els.dotL = q('ear-dot-l');
	els.dotM = q('ear-dot-m');
	els.sparks = q('ear-sparks');
	await ensureMorph();
	ready = true;
});

onBeforeUnmount(() => {
	stopThink();
	if (svgEl.value) gsap.killTweensOf(svgEl.value.querySelectorAll('*'));
});

watch(
	() => props.still,
	(still) => {
		if (still) {
			stopThink();
			if (els.morph) {
				els.morph.setAttribute('d', SHAPES.E);
				current = 'E';
			}
		}
	},
);

defineExpose({ react, morphOk: () => morphOk });
</script>

<style scoped>
.earnest-mark {
	display: block;
	overflow: visible;
}
</style>
