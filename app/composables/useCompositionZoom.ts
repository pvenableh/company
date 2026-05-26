/**
 * useCompositionZoom — depth-zoom state + input wiring for the Composition Canvas.
 *
 * P3 Phase 3.1 (composition-canvas-redesign). Owns the reactive `z` level that
 * drives `<CompositionCanvas>`'s scale transform. Exposes installer functions
 * the canvas root element binds in `onMounted`, so the handlers stay scoped to
 * the canvas region — pinch/Cmd+=/wheel+modifier outside the canvas don't move
 * `z` and don't fight global browser zoom on the rest of the page.
 *
 * Phase 3.1 only supports z=1 (river) and z=2 (post lifted). z=3 (composer)
 * lands in 3.2, z=4–5 in 3.4. MIN/MAX are tuned wide enough that future
 * phases can lift them without touching consumers.
 *
 * URL binding: `?z=` is the canonical form when canvas mode is on.
 * `useRouter().replace` (not push) so back/forward history doesn't fill up
 * with z transitions.
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

function build() {
	const route = useRoute();
	const router = useRouter();

	const z = ref<number>(parseUrlZ(route.query.z));
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

	function writeZToUrl(next: number) {
		const intZ = Math.round(next);
		const current = parseUrlZ(route.query.z);
		if (current === intZ) return;
		const query = { ...route.query };
		if (intZ === Z_MIN) {
			delete query.z;
		} else {
			query.z = String(intZ);
		}
		router.replace({ query });
	}

	function setZ(next: number) {
		const clamped = clampZ(Math.round(next));
		z.value = clamped;
		writeZToUrl(clamped);
	}

	function zoomIn() {
		setZ(Math.round(z.value) + KEYBOARD_STEP);
	}

	function zoomOut() {
		setZ(Math.round(z.value) - KEYBOARD_STEP);
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
		gesturing: readonly(gesturing),
		setZ,
		zoomIn,
		zoomOut,
		snap,
		installWheelHandler,
		installKeyboardHandler,
		installPinchHandler,
		installAll,
		Z_MIN,
		Z_MAX,
	};
}

export function useCompositionZoom() {
	if (!singleton) singleton = build();
	return singleton;
}
