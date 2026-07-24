/**
 * useCreatePanel — bridge for opening a create form as a real slide-over stack
 * panel (Path A) while still passing launch context IN and the created entity
 * OUT across the panel boundary.
 *
 * The slide-over stack only serializes `type:id/mode` in the URL, so it can't
 * carry a rich `defaults` object or hand a freshly-created row back to the
 * surface that opened it. This composable parks both in `useState`, keyed by
 * type:
 *   • create-ctx:<type>  — launch context the panel reads on mount (e.g.
 *     `{ projects: [id] }` for a project-scoped invoice). Set just before the
 *     push; null on a deep-linked/reloaded create (blank form — acceptable).
 *   • created:<type>     — `{ entity, nonce }` the panel writes on success so
 *     every mounted surface's `onCreated` watcher can run its own side effect
 *     (list refetch, junction attach, post-create edit-hop) while the panel
 *     itself stays generic. `nonce` makes repeat creates re-fire the watcher.
 *
 * Launcher side:  const { openCreate, onCreated } = useCreatePanel('invoice')
 *                 openCreate({ projects: [projectId] })
 *                 onCreated((inv) => refetch())
 * Panel side:     const { createContext, emitCreated } = useCreatePanel('invoice')
 *                 <InvoicesFormModal embedded :defaults="createContext" @created="emitCreated" />
 */
export function useCreatePanel<Ctx = any, Entity = any>(type: string) {
	const ctx = useState<Ctx | null>(`create-ctx:${type}`, () => null);
	const created = useState<{ entity: Entity; nonce: number } | null>(
		`created:${type}`,
		() => null,
	);
	const { push, pop } = useAppSlideOverStack();

	// ── launcher side ──────────────────────────────────────────────
	function openCreate(context?: Ctx | null) {
		ctx.value = context ?? null;
		return push(type, 'new', 'create');
	}
	function onCreated(cb: (entity: Entity) => void) {
		watch(
			() => created.value?.nonce,
			(n) => {
				if (n && created.value) cb(created.value.entity);
			},
		);
	}

	// ── panel side ─────────────────────────────────────────────────
	const createContext = computed(() => ctx.value);
	// Notify every mounted surface + pop the create panel. Pass `{ pop: false }`
	// when the form itself navigates away (e.g. proposal/contract's post-create
	// edit-hop replaces this create panel with the new doc's edit panel), so we
	// don't double-navigate.
	function emitCreated(entity: Entity, opts: { pop?: boolean } = {}) {
		created.value = { entity, nonce: (created.value?.nonce ?? 0) + 1 };
		if (opts.pop !== false) pop();
	}

	return { openCreate, onCreated, createContext, emitCreated };
}
