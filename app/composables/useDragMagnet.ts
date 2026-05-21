/**
 * useDragMagnet — drag-source / drop-target primitive with magnet snap.
 *
 * The P2.5 gestural primitive (slice 2). Pair `useDragSource()` on a chip
 * with `useDropTarget()` on each candidate landing zone — the composable
 * teleports a fixed-position ghost (cloned from the source), tracks the
 * pointer, and pulls the ghost toward the closest registered target's
 * center as soon as the pointer enters that target's expanded magnet box.
 * Release inside a target → onDrop fires + ghost collapses into the
 * target. Release outside → ghost springs back to the source rect.
 *
 * Motion stack: pointer events drive transform inline (their own cadence —
 * no RAF dependency). Magnet snap, spring-back, and drop-commit are CSS
 * transitions on the compositor with the canonical iOS spring. No GSAP.
 * See [[feedback_motion_stack_policy]].
 *
 * Targets self-tag with `data-magnet-active="true"` while the pointer is
 * inside them and `data-magnet-pulse="true"` for ~600ms after a commit,
 * so consumers can style the affordance entirely from CSS without
 * mirroring state into Vue.
 *
 * Usage:
 *   const chipEl = ref<HTMLElement | null>(null);
 *   useDragSource(chipEl, { type: 'contact', payload: contact });
 *
 *   const projectRowEl = ref<HTMLElement | null>(null);
 *   useDropTarget(projectRowEl, {
 *     accepts: 'contact',
 *     onDrop: (contact) => attachContactToProject(contact),
 *   });
 */

const SPRING_EASE = 'cubic-bezier(0.36, 0.66, 0.04, 1)';
const SPRING_MS = 400;
const SNAP_MS = 220;
// Hit-box expansion factor — pointer is "inside" the target once it
// crosses the target's center-padded zone. >1 makes the magnet pull-in
// happen before the pointer actually reaches the target's geometry.
const MAGNET_PAD_RATIO = 0.18;

interface DropTargetOpts {
	accepts: string | string[];
	onDrop: (payload: unknown) => void | Promise<void>;
	onMagnetEnter?: () => void;
	onMagnetLeave?: () => void;
}

interface TargetRegistration {
	id: string;
	el: HTMLElement;
	opts: DropTargetOpts;
}

interface DragSourceOpts<T = unknown> {
	type: string;
	payload: T;
	onStart?: () => void;
	onEnd?: (result: { dropped: boolean }) => void;
}

const targets = new Map<string, TargetRegistration>();
let nextTargetId = 1;

interface ActiveDrag {
	type: string;
	payload: unknown;
	source: HTMLElement;
	sourceOriginalOpacity: string;
	ghost: HTMLElement;
	sourceRect: { x: number; y: number; w: number; h: number };
	pointerOffsetX: number;
	pointerOffsetY: number;
	hoveredId: string | null;
}

let activeDrag: ActiveDrag | null = null;

function findHovered(x: number, y: number): TargetRegistration | null {
	if (!activeDrag) return null;
	let best: { reg: TargetRegistration; dist: number } | null = null;
	for (const reg of targets.values()) {
		const accepts = Array.isArray(reg.opts.accepts) ? reg.opts.accepts : [reg.opts.accepts];
		if (!accepts.includes(activeDrag.type)) continue;
		const r = reg.el.getBoundingClientRect();
		if (r.width === 0 || r.height === 0) continue;
		const padX = r.width * MAGNET_PAD_RATIO;
		const padY = r.height * MAGNET_PAD_RATIO;
		if (
			x >= r.left - padX && x <= r.right + padX
			&& y >= r.top - padY && y <= r.bottom + padY
		) {
			const cx = r.left + r.width / 2;
			const cy = r.top + r.height / 2;
			const dist = Math.hypot(cx - x, cy - y);
			if (!best || dist < best.dist) best = { reg, dist };
		}
	}
	return best?.reg ?? null;
}

function setGhostFollow(x: number, y: number) {
	if (!activeDrag) return;
	activeDrag.ghost.style.transition = 'none';
	activeDrag.ghost.style.transform = `translate3d(${x}px, ${y}px, 0)`;
}

function setGhostMagnet(targetEl: HTMLElement, pointerX: number, pointerY: number) {
	if (!activeDrag) return;
	const r = targetEl.getBoundingClientRect();
	const targetCenterX = r.left + r.width / 2 - activeDrag.sourceRect.w / 2;
	const targetCenterY = r.top + r.height / 2 - activeDrag.sourceRect.h / 2;
	const followX = pointerX - activeDrag.pointerOffsetX;
	const followY = pointerY - activeDrag.pointerOffsetY;
	// Soft pull — 60% toward target center, 40% with the pointer. Reads
	// as a magnetic attraction without losing the user's grip.
	const blendX = targetCenterX * 0.6 + followX * 0.4;
	const blendY = targetCenterY * 0.6 + followY * 0.4;
	activeDrag.ghost.style.transition = `transform ${SNAP_MS}ms ${SPRING_EASE}`;
	activeDrag.ghost.style.transform = `translate3d(${blendX}px, ${blendY}px, 0) scale(1.04)`;
}

function setGhostDropCommit(targetEl: HTMLElement) {
	if (!activeDrag) return;
	const r = targetEl.getBoundingClientRect();
	const cx = r.left + r.width / 2 - activeDrag.sourceRect.w / 2;
	const cy = r.top + r.height / 2 - activeDrag.sourceRect.h / 2;
	activeDrag.ghost.style.transition = `transform ${SPRING_MS}ms ${SPRING_EASE}, opacity 240ms ease-out`;
	activeDrag.ghost.style.transform = `translate3d(${cx}px, ${cy}px, 0) scale(0.4)`;
	activeDrag.ghost.style.opacity = '0';
}

function setGhostSpringBack() {
	if (!activeDrag) return;
	const { x, y } = activeDrag.sourceRect;
	activeDrag.ghost.style.transition = `transform ${SPRING_MS}ms ${SPRING_EASE}, opacity 240ms ease-out`;
	activeDrag.ghost.style.transform = `translate3d(${x}px, ${y}px, 0) scale(1)`;
	activeDrag.ghost.style.opacity = '0';
}

function clearHoveredTarget() {
	if (!activeDrag || !activeDrag.hoveredId) return;
	const prev = targets.get(activeDrag.hoveredId);
	prev?.el.removeAttribute('data-magnet-active');
	prev?.opts.onMagnetLeave?.();
	activeDrag.hoveredId = null;
}

export function useDragSource<T = unknown>(
	elRef: Ref<HTMLElement | null>,
	opts: DragSourceOpts<T> | (() => DragSourceOpts<T>),
) {
	const resolveOpts = () => (typeof opts === 'function' ? opts() : opts);
	const { triggerHaptic } = useHaptic();

	function start(e: PointerEvent) {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		const el = elRef.value;
		if (!el) return;
		// Ignore drags that originate on an interactive child the user
		// is probably tapping (button, input) so we don't trap clicks.
		const interactive = (e.target as HTMLElement | null)?.closest('button, a, input, textarea, [data-no-drag]');
		if (interactive && interactive !== el) {
			// allow if the interactive itself IS the source
			if (!el.contains(interactive) || interactive.hasAttribute('data-no-drag')) {
				/* let normal click through */
				return;
			}
		}

		e.preventDefault();
		const rect = el.getBoundingClientRect();
		const ghost = el.cloneNode(true) as HTMLElement;
		// Strip the dragged clone of any inherited inline opacity so it
		// renders crisp regardless of what the source has on it.
		ghost.style.cssText = `
			position: fixed;
			top: 0; left: 0;
			width: ${rect.width}px;
			height: ${rect.height}px;
			margin: 0;
			padding: ${getComputedStyle(el).padding};
			transform: translate3d(${rect.left}px, ${rect.top}px, 0);
			pointer-events: none;
			z-index: 9999;
			opacity: 1;
			box-shadow: 0 14px 32px rgba(0, 0, 0, 0.22), 0 4px 10px rgba(0, 0, 0, 0.12);
			will-change: transform, opacity;
		`.replace(/\s+/g, ' ');
		// Ensure cloned children inherit pointer-events: none too.
		ghost.querySelectorAll<HTMLElement>('*').forEach((child) => {
			child.style.pointerEvents = 'none';
		});
		document.body.appendChild(ghost);

		const sourceOriginalOpacity = el.style.opacity;
		el.style.opacity = '0.32';
		el.setAttribute('data-drag-source-active', 'true');

		const resolved = resolveOpts();
		activeDrag = {
			type: resolved.type,
			payload: resolved.payload,
			source: el,
			sourceOriginalOpacity,
			ghost,
			sourceRect: { x: rect.left, y: rect.top, w: rect.width, h: rect.height },
			pointerOffsetX: e.clientX - rect.left,
			pointerOffsetY: e.clientY - rect.top,
			hoveredId: null,
		};

		resolved.onStart?.();
		triggerHaptic('light');

		document.addEventListener('pointermove', move, { passive: false });
		document.addEventListener('pointerup', end);
		document.addEventListener('pointercancel', end);
	}

	function move(e: PointerEvent) {
		if (!activeDrag) return;
		e.preventDefault();
		const target = findHovered(e.clientX, e.clientY);
		if (target && target.id !== activeDrag.hoveredId) {
			clearHoveredTarget();
			target.el.setAttribute('data-magnet-active', 'true');
			target.opts.onMagnetEnter?.();
			activeDrag.hoveredId = target.id;
			triggerHaptic('light');
			setGhostMagnet(target.el, e.clientX, e.clientY);
		} else if (target && target.id === activeDrag.hoveredId) {
			// Keep the magnet pull updated as the pointer moves inside.
			setGhostMagnet(target.el, e.clientX, e.clientY);
		} else if (!target && activeDrag.hoveredId) {
			clearHoveredTarget();
			setGhostFollow(e.clientX - activeDrag.pointerOffsetX, e.clientY - activeDrag.pointerOffsetY);
		} else {
			setGhostFollow(e.clientX - activeDrag.pointerOffsetX, e.clientY - activeDrag.pointerOffsetY);
		}
	}

	function end(_e: PointerEvent) {
		document.removeEventListener('pointermove', move);
		document.removeEventListener('pointerup', end);
		document.removeEventListener('pointercancel', end);
		if (!activeDrag) return;
		const dragRef = activeDrag;
		const target = dragRef.hoveredId ? targets.get(dragRef.hoveredId) : null;
		const dropped = !!target;

		if (target) {
			triggerHaptic('success');
			setGhostDropCommit(target.el);
			target.el.setAttribute('data-magnet-pulse', 'true');
			setTimeout(() => target.el.removeAttribute('data-magnet-pulse'), 600);
			try {
				target.opts.onDrop(dragRef.payload);
			} catch (err) {
				console.error('[useDragMagnet] onDrop threw', err);
			}
		} else {
			setGhostSpringBack();
		}

		const cleanupDelay = SPRING_MS + 32;
		setTimeout(() => {
			dragRef.source.style.opacity = dragRef.sourceOriginalOpacity;
			dragRef.source.removeAttribute('data-drag-source-active');
			dragRef.ghost.remove();
			if (dragRef.hoveredId) {
				const prev = targets.get(dragRef.hoveredId);
				prev?.el.removeAttribute('data-magnet-active');
			}
			resolveOpts().onEnd?.({ dropped });
		}, cleanupDelay);

		activeDrag = null;
	}

	watchEffect((onCleanup) => {
		const el = elRef.value;
		if (!el) return;
		el.addEventListener('pointerdown', start);
		// Block native drag + scroll while the user is grabbing.
		const prevTouchAction = el.style.touchAction;
		const prevUserSelect = el.style.userSelect;
		el.style.touchAction = 'none';
		el.style.userSelect = 'none';
		onCleanup(() => {
			el.removeEventListener('pointerdown', start);
			el.style.touchAction = prevTouchAction;
			el.style.userSelect = prevUserSelect;
		});
	});
}

export function useDropTarget(
	elRef: Ref<HTMLElement | null>,
	opts: DropTargetOpts,
) {
	const id = `dt-${nextTargetId++}`;

	watchEffect((onCleanup) => {
		const el = elRef.value;
		if (!el) return;
		targets.set(id, { id, el, opts });
		onCleanup(() => {
			targets.delete(id);
		});
	});
}
