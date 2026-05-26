/**
 * useCompositionZoom — depth-zoom state + input wiring for the Composition Canvas.
 *
 * P3 Phase 3.1 + 3.2 (composition-canvas-redesign). Owns the reactive `z`
 * level that drives `<CompositionCanvas>`'s scale transform plus the
 * `activeId` + FLIP source rect for the lifted leaf. Exposes installer
 * functions the canvas root element binds in `onMounted`, so the handlers
 * stay scoped to the canvas region — pinch/Cmd+=/wheel+modifier outside the
 * canvas don't move `z` and don't fight global browser zoom on the rest of
 * the page.
 *
 * Zoom levels (after P3.2):
 *   z=1  River timeline (default).
 *   z=2  Selected leaf lifted to center via FLIP — see lift().
 *   z=3  Master-variant composer in-place.
 *   z=4-5  Block-level depth (reserved for P3.4).
 *
 * URL binding: `?z=` + `?id=` are the canonical form when canvas mode is on.
 * `useRouter().replace` (not push) so back/forward history doesn't fill up
 * with z transitions. `?id=` is dropped when z snaps back to 1 (no active
 * target at the river level).
 *
 * Motion contract (load-bearing — see feedback_motion_stack_policy):
 *   The zoom *payoff* is reactive `z` + CSS transition in CompositionCanvas —
 *   NOT a Vue Transition, NOT GSAP. This composable only mutates the ref.
 *   During an active gesture, `z` is fractional; on release it snaps to an
 *   integer in [MIN, MAX].
 *
 * @see app/components/Social/CompositionCanvas.vue — the consumer.
 * @see project_composition_canvas_redesign — design rationale.
 */

const Z_MIN = 1;
const Z_MAX = 5;
const WHEEL_PIXELS_PER_LEVEL = 90;
const WHEEL_SETTLE_MS = 220;
const KEYBOARD_STEP = 1;

/**
 * z=3 promotion threshold — once a gesture (or a sequence of keyboard zoom-in
 * commands from z=2) crosses this, the lifted card crossfades into the
 * full master-variant composer. Tuned so a single Cmd+= from z=2 lands
 * cleanly at z=3 (snap-on-release rounds 2.5+ → 3) and a pinch that drags
 * past 2.5 commits to the composer too.
 */
const Z_COMPOSER_THRESHOLD = 2.5;

/** Bounding rect captured at lift time, used by the FLIP source-pose math
 *  in `LiftedCard`. We keep this as plain DOMRect-shaped data (not the live
 *  DOMRect) so the rect survives the leaf unmounting between gestures. */
export interface LiftSourceRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * Minimal singleton bound to the URL so multiple `useCompositionZoom()` calls
 * inside the same canvas tree all read the same `z`. We don't use a Nuxt
 * useState because z is purely UI state — no SSR hydration needed and the URL
 * is the source of truth.
 */
let singleton: ReturnType<typeof build> | null = null;

function clampZ(n: number): number {
	if (!Number.isFinite(n)) return Z_MIN;
	if (n < Z_MIN) return Z_MIN;
	if (n > Z_MAX) return Z_MAX;
	return n;
}

function parseUrlZ(q: unknown): number {
	if (typeof q !== 'string') return Z_MIN;
	const n = Number(q);
	if (!Number.isFinite(n)) return Z_MIN;
	return clampZ(Math.round(n));
}

function parseUrlId(q: unknown): string | null {
	if (typeof q !== 'string') return null;
	const trimmed = q.trim();
	return trimmed ? trimmed : null;
}

function build() {
	const route = useRoute();
	const router = useRouter();

	const z = ref<number>(parseUrlZ(route.query.z));
	const activeId = ref<string | null>(parseUrlId(route.query.id));
	/** Source rect captured at lift time — drives the FLIP from-pose for the
	 *  lifted card. NOT URL-bound: a deep-link via `?z=3&id=<uuid>` skips the
	 *  FLIP and lands on the composer directly. */
	const sourceRect = ref<LiftSourceRect | null>(null);
	/** True while a gesture is in flight; consumers can use it to suppress
	 *  expensive renders or freeze unrelated transitions. */
	const gesturing = ref(false);

	// Keep z in sync if the URL changes (back/forward, external nav).
	watch(
		() => route.query.z,
		(q) => {
			const next = parseUrlZ(q);
			if (Math.round(z.value) !== next) z.value = next;
		},
	);

	// Same for `?id=`. Back/forward across z=2 / z=3 should restore activeId.
	watch(
		() => route.query.id,
		(q) => {
			const next = parseUrlId(q);
			if (activeId.value !== next) activeId.value = next;
		},
	);

	/**
	 * Write `z` + `id` to the URL.
	 *
	 *   mode='replace'  — overwrites the current history entry. Used for
	 *                     mid-gesture snaps so a flicky wheel doesn't fill
	 *                     history with tiny zoom transitions.
	 *   mode='push'     — adds a new history entry so the browser back
	 *                     button can step through it. Used for the discrete
	 *                     state changes the user intuits as "I did a thing"
	 *                     — lift, close-lift, keyboard zoom-in / zoom-out.
	 */
	function writeUrl(nextZ: number, nextId: string | null, mode: 'push' | 'replace' = 'replace') {
		const intZ = Math.round(nextZ);
		const currentZ = parseUrlZ(route.query.z);
		const currentId = parseUrlId(route.query.id);
		if (currentZ === intZ && currentId === nextId) return;
		const query = { ...route.query };
		if (intZ === Z_MIN) {
			delete query.z;
		} else {
			query.z = String(intZ);
		}
		if (!nextId) {
			delete query.id;
		} else {
			query.id = nextId;
		}
		if (mode === 'push') router.push({ query });
		else router.replace({ query });
	}

	function setZ(next: number, mode: 'push' | 'replace' = 'replace') {
		let clamped = clampZ(Math.round(next));
		// You need a target to leave the river. If callers ask for z>=2 with
		// no activeId, snap back to z=1 instead — keeps deep-link contract
		// honest and prevents the lifted overlay from rendering empty.
		if (clamped > Z_MIN && !activeId.value) clamped = Z_MIN;
		const nextId = clamped === Z_MIN ? null : activeId.value;
		z.value = clamped;
		if (nextId !== activeId.value) activeId.value = nextId;
		if (clamped === Z_MIN) sourceRect.value = null;
		writeUrl(clamped, nextId, mode);
	}

	/**
	 * Lift a leaf into the canvas. Called from RiverSurface (and any other
	 * z=1 lens that can hand a leaf-shaped record to the canvas). Captures
	 * the source rect for FLIP, sets the active id, snaps z to 2. If z is
	 * already past the lift threshold, this just retargets the active id
	 * (e.g. clicking another leaf while a card is up).
	 *
	 * Pushes a history entry — the user's mental model is "I drilled in",
	 * so back should undo it.
	 */
	function lift(id: string, rect: LiftSourceRect | null) {
		activeId.value = id;
		sourceRect.value = rect;
		const next = Math.max(2, Math.round(z.value) || 1);
		z.value = clampZ(next);
		writeUrl(z.value, id, 'push');
	}

	/**
	 * Close the lifted card and any deeper layer. Pushes so the browser
	 * back stack reads naturally — close is a discrete action.
	 */
	function closeLift() {
		setZ(Z_MIN, 'push');
	}

	function zoomIn() {
		// Keyboard zoom is a discrete intentional step — push so back undoes.
		setZ(Math.round(z.value) + KEYBOARD_STEP, 'push');
	}

	function zoomOut() {
		setZ(Math.round(z.value) - KEYBOARD_STEP, 'push');
	}

	/** Snap the (possibly fractional) gesturing z to the nearest integer. */
	function snap() {
		gesturing.value = false;
		setZ(Math.round(z.value));
	}

	// ── Wheel + modifier (also handles Mac trackpad pinch) ────────────────
	// On Mac trackpads, a pinch gesture surfaces as wheel events with
	// `ctrlKey: true` set synthetically by the OS — that's why a single
	// handler covers both "wheel + ctrl/cmd" and trackpad pinch.
	function installWheelHandler(el: HTMLElement): () => void {
		let settleTimer: ReturnType<typeof setTimeout> | null = null;

		const onWheel = (ev: WheelEvent) => {
			if (!(ev.ctrlKey || ev.metaKey)) return;
			// Without a target you can't leave the river — swallow the
			// gesture so it doesn't fight global browser zoom either.
			if (!activeId.value && z.value <= Z_MIN) {
				ev.preventDefault();
				return;
			}
			ev.preventDefault();
			gesturing.value = true;
			const delta = -ev.deltaY / WHEEL_PIXELS_PER_LEVEL;
			z.value = clampZ(z.value + delta);

			if (settleTimer) clearTimeout(settleTimer);
			settleTimer = setTimeout(() => {
				settleTimer = null;
				snap();
			}, WHEEL_SETTLE_MS);
		};

		el.addEventListener('wheel', onWheel, { passive: false });

		return () => {
			el.removeEventListener('wheel', onWheel as EventListener);
			if (settleTimer) clearTimeout(settleTimer);
		};
	}

	// ── Keyboard (Cmd+= / Cmd+-) ──────────────────────────────────────────
	// Bound to the canvas element rather than window so it doesn't hijack
	// the user's global browser zoom outside the canvas region. We listen
	// in capture phase on `document` but gate on contains(el, target) so
	// typing in unrelated inputs is unaffected.
	function installKeyboardHandler(el: HTMLElement): () => void {
		const onKeydown = (ev: KeyboardEvent) => {
			if (!(ev.ctrlKey || ev.metaKey)) return;
			const target = ev.target as Node | null;
			if (!target || !el.contains(target)) return;
			// Cmd+= (or Cmd++) → zoom in. Cmd+- → zoom out.
			if (ev.key === '=' || ev.key === '+') {
				ev.preventDefault();
				zoomIn();
			} else if (ev.key === '-' || ev.key === '_') {
				ev.preventDefault();
				zoomOut();
			}
		};

		document.addEventListener('keydown', onKeydown, true);
		return () => document.removeEventListener('keydown', onKeydown, true);
	}

	// ── Pinch (multi-touch) ───────────────────────────────────────────────
	// Two-pointer pinch tracking. Distance ratio against the start gives a
	// proportional z delta. On Mac trackpads this isn't needed (wheel+ctrl
	// covers it), but touchscreens (iPad, hybrid laptops) fire pointer
	// events instead of synthetic wheel.
	function installPinchHandler(el: HTMLElement): () => void {
		const pointers = new Map<number, { x: number; y: number }>();
		let startDist = 0;
		let startZ = 1;

		const dist = () => {
			if (pointers.size !== 2) return 0;
			const pts = Array.from(pointers.values());
			const dx = pts[0]!.x - pts[1]!.x;
			const dy = pts[0]!.y - pts[1]!.y;
			return Math.hypot(dx, dy);
		};

		const onPointerDown = (ev: PointerEvent) => {
			if (ev.pointerType !== 'touch') return;
			pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
			if (pointers.size === 2) {
				startDist = dist();
				startZ = z.value;
				gesturing.value = true;
			}
		};

		const onPointerMove = (ev: PointerEvent) => {
			if (ev.pointerType !== 'touch') return;
			if (!pointers.has(ev.pointerId)) return;
			pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
			if (pointers.size === 2 && startDist > 0) {
				// Same gate as the wheel handler — without a target the
				// pinch is a no-op (gesturing flag stays set so the
				// pointer-end branch still snaps cleanly to Z_MIN).
				if (!activeId.value && z.value <= Z_MIN) return;
				ev.preventDefault();
				const ratio = dist() / startDist;
				z.value = clampZ(startZ + (ratio - 1) * 1.4);
			}
		};

		const onPointerEnd = (ev: PointerEvent) => {
			if (ev.pointerType !== 'touch') return;
			if (pointers.delete(ev.pointerId)) {
				if (pointers.size < 2 && gesturing.value) {
					snap();
					startDist = 0;
				}
			}
		};

		el.addEventListener('pointerdown', onPointerDown);
		el.addEventListener('pointermove', onPointerMove, { passive: false });
		el.addEventListener('pointerup', onPointerEnd);
		el.addEventListener('pointercancel', onPointerEnd);

		return () => {
			el.removeEventListener('pointerdown', onPointerDown);
			el.removeEventListener('pointermove', onPointerMove as EventListener);
			el.removeEventListener('pointerup', onPointerEnd);
			el.removeEventListener('pointercancel', onPointerEnd);
		};
	}

	/** Convenience: install all three handlers on the same element. Returns
	 *  a single teardown fn that unwires everything. */
	function installAll(el: HTMLElement): () => void {
		const teardowns = [
			installWheelHandler(el),
			installKeyboardHandler(el),
			installPinchHandler(el),
		];
		return () => {
			for (const fn of teardowns) fn();
		};
	}

	return {
		z: readonly(z),
		activeId: readonly(activeId),
		sourceRect: readonly(sourceRect),
		gesturing: readonly(gesturing),
		setZ,
		lift,
		closeLift,
		zoomIn,
		zoomOut,
		snap,
		installWheelHandler,
		installKeyboardHandler,
		installPinchHandler,
		installAll,
		Z_MIN,
		Z_MAX,
		Z_COMPOSER_THRESHOLD,
	};
}

export function useCompositionZoom() {
	if (!singleton) singleton = build();
	return singleton;
}
