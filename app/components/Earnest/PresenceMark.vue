<script setup lang="ts">
/**
 * <EarnestPresenceMark> — the brand lockup, alive: the "E." icon that unfurls
 * into the "Earnest." wordmark, and folds back.
 *
 * Both source marks (the icon E + the full wordmark) live in one coordinate
 * frame. GSAP does the reveal on a single interruptible timeline:
 *   • MorphSVG glides the leading glyph from the icon-E (centred) to the
 *     wordmark-E (leading) — the icon *is* the E of the word,
 *   • the viewBox widens from a square icon crop to the full wordmark,
 *   • "arnest" fades + drifts in on a stagger,
 *   • the blue period dot slides from beside the E to after the "t".
 *
 * Monochrome `currentColor` for the glyphs (drops onto any surface, inherits
 * text colour like a logo); the brand-blue dot is the one live accent. MorphSVG
 * is premium but optional — without it the glyph cross-fades instead. Honours
 * reduced motion by snapping to the target state.
 */
import { gsap } from 'gsap';
import { ensureEarnestGsap } from '~/composables/useEarnestPresence';

const props = withDefaults(
	defineProps<{
		/** true = wordmark, false = icon. Two-way friendly via update:expanded. */
		expanded?: boolean;
		/** Height in px; width follows the current frame's aspect ratio. */
		height?: number | string;
		/** Play the icon→wordmark reveal once, shortly after mount. */
		autoReveal?: boolean;
		/** Freeze (reduced-motion / disabled) — render the target state, no motion. */
		still?: boolean;
	}>(),
	{ expanded: false, height: 30, autoReveal: false, still: false },
);
const emit = defineEmits<{ 'update:expanded': [boolean] }>();

// Leading glyph — the same E, in two guises (normalized to one frame; see
// scratchpad/normalize.mjs for how the icon-E was mapped into wordmark space).
const E_ICON =
	'M326.734 138.6 V4.2 H309.106 V1 H415.878 L418.282 35 H415.077 C415.077 12 399.852 4.2 378.618 4.2 H347.167 V68.6 H362.191 C383.025 68.6 385.028 56 385.028 43 H388.233 V96.2 H385.028 C385.028 81 383.025 71.8 361.991 71.8 H347.167 V138.6 H374.611 C407.064 138.6 422.689 134.8 422.689 100.8 H425.894 V141.8 H309.106 V138.6 H326.734 Z';
const E_WORD =
	'M18.5996 138.6V4.19976H0V0.999756H107.6L110 34.9998H106.8C106.8 11.9998 91.5996 4.19976 70.3996 4.19976H38.9996V68.5998H53.9996C74.7996 68.5998 76.7996 55.9998 76.7996 42.9998H79.9996V96.1998H76.7996C76.7996 80.9998 74.7996 71.7998 53.7996 71.7998H38.9996V138.6H66.3996C98.7996 138.6 114.4 134.8 114.4 100.8H117.6V141.8H0.999634V138.6H18.5996Z';

// The trailing letters of "Earnest" (native wordmark coords), hidden at rest.
const LETTERS = [
	'M216.398 78.5999V131C216.398 134.8 216.998 139.8 222.398 139.8C226.998 139.8 229.798 136 232.798 131.8L234.998 133.4C231.198 140 225.998 144.2 217.398 144.2C207.998 144.2 201.198 138.8 199.798 131.8H199.398C192.598 140.8 183.598 144.2 170.398 144.2C154.798 144.2 145.398 136.4 145.398 122.8C145.398 100.4 175.198 94.7999 195.798 94.7999H199.598V70.1999C199.598 60.7999 190.798 58.5999 183.198 58.5999C177.398 58.5999 163.798 60.7999 163.798 67.9999C163.798 72.7999 170.398 70.5999 170.398 79.5999C170.398 84.3999 166.398 87.9999 161.198 87.9999C155.598 87.9999 152.398 83.5999 152.398 76.7999C152.398 66.5999 163.198 55.3999 183.198 55.3999C198.398 55.3999 216.398 63.1999 216.398 78.5999ZM199.598 97.9999H196.198C181.598 97.9999 163.398 98.3999 163.398 119.8C163.398 131 165.198 139.4 177.998 139.4C192.998 139.4 199.598 128.2 199.598 124.2V97.9999Z', // a
	'M262.398 138.6V62.9999H245.598V59.7999H262.398C268.798 59.7999 275.198 59.3999 279.198 55.3999V78.9999H279.598C281.998 69.9999 288.998 55.3999 305.398 55.3999C312.798 55.3999 318.598 60.1999 318.598 67.1999C318.598 72.3999 315.398 76.5999 309.398 76.5999C302.798 76.5999 300.598 73.1999 300.598 67.7999C300.598 63.3999 302.798 60.3999 304.998 59.1999C304.198 58.5999 303.198 58.5999 302.198 58.5999C293.998 58.5999 279.198 71.5999 279.198 97.5999V138.6H297.398V141.8H245.598V138.6H262.398Z', // r
	'M345.132 138.6V62.9999H329.332V59.7999H345.132C354.732 59.7999 358.332 59.7999 361.932 55.3999V75.7999H362.332C367.532 66.1999 377.532 55.3999 392.132 55.3999C413.532 55.3999 419.532 66.1999 419.532 77.9999V138.6H435.332V141.8H386.932V138.6H402.732V73.1999C402.732 62.1999 397.332 58.5999 390.932 58.5999C374.132 58.5999 365.532 75.3999 361.932 82.1999V138.6H377.132V141.8H329.332V138.6H345.132Z', // n
	'M470.665 91.9999V110.8C470.465 125 472.465 141 491.265 141C508.065 141 520.465 129.8 523.265 113.4H526.465C523.265 131.8 509.665 144.2 491.265 144.2C467.865 144.2 451.465 126.2 451.465 99.7999C451.465 80.3999 467.065 55.3999 488.865 55.3999C512.465 55.3999 524.665 81.7999 524.665 90.1999C524.665 91.3999 524.065 91.9999 522.865 91.9999H470.665ZM505.465 87.3999V83.1999C505.465 70.3999 502.065 58.5999 488.865 58.5999C474.865 58.5999 470.665 70.3999 470.665 83.1999V88.7999H504.065C505.065 88.7999 505.465 88.1999 505.465 87.3999Z', // e
	'M548.932 143L548.532 112.8H551.133C552.733 123 557.932 141 578.932 141C589.932 141 598.332 133.8 598.332 122.4C598.332 106.6 586.332 106.4 575.732 105.2C562.732 103.8 550.133 102 550.133 81.1999C550.133 66.7999 559.533 55.3999 575.133 55.3999C585.933 55.3999 593.332 62.3999 595.332 62.3999C596.532 62.3999 596.732 60.9999 596.732 58.1999V56.5999H599.532L600.332 80.3999H597.732C596.332 68.9999 590.332 58.5999 574.532 58.5999C564.332 58.5999 556.133 64.1999 556.133 74.5999C556.133 84.9999 563.933 88.5999 577.133 89.3999L583.932 89.7999C600.132 90.7999 606.732 99.5999 606.732 113.4C606.732 132 594.332 144.2 578.932 144.2C563.132 144.2 558.332 135.6 554.332 135.6C551.732 135.6 552.332 138.8 551.932 143H548.932Z', // s
	'M641.867 126.4V62.9998H624.467V59.7998C645.267 60.1998 652.867 51.3998 656.267 31.7998H658.667V59.7998H686.267V62.9998H658.667V130.2C658.667 138.4 662.067 141 668.467 141C678.467 141 682.867 131.8 684.067 128.4L687.067 129C685.667 133.8 679.867 144.2 665.067 144.2C651.067 144.2 641.867 139.6 641.867 126.4Z', // t
];

// viewBox crops + dot positions for each end state.
const REST_VB = '300 -7 165 160';
const FULL_VB = '-8 -7 751 160';
const REST_DOT = { cx: 447.4, cy: 132.6, r: 11.1 };
const FULL_DOT = { cx: 722.9, cy: 134, r: 10.2 };

const svgEl = ref<SVGSVGElement | null>(null);
const eEl = ref<SVGPathElement | null>(null);
const dotEl = ref<SVGCircleElement | null>(null);
const letterEls = ref<SVGPathElement[]>([]);

let tl: gsap.core.Timeline | null = null;
let morphOk = false;
let building: Promise<void> | null = null;

const isExpanded = ref(props.expanded);
const vb = ref(props.expanded ? FULL_VB : REST_VB);

function frameProxy() {
	const [x, y, w, h] = vb.value.split(' ').map(Number);
	return { x, y, w, h };
}

async function build() {
	if (tl || building) return building ?? Promise.resolve();
	building = (async () => {
		const { morph } = await ensureEarnestGsap();
		morphOk = morph;
		const e = eEl.value, dot = dotEl.value, svg = svgEl.value;
		if (!e || !dot || !svg) return;

		// Collapsed baseline.
		e.setAttribute('d', E_ICON);
		gsap.set(dot, { attr: REST_DOT });
		gsap.set(letterEls.value, { opacity: 0, x: -10 });

		const frame = frameProxy();
		Object.assign(frame, { x: 300, y: -7, w: 165, h: 160 });
		const paintVB = () => svg.setAttribute('viewBox', `${frame.x.toFixed(1)} ${frame.y.toFixed(1)} ${frame.w.toFixed(1)} ${frame.h.toFixed(1)}`);

		tl = gsap.timeline({ paused: true, defaults: { ease: 'power3.inOut' } });
		// glyph icon → word
		if (morphOk) {
			tl.to(e, { duration: 0.9, morphSVG: E_WORD }, 0);
		} else {
			tl.to(e, { duration: 0.45, opacity: 0.35, ease: 'power1.in' }, 0)
				.add(() => e.setAttribute('d', E_WORD), 0.45)
				.to(e, { duration: 0.45, opacity: 1, ease: 'power1.out' }, 0.45);
		}
		// frame widens
		tl.to(frame, { x: -8, y: -7, w: 751, h: 160, duration: 0.9, onUpdate: paintVB }, 0);
		// the word unfurls
		tl.to(letterEls.value, { opacity: 1, x: 0, duration: 0.5, stagger: 0.055, ease: 'power2.out' }, 0.28);
		// the period walks to the end
		tl.to(dot, { attr: FULL_DOT, duration: 0.8, ease: 'power2.inOut' }, 0.12);
	})();
	await building;
	building = null;
}

async function play(toExpanded: boolean) {
	isExpanded.value = toExpanded;
	if (props.still) { snap(toExpanded); return; }
	await build();
	if (!tl) { snap(toExpanded); return; }
	toExpanded ? tl.play() : tl.reverse();
}

function snap(toExpanded: boolean) {
	const e = eEl.value, dot = dotEl.value, svg = svgEl.value;
	if (!e || !dot || !svg) return;
	e.setAttribute('d', toExpanded ? E_WORD : E_ICON);
	gsap.set(dot, { attr: toExpanded ? FULL_DOT : REST_DOT });
	gsap.set(letterEls.value, { opacity: toExpanded ? 1 : 0, x: 0 });
	svg.setAttribute('viewBox', toExpanded ? FULL_VB : REST_VB);
	vb.value = toExpanded ? FULL_VB : REST_VB;
}

function expand() { play(true); }
function collapse() { play(false); }
function toggle() { const next = !isExpanded.value; emit('update:expanded', next); play(next); }

watch(() => props.expanded, (v) => { if (v !== isExpanded.value) play(v); });
watch(() => props.still, (s) => { if (s) snap(isExpanded.value); });

onMounted(() => {
	letterEls.value = Array.from(svgEl.value?.querySelectorAll<SVGPathElement>('.pm-letter') ?? []);
	snap(props.expanded); // deterministic starting frame (no flash)
	if (props.autoReveal && !props.still && !props.expanded) {
		build().then(() => gsap.delayedCall(0.45, () => play(true)));
	}
});

onBeforeUnmount(() => {
	tl?.kill(); tl = null;
	if (svgEl.value) gsap.killTweensOf(svgEl.value.querySelectorAll('*'));
});

defineExpose({ expand, collapse, toggle, isExpanded });
</script>

<template>
	<svg
		ref="svgEl"
		class="earnest-presence-mark"
		:viewBox="vb"
		:style="{ height: typeof height === 'number' ? height + 'px' : height }"
		fill="none"
		xmlns="http://www.w3.org/2000/svg"
		role="img"
		aria-label="Earnest"
		@click="$attrs.onClick ? undefined : toggle()"
	>
		<!-- trailing letters of the wordmark (hidden until it unfurls) -->
		<path v-for="(d, i) in LETTERS" :key="i" class="pm-letter" :d="d" fill="currentColor" />
		<!-- the leading glyph: the morphing E -->
		<path ref="eEl" :d="E_ICON" fill="currentColor" />
		<!-- the period — the brand's live blue dot -->
		<circle ref="dotEl" :cx="REST_DOT.cx" :cy="REST_DOT.cy" :r="REST_DOT.r" fill="#00BFFF" />
	</svg>
</template>

<style scoped>
.earnest-presence-mark {
	display: block;
	width: auto;
	overflow: visible;
	cursor: pointer;
}
/* Hidden until GSAP reveals them — keeps SSR/pre-hydration paint as a clean
   "E." icon instead of flashing the whole word. gsap.set writes inline opacity
   which wins once the reveal (or a reduced-motion snap) runs. */
.pm-letter { opacity: 0; }
</style>
