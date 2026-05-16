/**
 * Hat-aware widget visibility for the home dashboard.
 *
 * Each hat declares which widgets it cares about; widgets not listed for the
 * active hat are hidden. The 'default' hat shows everything.
 *
 * Hats were originally retired in Apps Layout Phase 7 in favour of Apps Mode,
 * but were brought back in classic-mode only — users on the default sidebar
 * still want a one-click role lens.
 */

const HAT_WIDGETS: Record<string, string[]> = {
	default: [], // empty = show all
	project_manager: [
		'project-timeline',
		'priority-actions',
		'project-digests',
		'quick-tasks',
		'card-desk',
		'goals',
		'realtime-chat',
		'suggestions',
	],
	accountant: [
		'priority-actions',
		'financial-quarter',
		'goals',
		'suggestions',
	],
	salesman: [
		'priority-actions',
		'crm-health',
		'crm-insights',
		'card-desk',
		'goals',
		'realtime-chat',
		'suggestions',
	],
	marketing_manager: [
		'priority-actions',
		'marketing-pulse',
		'marketing-actions',
		'goals',
		'suggestions',
	],
};

/**
 * Map hat → AI engine modules to fetch on first paint. `null` means "fetch
 * all". Tickets is always included so `metrics.overdueItems` and
 * `tasksCompletedToday` (written from analyzeTickets) are populated.
 *
 * Modules tied to a deferred widget are intentionally omitted here so they
 * don't fire on cold mount — the widget's `<DeferUntilVisible @enter>`
 * handler in pages/index.vue calls `loadModule()` once it scrolls into view.
 */
const HAT_MODULES: Record<string, string[] | null> = {
	default: null,
	project_manager: ['tickets', 'projects', 'tasks', 'goals'],
	accountant: ['tickets', 'tasks', 'goals'],
	salesman: ['tickets', 'tasks', 'deals', 'goals'],
	marketing_manager: ['tickets', 'tasks', 'channels', 'social', 'goals'],
};

export const useHatLayout = () => {
	const { activeHat } = useNavPreferences();
	const { isAppsMode } = useAppsMode();

	const showWidget = (widget: string): boolean => {
		// Apps mode renders role-shaped surfaces at the route level; the
		// dashboard always shows the full widget set in that world.
		if (isAppsMode.value) return true;
		const hatId = activeHat.value.id;
		const allowed = HAT_WIDGETS[hatId];
		if (!allowed || allowed.length === 0) return true;
		return allowed.includes(widget);
	};

	const hatModules = computed<string[] | null>(() => {
		if (isAppsMode.value) return null;
		const hatId = activeHat.value.id;
		return HAT_MODULES[hatId] ?? null;
	});

	return { showWidget, hatModules };
};
