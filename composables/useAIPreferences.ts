// composables/useAIPreferences.ts
// Manages user-selectable AI tray module preferences.
// Persists to Directus ai_preferences with localStorage as offline cache.

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
		key: 'goals',
		label: 'Goals',
		icon: 'i-heroicons-flag',
		description: 'Track goal progress and suggestions',
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
		key: 'expenses',
		label: 'Expenses',
		icon: 'i-heroicons-receipt-percent',
		description: 'Expense tracking and financial insights',
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
		key: 'marketing_campaigns',
		label: 'Marketing Campaigns',
		icon: 'i-heroicons-megaphone',
		description: 'Campaign performance and suggestions',
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
	{
		key: 'carddesk',
		label: 'CardDesk',
		icon: 'i-heroicons-identification',
		description: 'Networking follow-ups and contact pipeline',
		category: 'Marketing',
	},
];

// ── Response Verbosity ──
export type ResponseVerbosity = 'concise' | 'regular';

const STORAGE_KEY = 'ai-tray-preferences';
const VERBOSITY_KEY = 'ai-response-verbosity';

// Shared reactive state
const _verbosity = ref<ResponseVerbosity>('regular');
const _personalizationsEnabled = ref(true);
const _lowUsageMode = ref(false);
let _prefRecordId: number | null = null;
let _directusSynced = false;

export const useAIPreferences = () => {
	const { user } = useDirectusAuth();
	const prefItems = useDirectusItems('ai_preferences');

	// Build a per-user storage key
	const storageKey = computed(() => {
		const userId = user.value?.id || 'anonymous';
		return `${STORAGE_KEY}-${userId}`;
	});

	// Enabled modules (all enabled by default)
	const enabledModules = ref<Set<string>>(new Set(AI_MODULES.map((m) => m.key)));

	// Load from localStorage (instant)
	const loadLocal = () => {
		if (import.meta.server) return;
		try {
			const saved = localStorage.getItem(storageKey.value);
			if (saved) {
				const parsed = JSON.parse(saved) as string[];
				enabledModules.value = new Set(parsed);
			}
		} catch {}
	};

	// Save to localStorage
	const saveLocal = () => {
		if (import.meta.server) return;
		try {
			localStorage.setItem(storageKey.value, JSON.stringify([...enabledModules.value]));
		} catch {}
	};

	// Sync from Directus
	const syncFromDirectus = async () => {
		if (import.meta.server || !user.value?.id) return;
		try {
			const records = await prefItems.list({
				fields: ['id', 'enabled_modules', 'personalizations_enabled', 'low_usage_mode'],
				filter: { user: { _eq: user.value.id } },
				limit: 1,
			}) as any[];

			if (records?.[0]) {
				_prefRecordId = records[0].id;

				// Sync enabled modules
				if (records[0].enabled_modules && Array.isArray(records[0].enabled_modules)) {
					enabledModules.value = new Set(records[0].enabled_modules);
					saveLocal(); // Update localStorage cache
				}

				// Sync personalizations
				if (records[0].personalizations_enabled !== null && records[0].personalizations_enabled !== undefined) {
					_personalizationsEnabled.value = records[0].personalizations_enabled;
				}

				// Sync low usage mode
				if (records[0].low_usage_mode !== null && records[0].low_usage_mode !== undefined) {
					_lowUsageMode.value = records[0].low_usage_mode;
				}
			}
			_directusSynced = true;
		} catch (err) {
			console.warn('[useAIPreferences] Could not sync from Directus:', err);
		}
	};

	// Save to Directus (debounced)
	let _saveTimeout: ReturnType<typeof setTimeout> | null = null;
	const saveToDirectus = () => {
		if (_saveTimeout) clearTimeout(_saveTimeout);
		_saveTimeout = setTimeout(async () => {
			if (!user.value?.id) return;
			try {
				const payload = {
					enabled_modules: [...enabledModules.value],
					personalizations_enabled: _personalizationsEnabled.value,
					low_usage_mode: _lowUsageMode.value,
				};
				if (_prefRecordId) {
					await prefItems.update(_prefRecordId, payload);
				} else {
					const record = await prefItems.create({
						user: user.value.id,
						...payload,
					}) as any;
					_prefRecordId = record?.id || null;
				}
			} catch (err) {
				console.warn('[useAIPreferences] Could not save to Directus:', err);
			}
		}, 500);
	};

	const toggle = (moduleKey: string) => {
		const set = new Set(enabledModules.value);
		if (set.has(moduleKey)) {
			set.delete(moduleKey);
		} else {
			set.add(moduleKey);
		}
		enabledModules.value = set;
		saveLocal();
		saveToDirectus();
	};

	const isEnabled = (moduleKey: string) => {
		return enabledModules.value.has(moduleKey);
	};

	const enableAll = () => {
		enabledModules.value = new Set(AI_MODULES.map((m) => m.key));
		saveLocal();
		saveToDirectus();
	};

	const disableAll = () => {
		enabledModules.value = new Set();
		saveLocal();
		saveToDirectus();
	};

	// ── Personalizations ──
	const personalizationsEnabled = computed({
		get: () => _personalizationsEnabled.value,
		set: (val: boolean) => {
			_personalizationsEnabled.value = val;
			saveToDirectus();
		},
	});

	// ── Low Usage Mode ──
	const lowUsageMode = computed({
		get: () => _lowUsageMode.value,
		set: (val: boolean) => {
			_lowUsageMode.value = val;
			saveToDirectus();
		},
	});

	// ── Verbosity ──
	const verbosityKey = computed(() => {
		const userId = user.value?.id || 'anonymous';
		return `${VERBOSITY_KEY}-${userId}`;
	});

	const responseVerbosity = _verbosity;

	const loadVerbosity = () => {
		if (import.meta.server) return;
		try {
			const saved = localStorage.getItem(verbosityKey.value);
			if (saved === 'concise' || saved === 'regular') {
				responseVerbosity.value = saved;
			}
		} catch {}
	};

	const setVerbosity = (v: ResponseVerbosity) => {
		responseVerbosity.value = v;
		if (import.meta.server) return;
		try {
			localStorage.setItem(verbosityKey.value, v);
		} catch {}
	};

	// Load on init
	loadLocal();
	loadVerbosity();
	if (!_directusSynced) {
		syncFromDirectus();
	}

	// Reload when user changes
	watch(storageKey, () => {
		_directusSynced = false;
		_prefRecordId = null;
		loadLocal();
		loadVerbosity();
		syncFromDirectus();
	});

	return {
		modules: AI_MODULES,
		enabledModules: readonly(enabledModules),
		toggle,
		isEnabled,
		enableAll,
		disableAll,
		personalizationsEnabled,
		lowUsageMode,
		responseVerbosity: readonly(responseVerbosity),
		setVerbosity,
	};
};
