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
 * Zoom levels (after P4.4 Item D):
 *   z=0  Overview lens-grid — 5 thumbnails of the canvas's lenses; click
 *        to dive into one at z=1 (P4.4). Reached by pinch-out from z=1,
 *        Cmd+- at z=1, the Overview affordance, or `?z=0` deep-link.
 *   z=1  River timeline (default — the URL drops `?z=` for this level).
 *   z=2  Selected leaf lifted to center via FLIP — see lift().
 *   z=3  Master-variant composer in-place — edit OR create (sentinel id) — see compose().
 *   z=4-5  Block-level depth (deferred indefinitely; reclaim if blocks ever apply).
 *
 * URL binding: `?z=` + `?id=` are the canonical form when canvas mode is on.
 * `useRouter().replace` (not push) so back/forward history doesn't fill up
 * with z transitions. `?id=` is dropped when z snaps back to ≤1 (no active
 * target at the river / overview levels). `?z=` is dropped *only* at the
 * URL-default level (z=1) — z=0 is an explicit non-default state that
 * must round-trip through the URL.
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

/** Z range. z=0 is the lens-grid overview (P4.4 Item D); the URL-default
 *  level (the one that drops `?z=` from the URL) is z=1 (River). */
const Z_MIN = 0;
const URL_DEFAULT_Z = 1;
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
	// Missing / malformed param means the user is on the canonical URL-
	// default view (z=1 River) — NOT the overview grid. P4.4 widened the
	// range to [0, 5] but kept 1 as the resting state so `?z=` stays
	// optional for the common case.
	if (typeof q !== 'string') return URL_DEFAULT_Z;
	const n = Number(q);
	if (!Number.isFinite(n)) return URL_DEFAULT_Z;
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

	// SSR-safe init. Depth-zoom is a client-only UX (the canvas surfaces
	// — lifted card, composer, gesture handlers — all need a live DOM and
	// session cookies for fetchById). On the server we use the URL-
	// default (River) so the SSR pass never tries to mount the five
	// overview lens components. On the client we read the URL directly
	// at build time — the `immediate: true` watcher below proved racy
	// against the second canvas render after P4.4 added z=0, so we
	// short-circuit the SSR/CSR seam by sampling the route once here.
	const initialZ =
		import.meta.server
			? URL_DEFAULT_Z
			: parseUrlZ(route.query.z);
	const z = ref<number>(initialZ);
	const activeId = ref<string | null>(null);
	/** Source rect captured at lift time — drives the FLIP from-pose for the
	 *  lifted card. NOT URL-bound: a deep-link via `?z=3&id=<uuid>` skips the
	 *  FLIP and lands on the composer directly. */
	const sourceRect = ref<LiftSourceRect | null>(null);
	/** True while a gesture is in flight; consumers can use it to suppress
	 *  expensive renders or freeze unrelated transitions. */
	const gesturing = ref(false);

	// Keep z in sync if the URL changes (back/forward, external nav).
	// `immediate: true` reconciles z + activeId from the URL on the client's
	// first tick — needed because we deliberately initialized to Z_MIN on
	// the client (see initialZ above) to avoid the SSR hydration mismatch.
	watch(
		() => route.query.z,
		(q) => {
			const next = parseUrlZ(q);
			if (Math.round(z.value) !== next) z.value = next;
		},
		{ immediate: true },
	);

	watch(
		() => route.query.id,
		(q) => {
			const next = parseUrlId(q);
			if (activeId.value !== next) activeId.value = next;
		},
		{ immediate: true },
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
		// Drop the param only at the URL-default level (z=1 River). z=0
		// (overview) and z>=2 (lifted/composer) are explicit non-default
		// states that need to round-trip through the URL.
		if (intZ === URL_DEFAULT_Z) {
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
		// You need a target to leave the river upward (lift / composer).
		// If callers ask for z>=2 with no activeId, snap back to the URL-
		// default level instead — keeps deep-link contract honest and
		// prevents the lifted overlay from rendering empty. z=0 has no
		// such requirement: the overview surface is target-less by design.
		if (clamped >= 2 && !activeId.value) clamped = URL_DEFAULT_Z;
		// activeId only makes sense at z>=2 (lift/composer). Drop it on
		// the way down to either the river or the overview grid.
		const nextId = clamped <= URL_DEFAULT_Z ? null : activeId.value;
		z.value = clamped;
		if (nextId !== activeId.value) activeId.value = nextId;
		if (clamped < 2) sourceRect.value = null;
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
	 * Close the lifted card and any deeper layer. Returns to the URL-
	 * default level (River) — NOT the overview grid. Pushes so the
	 * browser back stack reads naturally — close is a discrete action.
	 * P4.4 made z=0 a real state (overview); without this fix closing
	 * a lifted card would skip River and drop the user into the grid.
	 */
	function closeLift() {
		setZ(URL_DEFAULT_Z, 'push');
	}

	/**
	 * Open the composer in create mode (P3.4). Mints a synthetic
	 * `compose:<kind>` activeId and pushes z=3 without capturing a source
	 * rect — there's no leaf to FLIP from. The canvas's kind-dispatch
	 * recognizes the `compose:` prefix and mounts the right composer in
	 * create mode (no fetch). Pushes a history entry so the user's back
	 * action drops out of the composer naturally.
	 */
	function compose(kind: 'social' | 'email') {
		activeId.value = `compose:${kind}`;
		sourceRect.value = null;
		z.value = clampZ(3);
		writeUrl(3, activeId.value, 'push');
	}

	/**
	 * Swap the current activeId in place — used by the canvas after a
	 * create-mode composer mints a real row, so the URL stops referring
	 * to the `compose:<kind>` sentinel. Replace (not push) so back skips
	 * the empty-composer state and lands at the river entry.
	 */
	function replaceActiveId(nextId: string) {
		activeId.value = nextId;
		writeUrl(z.value, nextId, 'replace');
	}

	function zoomIn() {
		// Keyboard zoom is a discrete intentional step — push so back undoes.
		setZ(Math.round(z.value) + KEYBOARD_STEP, 'push');
	}

	function zoomOut() {
		setZ(Math.round(z.value) - KEYBOARD_STEP, 'push');
	}

	/** Open the lens-grid overview (P4.4 Item D). Pushes so back drops to
	 *  the lens the user was on. Clears activeId — z=0 is target-less. */
	function openOverview() {
		setZ(0, 'push');
	}

	/** Dive into a lens from the overview grid (P4.4 Item D). Clears any
	 *  activeId (no lifted leaf carries across lens-switches), drops to
	 *  z=1, and emits a `lens` change via the caller — the canvas's
	 *  parent owns the lens axis (`?view=`). Push so back returns to z=0
	 *  with the previous lens still highlighted. */
	function setZ1() {
		setZ(URL_DEFAULT_Z, 'push');
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
			const delta = -ev.deltaY / WHEEL_PIXELS_PER_LEVEL;
			// Soft-block: zooming IN past the URL-default level (z=1)
			// without an activeId would surface an empty lifted card.
			// Swallow the gesture instead. Doesn't apply to z=0 — the
			// overview grid needs no activeId.
			if (delta > 0 && z.value >= URL_DEFAULT_Z && !activeId.value) {
				ev.preventDefault();
				return;
			}
			// Already at the floor — don't fight global browser zoom past it.
			if (delta < 0 && z.value <= Z_MIN) {
				ev.preventDefault();
				return;
			}
			ev.preventDefault();
			gesturing.value = true;
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
				const ratio = dist() / startDist;
				const proposed = clampZ(startZ + (ratio - 1) * 1.4);
				// Same gate as the wheel handler — soft-block zoom IN past
				// z=1 with no target so the lifted overlay never renders
				// empty. Pinch IN that lands at z=0 (overview) is fine.
				if (proposed > URL_DEFAULT_Z && !activeId.value) {
					ev.preventDefault();
					z.value = URL_DEFAULT_Z;
					return;
				}
				ev.preventDefault();
				z.value = proposed;
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
		compose,
		replaceActiveId,
		zoomIn,
		zoomOut,
		snap,
		openOverview,
		setZ1,
		installWheelHandler,
		installKeyboardHandler,
		installPinchHandler,
		installAll,
		Z_MIN,
		URL_DEFAULT_Z,
		Z_MAX,
		Z_COMPOSER_THRESHOLD,
	};
}

export function useCompositionZoom() {
	if (!singleton) singleton = build();
	return singleton;
}

/**
 * Cross-app helper: navigate into the canvas with a create-mode composer
 * pre-opened. Use from surfaces that don't have the canvas mounted yet
 * (Pulse floor, FloatingDock, AITray, /social/compose redirect). The
 * canvas reconciles `?z=` + `?id=compose:<kind>` from the URL on its
 * first tick and mounts the matching composer. Surfaces already inside
 * the canvas tree (StudioSurface, RiverSurface) should call
 * `useCompositionZoom().compose(kind)` directly instead.
 */
export async function openCanvasCompose(kind: 'social' | 'email' = 'social') {
	const router = useRouter();
	await router.push({
		path: '/apps/marketing',
		query: {
			floor: 'studio',
			view: 'calendar',
			z: '3',
			id: `compose:${kind}`,
		},
	});
}
