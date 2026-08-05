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
	/**
	 * Grid ROWS on lg. Defaults to 1. A tall anchor widget (row-span 2) lets two
	 * short single-column widgets stack beside it — e.g. Priority Actions holding
	 * the left while Quick Tasks + Pursuits stack in the right column.
	 */
	rowSpan?: 1 | 2;
	/** Hidden by default until the user opts in from the Customize tray. */
	defaultHidden?: boolean;
	/** Cap the widget height and scroll its overflow so it can't stretch a row. */
	scroll?: boolean;
}

// Catalog + DEFAULT ORDER of the reorderable widgets. Adding a new id here makes
// it appear (appended) for users who already have a saved layout.
//
// Order groups WORK up top and IDENTITY/relationship widgets below it, for a
// cohesive grid. Priority Actions (span 2) + Quick Tasks (span 1) share the top
// row; `grid-flow-row-dense` backfills any gaps. Everything here is fully
// customizable — Priority Actions is a normal widget now, not a pinned block.
export const DASHBOARD_WIDGETS: DashboardWidgetDef[] = [
	// ── Work (top) ──
	// Priority Actions anchors the left as a 2×2 block so Quick Tasks + Pursuits
	// stack in the right column beside it (the grid is grid-flow-row-dense).
	{ id: 'priority-actions', label: 'Priority Actions', span: 2, rowSpan: 2 },
	{ id: 'quick-tasks', label: 'Quick Tasks', span: 1, scroll: true },
	// Sits directly under Quick Tasks by default — a glance at the sales pipeline.
	{ id: 'pursuits', label: 'Pursuits', span: 1, scroll: true },
	{ id: 'active-work', label: 'Active Clients & Projects', span: 3 },
	{ id: 'suggestions', label: 'More Suggestions', span: 3 },
	// Project Briefs + Channels share a row (2 + 1) on large screens.
	{ id: 'project-briefs', label: 'Project Briefs', span: 2, scroll: true },
	{ id: 'channels', label: 'Channels', span: 1, scroll: true },
	{ id: 'financial', label: 'Financial', span: 3, scroll: true },
	{ id: 'marketing', label: 'Marketing Pulse', span: 3 },
	// ── Identity / gamification / relationship (below the work widgets) ──
	// Badges get their own full-width row, above the trio below.
	{ id: 'badges', label: 'Badges', span: 3 },
	// Row: Earnest Score (+trend) | CardDesk | CRM Pulse.
	{ id: 'earnest-score', label: 'Earnest Score', span: 1 },
	{ id: 'carddesk', label: 'CardDesk Pipeline', span: 1, scroll: true },
	{ id: 'crm-pulse', label: 'CRM Pulse', span: 1 },
	// Goals + leaderboard.
	{ id: 'my-goals', label: 'My Goals', span: 1, scroll: true },
	{ id: 'goals-summary', label: 'Goals Summary', span: 3, scroll: true },
	{ id: 'leaderboard', label: 'Team Leaderboard', span: 3 },
	// Active Work already sorts pinned-first, so standalone Pinned Work is
	// redundant — default-hidden, re-addable from the Customize tray.
	{ id: 'pinned-work', label: 'Pinned Work', span: 3, defaultHidden: true },
];

const CATALOG_IDS = DASHBOARD_WIDGETS.map((w) => w.id);
const SPAN_BY_ID = new Map(DASHBOARD_WIDGETS.map((w) => [w.id, w.span ?? 3]));
const ROWSPAN_BY_ID = new Map(DASHBOARD_WIDGETS.map((w) => [w.id, w.rowSpan ?? 1]));
const LABEL_BY_ID = new Map(DASHBOARD_WIDGETS.map((w) => [w.id, w.label]));
const SCROLL_IDS = new Set(DASHBOARD_WIDGETS.filter((w) => w.scroll).map((w) => w.id));
const STORAGE_KEY = 'earnest-dashboard-layout-v1';
// Layout schema version. Bump when a saved layout needs a one-time migration.
// v1 → v2: reposition widgets that shipped AFTER v1 and were appended to the end
// of already-saved layouts, so they land beside their catalog neighbour instead
// (e.g. Pursuits under Quick Tasks rather than dumped at the bottom).
const LAYOUT_VERSION = 2;
// Widgets introduced since v1. On upgrade we lift these out of a saved order so
// reconcileOrder re-inserts them at their catalog slot.
const REPOSITION_ON_UPGRADE = new Set(['pursuits']);

// Module-level shared state so every consumer (page + customize panel) sees the
// same layout without re-reading storage.
const _order = ref<string[]>([...CATALOG_IDS]);
const _hidden = ref<Set<string>>(new Set(DASHBOARD_WIDGETS.filter((w) => w.defaultHidden).map((w) => w.id)));
// Per-widget column-span overrides (user-set width on large screens). Absent =
// use the catalog default. Only 1|2|3 are valid.
const _spans = ref<Record<string, 1 | 2 | 3>>({});
// Per-widget row-span overrides (user-set height on large screens). Absent = use
// the catalog default. Only 1|2 are valid.
const _rowSpans = ref<Record<string, 1 | 2>>({});
const _editing = ref(false);
let _loaded = false;
// Set by applyLayout when a version migration repositioned a widget, so the
// caller re-persists the upgraded order (and stamps the new version).
let _migrated = false;
// The user's `ai_preferences` row id, for the cross-device mirror. Shared with
// useAIPreferences' own copy in spirit; we track our own since it isn't exported.
let _recordId: number | null = null;
let _saveTimer: ReturnType<typeof setTimeout> | null = null;

// Reconcile a saved id list against the current catalog: keep known ids in their
// saved order, drop stale/duplicate ones, and slot any new catalog ids in beside
// their catalog neighbour (the id that precedes them in the catalog) rather than
// dumping them at the end — so a freshly shipped widget appears where its default
// slot is, even for a user who already has a saved layout.
function reconcileOrder(saved: string[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const id of saved) {
		if (CATALOG_IDS.includes(id) && !seen.has(id)) { seen.add(id); result.push(id); }
	}
	// Insert missing ids in catalog order; each lands right after the nearest
	// earlier catalog id already placed (chaining through ids inserted this pass).
	for (const id of CATALOG_IDS) {
		if (result.includes(id)) continue;
		const catIdx = CATALOG_IDS.indexOf(id);
		let insertAt = result.length;
		for (let i = catIdx - 1; i >= 0; i--) {
			const pos = result.indexOf(CATALOG_IDS[i]!);
			if (pos !== -1) { insertAt = pos + 1; break; }
		}
		result.splice(insertAt, 0, id);
	}
	return result;
}

// Apply a persisted { order, hidden, spans, rowSpans } payload (localStorage or Directus).
function applyLayout(parsed: { v?: number; order?: string[]; hidden?: string[]; spans?: Record<string, number>; rowSpans?: Record<string, number> } | null | undefined): boolean {
	if (!parsed || typeof parsed !== 'object') return false;
	let applied = false;
	if (Array.isArray(parsed.order)) {
		let ord = parsed.order;
		// One-time upgrade: strip widgets added since the saved version so
		// reconcileOrder re-inserts them beside their catalog neighbour (they were
		// appended to the end under the old version). Hidden + spans are untouched.
		if ((parsed.v ?? 1) < LAYOUT_VERSION) {
			ord = ord.filter((id) => !REPOSITION_ON_UPGRADE.has(id));
			_migrated = true;
		}
		_order.value = reconcileOrder(ord);
		applied = true;
	}
	if (Array.isArray(parsed.hidden)) { _hidden.value = new Set(parsed.hidden.filter((id) => CATALOG_IDS.includes(id))); applied = true; }
	if (parsed.spans && typeof parsed.spans === 'object') {
		const next: Record<string, 1 | 2 | 3> = {};
		for (const [id, v] of Object.entries(parsed.spans)) {
			if (CATALOG_IDS.includes(id) && (v === 1 || v === 2 || v === 3)) next[id] = v;
		}
		_spans.value = next;
		applied = true;
	}
	if (parsed.rowSpans && typeof parsed.rowSpans === 'object') {
		const next: Record<string, 1 | 2> = {};
		for (const [id, v] of Object.entries(parsed.rowSpans)) {
			if (CATALOG_IDS.includes(id) && (v === 1 || v === 2)) next[id] = v;
		}
		_rowSpans.value = next;
		applied = true;
	}
	return applied;
}

function persistLocal() {
	if (import.meta.server) return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: LAYOUT_VERSION, order: _order.value, hidden: [..._hidden.value], spans: _spans.value, rowSpans: _rowSpans.value }));
	} catch { /* private mode / quota — layout just won't persist locally */ }
}

export const useDashboardLayout = () => {
	const prefItems = useDirectusItems('ai_preferences');
	const { user } = useDirectusAuth();

	// Debounced mirror to ai_preferences.dashboard_layout (cross-device). Isolated
	// so a missing column (before scripts/setup-dashboard-layout.ts runs) or any
	// write error never breaks the instant localStorage save. `as any` on the
	// payload keeps this compiling before `pnpm generate:types` adds the field.
	const saveToDirectus = () => {
		if (_saveTimer) clearTimeout(_saveTimer);
		_saveTimer = setTimeout(async () => {
			if (import.meta.server || !user.value?.id) return;
			const payload = { dashboard_layout: { v: LAYOUT_VERSION, order: _order.value, hidden: [..._hidden.value], spans: _spans.value, rowSpans: _rowSpans.value } };
			try {
				if (_recordId) {
					await prefItems.update(_recordId, payload);
				} else {
					// No known row yet — find one (useAIPreferences usually created it)
					// before creating, so we don't duplicate the user's prefs row.
					const rows = await prefItems.list({ fields: ['id'], filter: { user: { _eq: user.value.id } }, limit: 1 }) as any[];
					if (rows?.[0]?.id) {
						_recordId = rows[0].id;
						await prefItems.update(_recordId as any, payload);
					} else {
						const rec = await prefItems.create({ user: user.value.id, ...payload }) as any;
						_recordId = rec?.id ?? null;
					}
				}
			} catch (err) {
				console.warn('[useDashboardLayout] Could not save layout to Directus (field may be unprovisioned):', err);
			}
		}, 600);
	};

	const commit = () => { persistLocal(); saveToDirectus(); };

	// Pull the saved layout from Directus (cross-device authority). Runs after the
	// instant localStorage load; a server value overrides local so the user's
	// arrangement follows them between devices.
	const syncFromDirectus = async () => {
		if (import.meta.server || !user.value?.id) return;
		try {
			const rows = await prefItems.list({
				fields: ['id', 'dashboard_layout'],
				filter: { user: { _eq: user.value.id } },
				limit: 1,
			}) as any[];
			if (rows?.[0]) {
				_recordId = rows[0].id;
				if (applyLayout(rows[0].dashboard_layout)) {
						persistLocal(); // refresh local cache
						// A version migration repositioned a widget — write the upgraded
						// order back so the server stops handing us the stale layout.
						if (_migrated) { _migrated = false; saveToDirectus(); }
					}
			}
		} catch (err) {
			console.warn('[useDashboardLayout] Could not sync layout from Directus:', err);
		}
	};

	const load = () => {
		if (import.meta.server) return;
		if (!_loaded) {
			_loaded = true;
			try {
				const raw = localStorage.getItem(STORAGE_KEY);
				if (raw) applyLayout(JSON.parse(raw));
			} catch { /* fall back to defaults */ }
			// A version migration repositioned a widget on read — persist the upgrade.
			if (_migrated) { _migrated = false; commit(); }
		}
		// Always attempt a background cross-device sync (cheap, cached row).
		void syncFromDirectus();
	};

	const orderedIds = computed(() => reconcileOrder(_order.value));
	const visibleOrdered = computed(() => orderedIds.value.filter((id) => !_hidden.value.has(id)));
	const hiddenList = computed(() => orderedIds.value.filter((id) => _hidden.value.has(id)));

	const isHidden = (id: string) => _hidden.value.has(id);
	const isVisible = (id: string) => !_hidden.value.has(id);
	// User override wins over the catalog default.
	const spanOf = (id: string): 1 | 2 | 3 => _spans.value[id] ?? (SPAN_BY_ID.get(id) as 1 | 2 | 3) ?? 3;
	const rowSpanOf = (id: string): 1 | 2 => _rowSpans.value[id] ?? (ROWSPAN_BY_ID.get(id) as 1 | 2) ?? 1;
	const labelOf = (id: string) => LABEL_BY_ID.get(id) ?? id;
	const scrollOf = (id: string) => SCROLL_IDS.has(id);

	// Cycle a widget's width 1 → 2 → 3 → 1 (large screens). Persisted per user.
	const cycleSpan = (id: string) => {
		const next = ((spanOf(id) % 3) + 1) as 1 | 2 | 3;
		_spans.value = { ..._spans.value, [id]: next };
		commit();
	};

	// Cycle a widget's height 1 → 2 → 1 rows (large screens). A 2-row anchor lets
	// two short widgets stack beside it. Persisted per user.
	const cycleRowSpan = (id: string) => {
		const next = (rowSpanOf(id) === 2 ? 1 : 2) as 1 | 2;
		_rowSpans.value = { ..._rowSpans.value, [id]: next };
		commit();
	};

	const hideWidget = (id: string) => {
		if (!_hidden.value.has(id)) {
			_hidden.value = new Set([..._hidden.value, id]);
			commit();
		}
	};
	const showWidget = (id: string) => {
		if (_hidden.value.has(id)) {
			const next = new Set(_hidden.value);
			next.delete(id);
			_hidden.value = next;
			commit();
		}
	};
	const toggleWidget = (id: string) => (isHidden(id) ? showWidget(id) : hideWidget(id));

	// Replace the visible order (from a drag). Hidden ids are appended after so
	// they keep a stable slot and reappear at the end when un-hidden.
	const setVisibleOrder = (ids: string[]) => {
		const visible = ids.filter((id) => CATALOG_IDS.includes(id));
		const hidden = orderedIds.value.filter((id) => _hidden.value.has(id));
		_order.value = [...visible, ...hidden];
		commit();
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
		commit();
	};

	const reset = () => {
		_order.value = [...CATALOG_IDS];
		_hidden.value = new Set(DASHBOARD_WIDGETS.filter((w) => w.defaultHidden).map((w) => w.id));
		_spans.value = {};
		_rowSpans.value = {};
		commit();
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
		cycleSpan,
		rowSpanOf,
		cycleRowSpan,
		labelOf,
		scrollOf,
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
