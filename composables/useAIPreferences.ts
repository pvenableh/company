// composables/useAIPreferences.ts
// Manages user-selectable AI tray module preferences.
// Persists to localStorage per-user so each team member can customize
// which data sources feed into their AI suggestions.

export interface AIModule {
	key: string;
	label: string;
	icon: string;
	description: string;
	category: string;
}

const AI_MODULES: AIModule[] = [
	{
		key: 'tickets',
		label: 'Tickets',
		icon: 'i-heroicons-queue-list',
		description: 'Overdue and due-today tickets',
		category: 'Work',
	},
	{
		key: 'projects',
		label: 'Projects',
		icon: 'i-heroicons-square-3-stack-3d',
		description: 'Project deadlines and status',
		category: 'Work',
	},
	{
		key: 'tasks',
		label: 'Tasks',
		icon: 'i-heroicons-clipboard-document-check',
		description: 'Assigned tasks and due dates',
		category: 'Work',
	},
	{
		key: 'invoices',
		label: 'Invoices',
		icon: 'i-heroicons-document-text',
		description: 'Unpaid invoices and cash flow',
		category: 'Finance',
	},
	{
		key: 'deals',
		label: 'Deals & Leads',
		icon: 'i-heroicons-user-plus',
		description: 'Pipeline follow-ups and stale deals',
		category: 'Finance',
	},
	{
		key: 'channels',
		label: 'Channels & Messages',
		icon: 'i-heroicons-chat-bubble-left-right',
		description: 'Team chat activity',
		category: 'Communication',
	},
	{
		key: 'social',
		label: 'Social Media',
		icon: 'i-heroicons-share',
		description: 'Scheduled posts, drafts, and failed posts',
		category: 'Marketing',
	},
	{
		key: 'scheduling',
		label: 'Scheduling',
		icon: 'i-heroicons-calendar-date-range',
		description: 'Upcoming meetings and appointments',
		category: 'Communication',
	},
	{
		key: 'phone',
		label: 'Phone & Activities',
		icon: 'i-heroicons-phone',
		description: 'Missed calls and overdue activities',
		category: 'Communication',
	},
];

const STORAGE_KEY = 'ai-tray-preferences';

export const useAIPreferences = () => {
	const { user } = useDirectusAuth();

	// Build a per-user storage key
	const storageKey = computed(() => {
		const userId = user.value?.id || 'anonymous';
		return `${STORAGE_KEY}-${userId}`;
	});

	// Enabled modules (all enabled by default)
	const enabledModules = ref<Set<string>>(new Set(AI_MODULES.map((m) => m.key)));

	// Load from localStorage
	const load = () => {
		if (import.meta.server) return;
		try {
			const saved = localStorage.getItem(storageKey.value);
			if (saved) {
				const parsed = JSON.parse(saved) as string[];
				enabledModules.value = new Set(parsed);
			}
		} catch {
			// Use defaults on error
		}
	};

	// Save to localStorage
	const save = () => {
		if (import.meta.server) return;
		try {
			localStorage.setItem(storageKey.value, JSON.stringify([...enabledModules.value]));
		} catch {}
	};

	const toggle = (moduleKey: string) => {
		const set = new Set(enabledModules.value);
		if (set.has(moduleKey)) {
			set.delete(moduleKey);
		} else {
			set.add(moduleKey);
		}
		enabledModules.value = set;
		save();
	};

	const isEnabled = (moduleKey: string) => {
		return enabledModules.value.has(moduleKey);
	};

	const enableAll = () => {
		enabledModules.value = new Set(AI_MODULES.map((m) => m.key));
		save();
	};

	const disableAll = () => {
		enabledModules.value = new Set();
		save();
	};

	// Load on init
	load();

	// Reload when user changes
	watch(storageKey, () => load());

	return {
		modules: AI_MODULES,
		enabledModules: readonly(enabledModules),
		toggle,
		isEnabled,
		enableAll,
		disableAll,
	};
};
