/**
 * useFlipFromRow — pull-from-anywhere primitive.
 *
 * Captures a source element's bounding rect + outerHTML so a paired
 * <AppsAppBottomSheet :flip-from="…"> can FLIP that row into its hero
 * slot on open. The sheet handles the actual animation via inline-style
 * transform + CSS transition (compositor — see [[feedback_motion_stack_policy]]).
 *
 * Usage:
 *   const { flipFrom, captureFromEl, clear } = useFlipFromRow();
 *
 *   function openEdit(task, ev) {
 *     const row = (ev.currentTarget as HTMLElement).closest('.ios-card');
 *     if (row) captureFromEl(row as HTMLElement);
 *     editing.value = task;
 *     editOpen.value = true;
 *   }
 *
 *   // clear() runs after the leave transition so the next open re-captures fresh.
 *   watch(editOpen, (v) => { if (!v) setTimeout(clear, 320); });
 *
 *   <AppsAppBottomSheet v-model="editOpen" :flip-from="flipFrom" title="…">
 *     <template #hero>…landed pose…</template>
 *     …form…
 *   </AppsAppBottomSheet>
 */
export interface FlipFromPayload {
	rect: { x: number; y: number; width: number; height: number };
	html: string;
}

export function useFlipFromRow() {
	const flipFrom = ref<FlipFromPayload | null>(null);

	function captureFromEl(el: HTMLElement | null | undefined) {
		if (!el) {
			flipFrom.value = null;
			return;
		}
		flipFrom.value = flipPayloadFrom(el) ?? null;
	}

	function clear() {
		flipFrom.value = null;
	}

	return { flipFrom, captureFromEl, clear };
}

/**
 * One-shot helper: build a FlipFromPayload from an element without holding
 * any reactive state. Useful for row-click handlers that fan out into
 * `useAppSlideOver(type).open(id, { flipFrom })` — the slide-over stack
 * stashes the payload globally and consumes it inside the shell's
 * onMounted hook, so there's no need for a local ref.
 */
export function flipPayloadFrom(el: HTMLElement | null | undefined): FlipFromPayload | undefined {
	if (!el) return undefined;
	const r = el.getBoundingClientRect();
	if (r.width === 0 || r.height === 0) return undefined;
	return {
		rect: { x: r.left, y: r.top, width: r.width, height: r.height },
		html: el.outerHTML,
	};
}
