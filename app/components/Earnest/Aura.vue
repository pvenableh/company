<script setup lang="ts">
/**
 * <EarnestAura> — the living body of Earnest's presence.
 *
 * A full-bleed field of soft metaball orbs whose COLOUR IS EARNEST'S MOOD. It
 * breathes when quiet, leans down when you type, gathers to a warm amber spark
 * while it thinks, and blooms mint-gold on earned progress. This is the single
 * shared aura every surface mounts (Focus today; Whisper / Boardroom / Create
 * next) — reshape, never duplicate.
 *
 * Motion is GSAP, everywhere:
 *   • idle drift + breathe = interruptible looping timelines (per orb + core),
 *   • mood changes = eased tweens — colour via gsap.utils.interpolate so the
 *     transition is truly GSAP-driven, not a CSS hand-off,
 *   • energy = a decaying rAF value from useEarnestPresence, read as a CSS var,
 *   • drag = GSAP Draggable (opt-in) so you can tug the field and it springs
 *     back with inertia — proving the Draggable seam the trust-dial will use.
 *
 * Quieter + fuzzier than the first pass: desaturated palettes mixed toward the
 * ground, a bigger blur, and a gentler goo matrix so the orbs melt into one
 * organism instead of popping apart.
 */
import { gsap } from 'gsap';
import { useEarnestPresence, ensureEarnestGsap, EARNEST_GROUND, type EarnestMood, type EarnestPresence } from '~/composables/useEarnestPresence';

const props = withDefaults(
	defineProps<{
		/** Drive the mood from the host (Focus computes it from chat state). */
		mood?: EarnestMood;
		/** Bias the whole field aside to make room (Working table, side panels). */
		aside?: boolean;
		/** Share an existing brain instead of creating one (later phases). */
		presence?: EarnestPresence;
		/** Let the user tug the field; it eases back. Off by default. */
		draggable?: boolean;
		/** Dim the drifting mantra layer (host renders its own text over it). */
		mantras?: readonly string[];
		/** Only surface mantras once true (keeps an opening greeting clean). */
		showMantras?: boolean;
	}>(),
	{ mood: 'reflect', aside: false, draggable: false, showMantras: false },
);

// One brain per aura unless the host lends its own.
const presence = props.presence ?? useEarnestPresence({ initial: props.mood });
const { tokens, reduceMotion, attachRoot, startEnergy, stopEnergy, bump, setMood } = presence;

// Unique filter id so multiple auras never collide on one <filter> in the DOM.
const gooId = `earnest-goo-${useId()}`;

const rootEl = ref<HTMLElement | null>(null);
const fieldEl = ref<HTMLElement | null>(null);
const coreEl = ref<HTMLElement | null>(null);
const orbEls = ref<HTMLElement[]>([]);

let idleTweens: gsap.core.Tween[] = [];
let breatheTl: gsap.core.Timeline | null = null;
let colorTween: gsap.core.Tween | null = null;
let dragInstance: any = null;

// Deterministic per-orb drift targets — a calm, wandering set (no Math.random
// so SSR/hydration and reduced-motion stay stable).
const ORBS = [
	{ w: 46, l: 6, t: 0, dx: 4.5, dy: 3.2, dur: 26, grad: '34% 34%' },
	{ w: 42, l: 60, t: 10, dx: -3.8, dy: 4.0, dur: 31, grad: '60% 40%' },
	{ w: 38, l: 24, t: 64, dx: 3.4, dy: -3.6, dur: 28, grad: '50% 50%' },
	{ w: 30, l: 66, t: 62, dx: -3.0, dy: -2.8, dur: 35, grad: '42% 58%' },
	{ w: 24, l: 44, t: 30, dx: 2.6, dy: 3.0, dur: 21, grad: '50% 40%' },
] as const;
const orbColor = (i: number): 'c1' | 'c2' | 'c3' => (['c1', 'c2', 'c3', 'c1', 'c2'] as const)[i]!;

// ── GSAP idle life: drift (per orb) + breathe (core + field) ─────────────────
function buildIdle() {
	killIdle();
	if (reduceMotion.value) return;
	orbEls.value.forEach((el, i) => {
		const o = ORBS[i];
		if (!el || !o) return;
		idleTweens.push(
			gsap.to(el, {
				xPercent: o.dx * 2,
				yPercent: o.dy * 2,
				scale: 1.07,
				duration: o.dur / 2,
				ease: 'sine.inOut',
				repeat: -1,
				yoyo: true,
			}),
		);
	});
	if (coreEl.value) {
		breatheTl = gsap.timeline({ repeat: -1, yoyo: true })
			.to(coreEl.value, { scale: 1.09, duration: 3.5, ease: 'sine.inOut' });
	}
	applyPace(tokens.value.pace);
}
function killIdle() {
	idleTweens.forEach((t) => t.kill());
	idleTweens = [];
	breatheTl?.kill(); breatheTl = null;
}
/** Retarget idle speed without rebuilding — interruptible, per the motion policy. */
function applyPace(pace: number) {
	idleTweens.forEach((t) => gsap.to(t, { timeScale: pace, duration: 0.8, ease: 'power2.out', overwrite: true }));
}

// ── GSAP mood transition: colour (interpolated) + geometry, both eased ───────
const proxy = { p: 0 };
function toMood(next: EarnestMood, immediate = false) {
	const el = rootEl.value;
	if (!el) return;
	const to = presence.MOOD_TOKENS[next];
	// read the current rendered colours so an interrupted tween resumes honestly
	const cs = getComputedStyle(el);
	const from = {
		c1: cs.getPropertyValue('--c1').trim() || to.c1,
		c2: cs.getPropertyValue('--c2').trim() || to.c2,
		c3: cs.getPropertyValue('--c3').trim() || to.c3,
		warmth: parseFloat(cs.getPropertyValue('--warmth')) || to.warmth,
	};
	const mix = (a: string, b: string, p: number) => gsap.utils.interpolate(a, b, p) as string;
	colorTween?.kill();
	proxy.p = 0;
	const dur = immediate || reduceMotion.value ? 0 : 1.25;
	colorTween = gsap.to(proxy, {
		p: 1,
		duration: dur,
		ease: 'power2.inOut',
		onUpdate: () => {
			const p = proxy.p;
			el.style.setProperty('--c1', mix(from.c1, to.c1, p));
			el.style.setProperty('--c2', mix(from.c2, to.c2, p));
			el.style.setProperty('--c3', mix(from.c3, to.c3, p));
			el.style.setProperty('--warmth', String(from.warmth + (to.warmth - from.warmth) * p));
		},
	});
	// geometry: field gather/open + lean, eased on its own curve
	if (fieldEl.value) {
		gsap.to(fieldEl.value, {
			scale: to.fieldScale * (props.aside ? 0.94 : 1),
			xPercent: props.aside ? -14 : to.fieldShift[0],
			yPercent: to.fieldShift[1],
			duration: immediate || reduceMotion.value ? 0 : 0.9,
			ease: 'power2.inOut',
			overwrite: 'auto',
		});
	}
	applyPace(to.pace);
}

// React to host-driven mood + aside changes. When we own the brain, writing to
// it fires the presence.mood watcher below (single toMood); when a shared brain
// is passed, the host drives presence.setMood and that same watcher handles it.
watch(() => props.mood, (m) => { if (!props.presence) setMood(m); });
watch(() => props.aside, () => toMood(presence.mood.value));
watch(() => presence.mood.value, (m) => toMood(m));

// ── Draggable: tug the field, it springs home ────────────────────────────────
async function wireDrag() {
	if (!props.draggable || reduceMotion.value || !fieldEl.value) return;
	const { draggable } = await ensureEarnestGsap();
	if (!draggable) return;
	const Draggable = (gsap as any).Draggable ?? (await import('gsap/Draggable')).Draggable;
	dragInstance = Draggable.create(fieldEl.value, {
		type: 'x,y',
		inertia: false,
		dragResistance: 0.72,
		onDrag() { bump(0.03); },
		onDragEnd() {
			gsap.to(this.target, { x: 0, y: 0, duration: 1.1, ease: 'elastic.out(1, 0.5)' });
		},
	})[0];
}

// Drifting mantra — a single line surfacing and sinking through the field.
const mantraIdx = ref(0);
let mantraTimer: ReturnType<typeof setInterval> | null = null;
const activeMantra = computed(() => props.mantras?.length ? props.mantras[mantraIdx.value % props.mantras.length] : '');
function startMantras() {
	if (reduceMotion.value || !props.mantras?.length || mantraTimer) return;
	mantraTimer = setInterval(() => { mantraIdx.value++; }, 4800);
}
function stopMantras() { if (mantraTimer) { clearInterval(mantraTimer); mantraTimer = null; } }
watch(() => props.showMantras, (on) => (on ? startMantras() : stopMantras()));

onMounted(async () => {
	orbEls.value = Array.from(rootEl.value?.querySelectorAll<HTMLElement>('.aura__orb') ?? []);
	attachRoot(rootEl.value);
	startEnergy();
	toMood(props.mood, true); // paint the opening mood with no tween
	buildIdle();
	wireDrag();
	if (props.showMantras) startMantras();
});

onBeforeUnmount(() => {
	killIdle();
	colorTween?.kill();
	stopEnergy();
	stopMantras();
	dragInstance?.kill?.();
	if (rootEl.value) gsap.killTweensOf(rootEl.value.querySelectorAll('*'));
});

// Reduced-motion may flip live (rare) — honour it.
watch(reduceMotion, (rm) => { if (rm) { killIdle(); stopEnergy(); } else { startEnergy(); buildIdle(); } });

defineExpose({ bump, presence });
</script>

<template>
	<div ref="rootEl" class="aura" aria-hidden="true">
		<!-- goo filter: merges the orbs into one soft organism (gentle → they melt) -->
		<svg width="0" height="0" class="aura__defs">
			<defs>
				<filter :id="gooId">
					<feGaussianBlur in="SourceGraphic" stdDeviation="26" result="b" />
					<feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8" result="goo" />
					<feBlend in="SourceGraphic" in2="goo" />
				</filter>
			</defs>
		</svg>

		<div ref="fieldEl" class="aura__field" :style="{ filter: `url(#${gooId}) blur(24px)` }">
			<span
				v-for="(o, i) in ORBS"
				:key="i"
				ref="orbEls"
				class="aura__orb"
				:style="{
					width: o.w + 'vmax', height: o.w + 'vmax',
					left: o.l + '%', top: o.t + '%',
					background: `radial-gradient(circle at ${o.grad}, color-mix(in oklab, var(--${orbColor(i)}), ${EARNEST_GROUND} 30%), transparent 66%)`,
				}"
			/>
		</div>

		<div ref="coreEl" class="aura__core" />
		<div class="aura__veil" />

		<Transition name="aura-drift">
			<div v-if="showMantras && activeMantra && !reduceMotion" :key="mantraIdx" class="aura__drift">{{ activeMantra }}</div>
		</Transition>
	</div>
</template>

<style scoped>
/* Living colour: the "brand colour" is an emotional state, not a fixed hex.
   @property makes each var a real interpolatable <color> so GSAP's quickSetter
   values land crisply and the browser never snaps. */
@property --c1 { syntax: '<color>'; inherits: true; initial-value: #2f8a84; }
@property --c2 { syntax: '<color>'; inherits: true; initial-value: #356299; }
@property --c3 { syntax: '<color>'; inherits: true; initial-value: #2f9084; }
@property --warmth { syntax: '<number>'; inherits: true; initial-value: 0.18; }

.aura {
	position: absolute; inset: 0; overflow: hidden; pointer-events: none;
	--c1: #2f8a84; --c2: #356299; --c3: #2f9084; --warmth: 0.18;
}
.aura__defs { position: absolute; }

.aura__field {
	position: absolute; inset: 0;
	/* filter set inline (unique goo id per instance). Transform is GSAP's alone
	   (mood geometry) — energy modulates orb/core brightness, never transform,
	   so the two never fight over the matrix. */
	will-change: transform, filter;
}
.aura__orb {
	position: absolute; border-radius: 50%;
	mix-blend-mode: screen;
	/* quieter: softened by the ground-mix in the gradient + lower opacity;
	   energy lifts them a touch when the user is active. */
	opacity: calc(0.82 + var(--energy, 0) * 0.12);
	will-change: transform;
}

.aura__core {
	position: absolute; left: 50%; top: 46%; transform: translate(-50%, -50%);
	width: 62vmin; height: 62vmin; border-radius: 50%;
	background: radial-gradient(circle, color-mix(in oklab, var(--c1), #f0c877 calc(var(--warmth) * 62%)) 0%, transparent 64%);
	opacity: calc(0.22 + var(--warmth) * 0.36 + var(--energy, 0) * 0.26);
	filter: blur(38px);
	transition: opacity 400ms ease;
	will-change: transform, opacity;
}
.aura__veil {
	position: absolute; inset: 0;
	background: radial-gradient(130% 96% at 50% 42%, transparent 0%, rgba(6, 10, 20, 0.32) 58%, rgba(6, 10, 20, 0.72) 100%);
}

/* A single mantra surfacing and sinking through the field — barely there. */
.aura__drift {
	position: absolute; left: 0; right: 0; top: 50%; text-align: center;
	font-family: 'Iowan Old Style', Palatino, Georgia, serif; font-style: italic;
	font-size: clamp(40px, 9vw, 110px); letter-spacing: 0.01em;
	color: rgba(238, 242, 248, 0.06); white-space: nowrap; filter: blur(0.4px);
}
.aura-drift-enter-active { transition: opacity 1.4s ease, transform 1.4s ease; }
.aura-drift-leave-active { transition: opacity 1.4s ease, transform 1.4s ease; }
.aura-drift-enter-from { opacity: 0; transform: translateY(34px); }
.aura-drift-leave-to { opacity: 0; transform: translateY(-34px); }

@media (prefers-reduced-motion: reduce) {
	.aura__core { transition: none; }
}
</style>
