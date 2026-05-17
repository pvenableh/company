/**
 * URL-bound slide-over stack for the Apps Layout.
 *
 * Pages declare a slide-over for a given `type` key. Opening pushes the
 * entity into a global stack and serialises it onto the URL as
 * `?slide=type:id` (or `?slide=type:id/type:id` for two-deep). Browser
 * back / swipe-back closes the top panel — the iOS push-and-pop feel.
 *
 * v2 changes (2026-05-17):
 *   - Generic `useAppSlideOverStack()` exposes `push(type, id)` + `pop()`
 *     so any component (incl. a panel itself) can open another panel
 *     without having to bind to its own `useAppSlideOver(type)` instance.
 *   - The new `<AppSlideOverStack>` container (mounted once from
 *     `app/layouts/apps.vue`) reads the global stack, looks each entry up
 *     in `panels/registry.ts`, and renders the panels with iOS push/pop
 *     visuals. Pages no longer render their own `<AppSlideOver>` markup
 *     — they just call `useAppSlideOver(type).open(id)` from row-click
 *     handlers.
 *
 * Stack rules:
 *   - Max depth 2. Pushing onto a full stack replaces the top, not the
 *     bottom (the underlying page context — e.g. clients/[id] — stays).
 *   - Same-type push replaces the top entry, so reopening the same panel
 *     with a new id doesn't grow the stack.
 *
 * History semantics:
 *   - `push()` does a `router.push` and tags the new history entry via
 *     `history.state.__apps_slide_pushed = true`. `pop()` reads that
 *     marker: if set → `router.back()` (iOS back). If the user pasted a
 *     slide URL directly (no marker), `pop()` strips the param in-place
 *     with `router.replace()` so we don't dump them off the page.
 */

export type SlidePanel = {
	type: string;
	id: string;
};

const STACK_KEY = 'apps-slide-over-stack';
const HISTORY_MARKER = '__apps_slide_pushed';
const MAX_DEPTH = 2;

function useGlobalStack() {
	return useState<SlidePanel[]>(STACK_KEY, () => []);
}

/**
 * Reconciles the global stack from the URL on every route change. Call
 * once from the apps layout — never from individual pages.
 */
export function useAppSlideOverStackUrlSync() {
	const stack = useGlobalStack();
	const route = useRoute();

	watch(
		() => route.query.slide,
		(slide) => {
			const next = typeof slide === 'string' && slide ? parseStack(slide) : [];
			if (!stacksEqual(next, stack.value)) {
				stack.value = next;
			}
		},
		{ immediate: true },
	);
}

/**
 * Generic stack accessor — readable state + push/pop. Use this from inside
 * a panel to open or close any registered panel type. The per-type
 * `useAppSlideOver(type)` is built on top of this and is the right tool
 * for page-side row-click handlers that always open the same type.
 */
export function useAppSlideOverStack() {
	const stack = useGlobalStack();
	const route = useRoute();
	const router = useRouter();

	async function push(type: string, id: string) {
		const next: SlidePanel = { type, id: String(id) };
		const existingTop = stack.value[stack.value.length - 1];

		let newStack: SlidePanel[];
		if (existingTop?.type === type) {
			// Same type already on top — replace, don't deepen.
			newStack = [...stack.value.slice(0, -1), next];
		} else if (stack.value.length >= MAX_DEPTH) {
			// Stack is full — replace the top, keep the bottom (page context).
			newStack = [stack.value[0]!, next];
		} else {
			newStack = [...stack.value, next];
		}

		await router.push({
			query: { ...route.query, slide: serializeStack(newStack) },
		});

		if (import.meta.client && typeof history !== 'undefined') {
			// Mark the new history entry so pop() knows it's safe to use back().
			history.replaceState(
				{ ...history.state, [HISTORY_MARKER]: true },
				'',
			);
		}
	}

	async function pop() {
		if (
			import.meta.client &&
			typeof history !== 'undefined' &&
			(history.state as Record<string, unknown> | null)?.[HISTORY_MARKER]
		) {
			router.back();
			return;
		}
		// No marker — user landed on the slide URL directly. Strip the param
		// in-place so we don't bounce them off the page with back().
		const { slide: _slide, ...rest } = route.query;
		await router.replace({ query: rest });
	}

	return {
		stack: readonly(stack),
		depth: computed(() => stack.value.length),
		top: computed(() => stack.value[stack.value.length - 1] ?? null),
		push,
		pop,
	};
}

/**
 * Per-type slide-over binding. Each call returns the open state + active
 * id + open/close fns for one `type` key. Multiple calls with the same
 * type return references to the same underlying stack entry.
 */
export function useAppSlideOver(type: string) {
	const { stack, push, pop } = useAppSlideOverStack();

	const top = computed(() => stack.value[stack.value.length - 1] ?? null);

	const isOpen = computed<boolean>({
		get: () => top.value?.type === type,
		set: (v) => {
			if (!v) pop();
		},
	});

	const activeId = computed<string | null>(() =>
		top.value?.type === type ? top.value.id : null,
	);

	return {
		isOpen,
		activeId,
		open: (id: string) => push(type, id),
		close: () => pop(),
	};
}

/**
 * @deprecated Use `useAppSlideOverStack()` — it returns the same read-only
 * state plus `push` + `pop`. Kept as a thin alias so older imports keep
 * resolving while we sweep.
 */
export function useAppSlideOverStackState() {
	const { stack, depth, top } = useAppSlideOverStack();
	return { stack, depth, top };
}

function serializeStack(s: SlidePanel[]): string {
	return s.map((p) => `${p.type}:${encodeURIComponent(p.id)}`).join('/');
}

function parseStack(slide: string): SlidePanel[] {
	return slide
		.split('/')
		.slice(0, MAX_DEPTH)
		.map<SlidePanel | null>((segment) => {
			const colon = segment.indexOf(':');
			if (colon <= 0) return null;
			const type = segment.slice(0, colon);
			const rawId = segment.slice(colon + 1);
			if (!type || !rawId) return null;
			try {
				return { type, id: decodeURIComponent(rawId) };
			} catch {
				return null;
			}
		})
		.filter((p): p is SlidePanel => p !== null);
}

function stacksEqual(a: SlidePanel[], b: SlidePanel[]): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i]!.type !== b[i]!.type || a[i]!.id !== b[i]!.id) return false;
	}
	return true;
}
