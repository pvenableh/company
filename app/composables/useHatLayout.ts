// composables/useHatLayout.ts
// Hat-aware widget visibility for the home dashboard.
// Each hat declares which widgets it cares about; widgets not listed for the
// active hat are hidden. The 'default' hat shows everything.

const HAT_WIDGETS: Record<string, string[]> = {
	default: [], // empty = show all
	project_manager: [
		'project-timeline',
		'priority-actions',
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

export const useHatLayout = () => {
	const { activeHat } = useNavPreferences();

	const showWidget = (widget: string): boolean => {
		const hatId = activeHat.value.id;
		const allowed = HAT_WIDGETS[hatId];
		if (!allowed || allowed.length === 0) return true; // default = everything
		return allowed.includes(widget);
	};

	return { showWidget };
};
