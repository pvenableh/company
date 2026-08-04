// useDashboardLayout — per-user command-center layout: which widgets are shown,
// and in what order. Governs everything BELOW the pinned Priority Actions block
// (Priority Actions is the point of the page, so it's never hideable/movable).
//
// v1 persists to localStorage (per-device) so it ships without a schema change.
// A future `ai_preferences.dashboard_layout` JSON field can add cross-device
// sync — mirror the isolated saver pattern in useAIPreferences.saveDigestToDirectus.
//
// The layout only decides ORDER + VISIBILITY. A widget can be "visible" here yet
// still render nothing when its own guard is false (e.g. Team Leaderboard only
// with a team selected, goal widgets only when goals are enabled) — index.vue
// ANDs the layout visibility with each widget's existing condition.

export interface DashboardWidgetDef {
	id: string;
	label: string;
	/** Grid columns on lg (the grid is lg:grid-cols-3). Defaults to 3 (full width). */
	span?: 1 | 2 | 3;
	/** Hidden by default until the user opts in from the Customize tray. */
	defaultHidden?: boolean;
}

// Catalog + DEFAULT ORDER of the reorderable widgets. Adding a new id here makes
// it appear (appended) for users who already have a saved layout.
export const DASHBOARD_WIDGETS: DashboardWidgetDef[] = [
	{ id: 'quick-tasks', label: 'Quick Tasks', span: 1 },
	{ id: 'earnest-score', label: 'Earnest Score', span: 1 },
	{ id: 'score-trend', label: 'Score Trend', span: 1 },
	{ id: 'my-goals', label: 'My Goals', span: 1 },
	{ id: 'suggestions', label: 'Suggestions', span: 3 },
	{ id: 'pinned-work', label: 'Pinned Work', span: 3 },
	{ id: 'active-work', label: 'Active Clients & Projects', span: 3 },
	{ id: 'project-briefs', label: 'Project Briefs', span: 2 },
	{ id: 'crm-pulse', label: 'CRM Pulse', span: 1 },
	{ id: 'marketing', label: 'Marketing Pulse', span: 3 },
	{ id: 'goals-summary', label: 'Goals Summary', span: 3 },
	{ id: 'financial', label: 'Financial', span: 3 },
	{ id: 'channels', label: 'Channels', span: 1 },
	{ id: 'carddesk', label: 'CardDesk Pipeline', span: 1 },
	{ id: 'leaderboard', label: 'Team Leaderboard', span: 3 },
];

const CATALOG_IDS = DASHBOARD_WIDGETS.map((w) => w.id);
const SPAN_BY_ID = new Map(DASHBOARD_WIDGETS.map((w) => [w.id, w.span ?? 3]));
const LABEL_BY_ID = new Map(DASHBOARD_WIDGETS.map((w) => [w.id, w.label]));
const STORAGE_KEY = 'earnest-dashboard-layout-v1';

// Module-level shared state so every consumer (page + customize panel) sees the
// same layout without re-reading storage.
const _order = ref<string[]>([...CATALOG_IDS]);
const _hidden = ref<Set<string>>(new Set(DASHBOARD_WIDGETS.filter((w) => w.defaultHidden).map((w) => w.id)));
const _editing = ref(false);
let _loaded = false;

// Reconcile a saved id list against the current catalog: keep known ids in their
// saved order, drop stale ones, append any new catalog ids at the end.
function reconcileOrder(saved: string[]): string[] {
	const known = saved.filter((id) => CATALOG_IDS.includes(id));
	const missing = CATALOG_IDS.filter((id) => !known.includes(id));
	return [...known, ...missing];
}

function persist() {
	if (import.meta.server) return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ order: _order.value, hidden: [..._hidden.value] }));
	} catch { /* private mode / quota — layout just won't persist */ }
}

export const useDashboardLayout = () => {
	const load = () => {
		if (_loaded || import.meta.server) return;
		_loaded = true;
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (raw) {
				const parsed = JSON.parse(raw) as { order?: string[]; hidden?: string[] };
				if (Array.isArray(parsed.order)) _order.value = reconcileOrder(parsed.order);
				if (Array.isArray(parsed.hidden)) _hidden.value = new Set(parsed.hidden.filter((id) => CATALOG_IDS.includes(id)));
			}
		} catch { /* fall back to defaults */ }
	};

	const orderedIds = computed(() => reconcileOrder(_order.value));
	const visibleOrdered = computed(() => orderedIds.value.filter((id) => !_hidden.value.has(id)));
	const hiddenList = computed(() => orderedIds.value.filter((id) => _hidden.value.has(id)));

	const isHidden = (id: string) => _hidden.value.has(id);
	const isVisible = (id: string) => !_hidden.value.has(id);
	const spanOf = (id: string) => SPAN_BY_ID.get(id) ?? 3;
	const labelOf = (id: string) => LABEL_BY_ID.get(id) ?? id;

	const hideWidget = (id: string) => {
		if (!_hidden.value.has(id)) {
			_hidden.value = new Set([..._hidden.value, id]);
			persist();
		}
	};
	const showWidget = (id: string) => {
		if (_hidden.value.has(id)) {
			const next = new Set(_hidden.value);
			next.delete(id);
			_hidden.value = next;
			persist();
		}
	};
	const toggleWidget = (id: string) => (isHidden(id) ? showWidget(id) : hideWidget(id));

	// Replace the visible order (from a drag). Hidden ids are appended after so
	// they keep a stable slot and reappear at the end when un-hidden.
	const setVisibleOrder = (ids: string[]) => {
		const visible = ids.filter((id) => CATALOG_IDS.includes(id));
		const hidden = orderedIds.value.filter((id) => _hidden.value.has(id));
		_order.value = [...visible, ...hidden];
		persist();
	};

	// Up/down nudge within the FULL order (used by the a11y/touch buttons).
	const moveBy = (id: string, delta: number) => {
		const arr = [...orderedIds.value];
		const from = arr.indexOf(id);
		if (from === -1) return;
		const to = Math.max(0, Math.min(arr.length - 1, from + delta));
		if (to === from) return;
		arr.splice(to, 0, arr.splice(from, 1)[0]);
		_order.value = arr;
		persist();
	};

	const reset = () => {
		_order.value = [...CATALOG_IDS];
		_hidden.value = new Set(DASHBOARD_WIDGETS.filter((w) => w.defaultHidden).map((w) => w.id));
		persist();
	};

	const editing = computed(() => _editing.value);
	const setEditing = (v: boolean) => { _editing.value = v; };
	const toggleEditing = () => { _editing.value = !_editing.value; };

	return {
		widgets: DASHBOARD_WIDGETS,
		load,
		orderedIds,
		visibleOrdered,
		hiddenList,
		isHidden,
		isVisible,
		spanOf,
		labelOf,
		hideWidget,
		showWidget,
		toggleWidget,
		setVisibleOrder,
		moveBy,
		reset,
		editing,
		setEditing,
		toggleEditing,
	};
};
