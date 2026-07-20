// composables/useCanvasChoreography.ts
/**
 * useCanvasChoreography — the shared GSAP motion layer for the Generative
 * Canvas. Every builder (email, document, social) pipes its block DOM through
 * this so AI edits *land* rather than pop: new blocks rise + stagger in, the
 * rest of the page reflows with Flip instead of snapping, and a freshly-written
 * block gives a brief warm bloom.
 *
 * It follows the presence layer's conventions (see useEarnestPresence): GSAP is
 * lazily + client-only registered, and prefers-reduced-motion is fully
 * honoured (every method still performs the DOM mutation — it just skips the
 * animation). The composable owns NO state; it operates on the block elements
 * inside a container you register, addressed by a `data-canvas-block="<id>"`
 * attribute convention.
 *
 * Usage in a builder:
 *   const choreo = useCanvasChoreography(containerRef);
 *   // when the model adds/removes/reorders blocks:
 *   await choreo.reflow(() => { applyToModel(ops); }, { enter: added, exit: removed });
 *   // when a block's copy is rewritten in place:
 *   choreo.land(blockId);
 */
import { gsap } from 'gsap';
import type { Ref } from 'vue';

let _flipReady = false;
let _flip: any = null;

/** Lazily register GSAP Flip (client-only, idempotent). Falls back gracefully. */
async function ensureFlip(): Promise<any | null> {
	if (!import.meta.client) return null;
	if (_flipReady) return _flip;
	try {
		const mod = await import('gsap/Flip');
		gsap.registerPlugin(mod.Flip);
		_flip = mod.Flip;
		_flipReady = true;
	} catch {
		_flip = null;
		_flipReady = true; // don't retry on every call
	}
	return _flip;
}

let _motionReady = false;
let _motionOk = false;
/** Lazily register GSAP MotionPathPlugin (premium; used for the 'arc' entrance). */
async function ensureMotionPath(): Promise<boolean> {
	if (!import.meta.client) return false;
	if (_motionReady) return _motionOk;
	try {
		const mod = await import('gsap/MotionPathPlugin');
		gsap.registerPlugin(mod.MotionPathPlugin);
		_motionOk = true;
	} catch {
		_motionOk = false;
	}
	_motionReady = true;
	return _motionOk;
}

/** How new blocks enter: 'rise' = straight lift; 'arc' = curved MotionPath place. */
export type EntranceStyle = 'rise' | 'arc';

export interface CanvasChoreographyOptions {
	/** Stagger between block entrances, seconds. Default 0.06. */
	stagger?: number;
	/** Entrance travel distance in px. Default 18. */
	rise?: number;
	/** Entrance style. 'arc' curves blocks into place (Earnest *placing* them). */
	entrance?: EntranceStyle;
}

export interface ReflowOptions {
	/** Block ids being added — animated in after the mutation. */
	enter?: string[];
	/** Block ids being removed — animated out BEFORE the mutation runs. */
	exit?: string[];
}

export function useCanvasChoreography(container: Ref<HTMLElement | null>, opts: CanvasChoreographyOptions = {}) {
	const stagger = opts.stagger ?? 0.06;
	const rise = opts.rise ?? 18;
	const entrance: EntranceStyle = opts.entrance ?? 'rise';
	// Kick off MotionPath registration early when the arc entrance is requested,
	// so the plugin is ready by the time the first blocks land.
	if (entrance === 'arc') void ensureMotionPath();

	const reduceMotion = ref(false);
	if (import.meta.client) {
		const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
		reduceMotion.value = mq.matches;
		mq.addEventListener?.('change', (e) => (reduceMotion.value = e.matches));
	}

	function blockEl(id: string): HTMLElement | null {
		return container.value?.querySelector<HTMLElement>(`[data-canvas-block="${CSS.escape(id)}"]`) ?? null;
	}

	function siblingEls(): HTMLElement[] {
		if (!container.value) return [];
		return Array.from(container.value.querySelectorAll<HTMLElement>('[data-canvas-block]'));
	}

	/**
	 * Kill any in-flight tweens and wipe leftover inline transform/opacity before
	 * a new entrance. Without this, an interrupted entrance can strand a block at
	 * its start offset (it renders shifted off-position, permanently).
	 */
	function resetEls(els: HTMLElement[]) {
		gsap.killTweensOf(els);
		gsap.set(els, { clearProps: 'transform,opacity' });
	}

	/**
	 * Guarantee the resting layout even if the entrance tween never finishes.
	 *
	 * GSAP drives on requestAnimationFrame, which browsers throttle or stop in
	 * background/hidden tabs. A tween that stalls mid-flight leaves its inline
	 * transform parked on the element — the block then renders permanently
	 * offset, because `clearProps` only runs on complete. Entrances are pure
	 * decoration, so we schedule a timer (setTimeout still fires when throttled)
	 * that force-clears any leftover transform once the animation should be done.
	 */
	function scheduleSafetyClear(els: HTMLElement[], ms: number, props = 'transform,opacity') {
		if (!import.meta.client) return;
		setTimeout(() => {
			for (const el of els) {
				if (!el.isConnected) continue;
				if (el.style.transform || el.style.opacity || el.style.position === 'absolute') {
					gsap.killTweensOf(el);
					gsap.set(el, { clearProps: props });
				}
			}
		}, ms);
	}

	/** Straight staggered lift — the default entrance. */
	function riseIn(els: HTMLElement[]) {
		resetEls(els);
		gsap.from(els, {
			y: rise,
			opacity: 0,
			duration: 0.5,
			ease: 'back.out(1.4)',
			stagger,
			overwrite: 'auto',
			// Fail-safe: don't park the block at its start offset until the tween
			// actually ticks. If rAF is throttled (hidden/background tab), the
			// animation simply never plays and the block sits at its correct
			// resting spot, instead of being stranded mid-entrance.
			immediateRender: false,
			clearProps: 'transform,opacity',
		});
		scheduleSafetyClear(els, 500 + stagger * 1000 * els.length + 400);
	}

	/**
	 * Curved MotionPath entrance — each block arcs up into its resting spot, as
	 * if Earnest set it down. Falls back to riseIn if the plugin didn't load.
	 */
	function arcIn(els: HTMLElement[]) {
		if (!_motionOk) { riseIn(els); return; }
		resetEls(els);
		gsap.fromTo(
			els,
			{ opacity: 0 },
			{
				opacity: 1,
				duration: 0.62,
				ease: 'power3.out',
				stagger,
				overwrite: 'auto',
				// Same fail-safe as riseIn — a throttled rAF must never strand a
				// block at the start of its arc.
				immediateRender: false,
				clearProps: 'transform,opacity',
				motionPath: {
					// Relative curve ending at the block's natural position (0,0):
					// starts low-left, sweeps up through a control point, settles.
					path: [{ x: -34, y: 46 }, { x: 8, y: 12 }, { x: 0, y: 0 }],
					relative: true,
					curviness: 1.5,
				},
			},
		);
		scheduleSafetyClear(els, 620 + stagger * 1000 * els.length + 400);
	}

	/** Animate a set of freshly-added blocks in (per the configured entrance). */
	function enter(ids: string[]) {
		if (!import.meta.client || reduceMotion.value || !ids?.length) return;
		const els = ids.map(blockEl).filter((el): el is HTMLElement => !!el);
		if (!els.length) return;
		if (entrance === 'arc') arcIn(els);
		else riseIn(els);
	}

	/** Animate blocks out, resolving once gone so the caller can remove them. */
	function exit(ids: string[]): Promise<void> {
		if (!import.meta.client || reduceMotion.value || !ids?.length) return Promise.resolve();
		const els = ids.map(blockEl).filter((el): el is HTMLElement => !!el);
		if (!els.length) return Promise.resolve();
		return new Promise((resolve) => {
			gsap.to(els, {
				y: -rise,
				opacity: 0,
				duration: 0.3,
				ease: 'power2.in',
				stagger: stagger / 2,
				onComplete: () => resolve(),
			});
		});
	}

	/**
	 * The core move: mutate the model while smoothly reflowing everything else.
	 * Captures Flip state of the surviving blocks, runs `mutate` (which changes
	 * the DOM via the model), waits for Vue to patch, then plays existing blocks
	 * to their new positions and rises the new ones in. Removals in `exit` are
	 * animated out first so they don't jump-cut.
	 */
	async function reflow(mutate: () => void | Promise<void>, o: ReflowOptions = {}): Promise<void> {
		const Flip = await ensureFlip();

		// Exit-animate removed blocks first (before they leave the DOM).
		if (o.exit?.length) await exit(o.exit);

		if (!import.meta.client || reduceMotion.value || !Flip || !container.value) {
			await mutate();
			await nextTick();
			return;
		}

		// Snapshot the blocks that exist BEFORE the mutation — these are exactly
		// the ones Flip animates, and the only ones the safety sweep may touch
		// (sweeping newly-added blocks would cut their entrance short).
		const survivors = siblingEls();
		const state = Flip.getState(survivors);
		await mutate();
		await nextTick();

		// Flip moves the SURVIVING blocks to their new positions. It does NOT own
		// entrances: `state` is built from an element array, so Flip can't detect
		// nodes added after capture. Entrances are driven solely by enter() below
		// — running both caused overlapping tweens that left a card stuck at its
		// start transform.
		Flip.from(state, {
			duration: 0.5,
			ease: 'power2.inOut',
			absolute: true,
			onLeave: (els: HTMLElement[]) => gsap.to(els, { opacity: 0, duration: 0.25 }),
		});

		// Flip needs the same guarantee as the entrances: it parks inline
		// transform (and, with `absolute`, position/offsets) on the surviving
		// blocks and only reverts them on complete. A stalled rAF would strand a
		// reflowed block off-position, so sweep them once the tween should be done.
		scheduleSafetyClear(survivors, 500 + 400, 'transform,opacity,position,top,left,width,height');

		// The single entrance pass for newly-added blocks.
		if (o.enter?.length) enter(o.enter);
	}

	/**
	 * A brief warm bloom on a block whose content was just (re)written — the
	 * visual echo of Earnest's 'warm' mood. Uses a box-shadow + subtle lift so
	 * it reads on any builder's surface without needing bespoke CSS.
	 */
	function land(id: string) {
		if (!import.meta.client || reduceMotion.value) return;
		const el = blockEl(id);
		if (!el) return;
		gsap.fromTo(
			el,
			{ boxShadow: '0 0 0 0 rgba(63,190,130,0.0)' },
			{
				boxShadow: '0 0 0 3px rgba(63,190,130,0.35)',
				duration: 0.35,
				ease: 'power2.out',
				yoyo: true,
				repeat: 1,
				clearProps: 'boxShadow',
			},
		);
		gsap.fromTo(el, { scale: 1 }, { scale: 1.012, duration: 0.32, ease: 'power2.out', yoyo: true, repeat: 1, clearProps: 'scale' });
	}

	return { enter, exit, reflow, land, reduceMotion: readonly(reduceMotion), blockEl };
}

export type CanvasChoreography = ReturnType<typeof useCanvasChoreography>;
