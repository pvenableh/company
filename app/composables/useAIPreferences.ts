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
		key: 'proposals',
		label: 'Proposals',
		icon: 'i-heroicons-document-text',
		description: 'Cold proposals that need a follow-up nudge',
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
		key: 'comments',
		label: 'Client Replies',
		icon: 'i-heroicons-chat-bubble-left-ellipsis',
		description: 'Client comments on tickets & projects awaiting a reply',
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

// ── Digest Cadence (per-PROJECT AI briefs) ──
export type DigestCadence = 'daily' | 'weekly' | 'off';

import type { DigestCadence as MotivationalDigestCadence } from '~~/shared/digest';
import { DEFAULT_DIGEST_CADENCE, DEFAULT_DIGEST_HOUR, DEFAULT_DIGEST_SECTIONS } from '~~/shared/digest';

const STORAGE_KEY = 'ai-tray-preferences';
const VERBOSITY_KEY = 'ai-response-verbosity';

// Shared reactive state
const _verbosity = ref<ResponseVerbosity>('regular');
const _personalizationsEnabled = ref(true);
const _lowUsageMode = ref(false);
const _digestCadence = ref<DigestCadence>('daily');
// Motivational (user-level roll-up) digest — separate from the project briefs.
const _mdEnabled = ref(false);
const _mdCadence = ref<MotivationalDigestCadence>(DEFAULT_DIGEST_CADENCE);
const _mdHour = ref<number>(DEFAULT_DIGEST_HOUR);
const _mdSections = ref<string[]>([...DEFAULT_DIGEST_SECTIONS]);
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
				fields: ['id', 'enabled_modules', 'personalizations_enabled', 'low_usage_mode', 'digest_cadence', 'motivational_digest_enabled', 'motivational_digest_cadence', 'motivational_digest_hour', 'motivational_digest_sections'],
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

				if (records[0].digest_cadence === 'daily' || records[0].digest_cadence === 'weekly' || records[0].digest_cadence === 'off') {
					_digestCadence.value = records[0].digest_cadence;
				}

				// Motivational digest (fields may not exist yet on older installs).
				if (typeof records[0].motivational_digest_enabled === 'boolean') _mdEnabled.value = records[0].motivational_digest_enabled;
				if (['daily', 'weekdays', 'weekly', 'off'].includes(records[0].motivational_digest_cadence)) _mdCadence.value = records[0].motivational_digest_cadence;
				if (Number.isFinite(records[0].motivational_digest_hour)) _mdHour.value = Number(records[0].motivational_digest_hour);
				if (Array.isArray(records[0].motivational_digest_sections)) _mdSections.value = records[0].motivational_digest_sections;
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
					digest_cadence: _digestCadence.value,
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

	// Motivational digest saves on its OWN patch, isolated in try/catch, so a
	// missing column (before scripts/setup-motivational-digest.ts runs) can never
	// take the module-toggle save down with it.
	let _mdSaveTimeout: ReturnType<typeof setTimeout> | null = null;
	const saveDigestToDirectus = () => {
		if (_mdSaveTimeout) clearTimeout(_mdSaveTimeout);
		_mdSaveTimeout = setTimeout(async () => {
			if (!user.value?.id) return;
			const payload = {
				motivational_digest_enabled: _mdEnabled.value,
				motivational_digest_cadence: _mdCadence.value,
				motivational_digest_hour: _mdHour.value,
				motivational_digest_sections: _mdSections.value,
			};
			try {
				if (_prefRecordId) {
					await prefItems.update(_prefRecordId, payload);
				} else {
					const record = await prefItems.create({ user: user.value.id, ...payload }) as any;
					_prefRecordId = record?.id || null;
				}
			} catch (err) {
				console.warn('[useAIPreferences] Could not save digest prefs (fields may be unprovisioned):', err);
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

	// ── Digest Cadence ──
	const digestCadence = computed({
		get: () => _digestCadence.value,
		set: (val: DigestCadence) => {
			_digestCadence.value = val;
			saveToDirectus();
		},
	});

	// ── Motivational digest ──
	const motivationalDigestEnabled = computed({
		get: () => _mdEnabled.value,
		set: (v: boolean) => { _mdEnabled.value = v; saveDigestToDirectus(); },
	});
	const motivationalDigestCadence = computed({
		get: () => _mdCadence.value,
		set: (v: MotivationalDigestCadence) => { _mdCadence.value = v; saveDigestToDirectus(); },
	});
	const motivationalDigestHour = computed({
		get: () => _mdHour.value,
		set: (v: number) => { _mdHour.value = Math.max(0, Math.min(23, Number(v) || 0)); saveDigestToDirectus(); },
	});
	const motivationalDigestSections = computed(() => _mdSections.value);
	const toggleDigestSection = (key: string) => {
		const set = new Set(_mdSections.value);
		if (set.has(key)) set.delete(key); else set.add(key);
		_mdSections.value = [...set];
		saveDigestToDirectus();
	};
	const isDigestSectionOn = (key: string) => _mdSections.value.includes(key);

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

	// Reload when user changes; clear state on logout
	watch(storageKey, () => {
		// Clear pending save to avoid writing to wrong user
		if (_saveTimeout) { clearTimeout(_saveTimeout); _saveTimeout = null; }
		_directusSynced = false;
		_prefRecordId = null;
		if (!user.value?.id) {
			// Reset to defaults on logout
			enabledModules.value = new Set(AI_MODULES.map((m) => m.key));
			_personalizationsEnabled.value = true;
			_lowUsageMode.value = false;
			_digestCadence.value = 'daily';
			_mdEnabled.value = false;
			_mdCadence.value = DEFAULT_DIGEST_CADENCE;
			_mdHour.value = DEFAULT_DIGEST_HOUR;
			_mdSections.value = [...DEFAULT_DIGEST_SECTIONS];
			_verbosity.value = 'regular';
			return;
		}
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
		digestCadence,
		motivationalDigestEnabled,
		motivationalDigestCadence,
		motivationalDigestHour,
		motivationalDigestSections,
		toggleDigestSection,
		isDigestSectionOn,
		responseVerbosity: readonly(responseVerbosity),
		setVerbosity,
	};
};
