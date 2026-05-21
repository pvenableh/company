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
		const r = el.getBoundingClientRect();
		flipFrom.value = {
			rect: { x: r.left, y: r.top, width: r.width, height: r.height },
			html: el.outerHTML,
		};
	}

	function clear() {
		flipFrom.value = null;
	}

	return { flipFrom, captureFromEl, clear };
}
