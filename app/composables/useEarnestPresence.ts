// composables/useEarnestPresence.ts
/**
 * useEarnestPresence — the headless brain of Earnest's living presence.
 *
 * Earnest is a verb, and its "brand colour" is an emotional state, not a fixed
 * hex. This composable is the single source of truth for that state: the five
 * moods, their tuned palettes + motion bias, and the shared "energy" engine
 * (a decaying rAF value that surfaces bump each time the user acts). It owns
 * NO DOM — <EarnestAura> is the body that renders it, and any other surface
 * (Whisper, Boardroom, Create-with-Earnest…) can mount the same brain.
 *
 * Motion is GSAP's job (see <EarnestAura>): idle drift + breathe are
 * interruptible looping timelines, mood changes are eased tweens (colour via a
 * GSAP-driven interpolation), and drags run through GSAP Draggable. This file
 * just holds the state those tweens read from.
 *
 * The five moods are LOCKED (product decision): reflect · present · listen ·
 * think · warm. Each is a feeling expressed as light — quieter + fuzzier than
 * the first Focus-mode pass: lower saturation/contrast, colours mixed a touch
 * toward the ground so the orbs melt rather than pop.
 */
import { gsap } from 'gsap';

export type EarnestMood = 'reflect' | 'present' | 'listen' | 'think' | 'warm';

export const EARNEST_MOODS: readonly EarnestMood[] = ['reflect', 'present', 'listen', 'think', 'warm'] as const;

export interface EarnestMoodTokens {
	/** Three field colours — desaturated, mixed toward the deep ground. */
	c1: string;
	c2: string;
	c3: string;
	/** 0–1 warmth: how much gold bleeds into the core (encouragement, heat of thought). */
	warmth: number;
	/** Overall field scale bias (gather in on think, open out on reflect). */
	fieldScale: number;
	/** Field drift bias in vmax-ish units [x, y] (lean in on listen, aside on work). */
	fieldShift: [number, number];
	/** Idle-drift speed multiplier (>1 = livelier, e.g. thinking stirs faster). */
	pace: number;
}

/**
 * The ground the orbs are mixed toward — the deep base of the Focus canvas.
 * Mixing each mood colour a little toward this is what makes them "quieter".
 */
export const EARNEST_GROUND = '#0a1220';

/**
 * Mood → light. Palettes are deliberately softer than raw brand hues:
 * pulled down in saturation and value so the aura reads as a calm presence,
 * not a lava lamp. Warmth + motion bias give each mood its body language.
 */
export const EARNEST_MOOD_TOKENS: Record<EarnestMood, EarnestMoodTokens> = {
	// know thyself — a cool, inward indigo, opened out and slow
	reflect: { c1: '#565ba8', c2: '#6a4fb8', c3: '#4a5296', warmth: 0.12, fieldScale: 1.05, fieldShift: [0, 0], pace: 0.82 },
	// here, unhurried — muted brand teal/blue at rest
	present: { c1: '#2f8a84', c2: '#356299', c3: '#2f9084', warmth: 0.18, fieldScale: 1.0, fieldShift: [0, 0], pace: 1.0 },
	// leaning in — a soft cyan-teal that shifts down toward you as you type
	listen: { c1: '#2f9c90', c2: '#3aa2b2', c3: '#45b088', warmth: 0.3, fieldScale: 1.02, fieldShift: [0, 3], pace: 1.12 },
	// working — a quiet amber spark gathered to the centre, stirring faster
	think: { c1: '#c9964a', c2: '#3f97a8', c3: '#cfa552', warmth: 0.5, fieldScale: 0.9, fieldShift: [0, 0], pace: 1.5 },
	// earned encouragement — a gentle mint-gold bloom
	warm: { c1: '#3fbe82', c2: '#34a074', c3: '#c8ab6a', warmth: 0.6, fieldScale: 1.04, fieldShift: [0, 0], pace: 1.05 },
};

let _pluginsReady = false;
/**
 * Register the GSAP plugins the presence layer leans on. MorphSVGPlugin is
 * premium (already used by <EarnestMark>); Draggable ships free in the gsap
 * package. Both are optional — callers fall back gracefully if a plugin is
 * absent. Idempotent + client-only.
 */
export async function ensureEarnestGsap(): Promise<{ morph: boolean; draggable: boolean }> {
	const result = { morph: false, draggable: false };
	if (!import.meta.client) return result;
	try {
		const mod = await import('gsap/MorphSVGPlugin');
		gsap.registerPlugin(mod.MorphSVGPlugin);
		result.morph = true;
	} catch { /* fall back to opacity cross-fade */ }
	try {
		const mod = await import('gsap/Draggable');
		gsap.registerPlugin(mod.Draggable);
		result.draggable = true;
	} catch { /* fall back to no drag */ }
	_pluginsReady = result.morph || result.draggable;
	return result;
}
export function earnestGsapReady() { return _pluginsReady; }

export interface UseEarnestPresenceOptions {
	/** Starting mood (default 'reflect' — the honest opening). */
	initial?: EarnestMood;
}

/**
 * Create a presence brain. NOT global — each surface owns its own mood, so the
 * Whisper panel and the Focus takeover can feel different at the same time.
 */
export function useEarnestPresence(opts: UseEarnestPresenceOptions = {}) {
	const mood = ref<EarnestMood>(opts.initial ?? 'reflect');
	const tokens = computed<EarnestMoodTokens>(() => EARNEST_MOOD_TOKENS[mood.value]);

	const reduceMotion = ref(false);
	if (import.meta.client) {
		const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
		reduceMotion.value = mq.matches;
		mq.addEventListener?.('change', (e) => (reduceMotion.value = e.matches));
	}

	function setMood(m: EarnestMood) { mood.value = m; }

	// ── Energy engine ──────────────────────────────────────────────────────────
	// A single decaying value the surface bumps each time the user acts (types,
	// sends, completes a step). Written straight to a CSS var on a registered
	// element so it never triggers a Vue re-render — 60fps of reactivity would
	// be wasteful. GSAP reads the same var for its interruptible pulses.
	let energy = 0;
	let raf: number | null = null;
	let rootEl: HTMLElement | null = null;
	const listeners = new Set<(v: number) => void>();

	function writeEnergy() {
		rootEl?.style.setProperty('--energy', energy.toFixed(3));
		for (const fn of listeners) fn(energy);
	}
	function bump(v = 0.22) { energy = Math.min(1, energy + v); if (raf == null) startEnergy(); }
	function startEnergy() {
		if (reduceMotion.value || raf != null || !import.meta.client) return;
		const tick = () => {
			energy *= 0.93;
			if (energy < 0.004) { energy = 0; writeEnergy(); raf = null; return; } // settle → stop the loop
			writeEnergy();
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
	}
	function stopEnergy() {
		if (raf != null) { cancelAnimationFrame(raf); raf = null; }
		energy = 0;
		writeEnergy();
	}
	/** Point the energy engine at the element whose --energy var it should write. */
	function attachRoot(el: HTMLElement | null) { rootEl = el; writeEnergy(); }
	/** Subscribe to raw energy ticks (GSAP quickSetter, custom pulses…). */
	function onEnergy(fn: (v: number) => void) { listeners.add(fn); return () => listeners.delete(fn); }

	return {
		mood,
		setMood,
		tokens,
		reduceMotion: readonly(reduceMotion),
		MOODS: EARNEST_MOODS,
		MOOD_TOKENS: EARNEST_MOOD_TOKENS,
		GROUND: EARNEST_GROUND,
		// energy engine
		bump,
		startEnergy,
		stopEnergy,
		attachRoot,
		onEnergy,
	};
}

export type EarnestPresence = ReturnType<typeof useEarnestPresence>;
