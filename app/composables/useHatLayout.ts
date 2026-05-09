// composables/useHatLayout.ts
// Hat-aware widget visibility for the home dashboard.
// Each hat declares which widgets it cares about; widgets not listed for the
// active hat are hidden. The 'default' hat shows everything.

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

// Map hat → AI engine modules to fetch on first paint. `null` means "fetch all".
// Tickets is always included so `metrics.overdueItems` and `tasksCompletedToday`
// (written from analyzeTickets) are populated regardless of hat.
//
// Modules tied to a deferred widget are intentionally OMITTED here so they
// don't fire on cold mount — the widget's `<DeferUntilVisible @enter>` handler
// in pages/index.vue calls `loadModule()` once it scrolls into view:
//   - 'channels'  → CommandCenterRealtimeChat
//   - 'carddesk'  → CommandCenterCardDeskPipeline
//   - 'invoices'  → CommandCenterFinancialQuarter
//   - 'deals'     → CommandCenterFinancialQuarter (accountant only;
//                   salesman keeps 'deals' eager because crm-health/
//                   crm-insights/priority-actions read it above the fold)
const HAT_MODULES: Record<string, string[] | null> = {
	default: null, // null = run every analyzer (legacy behavior)
	project_manager: ['tickets', 'projects', 'tasks', 'goals'],
	accountant: ['tickets', 'tasks', 'goals'],
	salesman: ['tickets', 'tasks', 'deals', 'goals'],
	marketing_manager: ['tickets', 'tasks', 'channels', 'social', 'goals'],
};

export const useHatLayout = () => {
	const { activeHat } = useNavPreferences();

	const showWidget = (widget: string): boolean => {
		const hatId = activeHat.value.id;
		const allowed = HAT_WIDGETS[hatId];
		if (!allowed || allowed.length === 0) return true; // default = everything
		return allowed.includes(widget);
	};

	// Modules the active hat cares about on first paint. `null` = all modules.
	const hatModules = computed<string[] | null>(() => {
		const hatId = activeHat.value.id;
		return HAT_MODULES[hatId] ?? null;
	});

	return { showWidget, hatModules };
};
