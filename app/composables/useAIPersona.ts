/**
 * Shared AI persona state — used by AIChat, AITray, and other Earnest AI components.
 * Persists to Directus ai_preferences with localStorage as offline cache.
 */

export interface AIPersona {
	value: string;
	label: string;
	icon: string;
	description: string;
	greeting: string;
	iconColor: string;
	bgClass: string;
	activeClass: string;
	iconBg: string;
	prompts: string[];
}

const personas: AIPersona[] = [
	{
		value: 'default',
		label: 'Earnest',
		icon: 'i-heroicons-sparkles',
		description: 'Your warm, encouraging ops partner — projects, leads, tickets, revenue.',
		greeting: 'Hey! Good to see you. What are we working on today?',
		iconColor: 'text-primary',
		bgClass: 'bg-primary/10 border-primary/20',
		activeClass: 'bg-primary/15 ring-2 ring-primary/40 shadow-md shadow-primary/10',
		iconBg: 'bg-primary/20',
		prompts: [
			'Summarize my overdue tasks',
			'Help draft an invoice',
			'Project status overview',
			'Suggest priorities for today',
		],
	},
	{
		value: 'director',
		label: 'The Director',
		icon: 'i-heroicons-clipboard-document-check',
		description: 'No fluff. Tickets, leads, and deadlines — handled.',
		greeting: 'Let\'s cut to it. What\'s the priority?',
		iconColor: 'text-indigo-500',
		bgClass: 'bg-indigo-500/10 border-indigo-500/20',
		activeClass: 'bg-indigo-500/15 ring-2 ring-indigo-500/40 shadow-md shadow-indigo-500/10',
		iconBg: 'bg-indigo-500/20',
		prompts: [
			'What should I tackle first today?',
			'Give me a game plan for this week',
			'Help me prioritize these tasks',
			'Break down this project into steps',
		],
	},
];

// Shared state across components
const selectedPersona = ref('default');
const PERSONA_STORAGE_KEY = 'ai-persona';
let personaLoaded = false;
let _prefRecordId: number | null = null;

export function useAIPersona() {
	const { user } = useDirectusAuth();

	const storageKey = computed(() => {
		const userId = user.value?.id || 'anonymous';
		return `${PERSONA_STORAGE_KEY}-${userId}`;
	});

	/** Load persona from server API, fallback to localStorage. */
	const load = async () => {
		if (import.meta.server) return;

		// Try localStorage first for instant display
		try {
			const saved = localStorage.getItem(storageKey.value);
			if (saved && personas.some((p) => p.value === saved)) {
				selectedPersona.value = saved;
			}
		} catch {}

		// Then sync from server (uses server token — no Directus permission issues)
		if (user.value?.id) {
			try {
				const res = await $fetch('/api/ai/preferences') as any;
				const record = res?.data;
				if (record) {
					_prefRecordId = record.id;
					if (record.persona && personas.some((p) => p.value === record.persona)) {
						selectedPersona.value = record.persona;
						try { localStorage.setItem(storageKey.value, record.persona); } catch {}
					}
				}
			} catch (err) {
				console.warn('[useAIPersona] Could not load from server:', err);
			}
		}

		personaLoaded = true;
	};

	/** Save persona via server API + localStorage. */
	const save = async () => {
		if (import.meta.server) return;

		// Always save to localStorage for offline cache
		try {
			localStorage.setItem(storageKey.value, selectedPersona.value);
		} catch {}

		// Save via server API (upserts — no permission issues)
		if (user.value?.id) {
			try {
				const res = await $fetch('/api/ai/preferences', {
					method: 'POST',
					body: { persona: selectedPersona.value },
				}) as any;
				if (res?.data?.id) {
					_prefRecordId = res.data.id;
				}
			} catch (err) {
				console.warn('[useAIPersona] Could not save to server:', err);
			}
		}
	};

	const activePersona = computed<AIPersona>(() =>
		personas.find((p) => p.value === selectedPersona.value) || personas[0],
	);

	const setPersona = (value: string) => {
		selectedPersona.value = value;
		save();
	};

	// Load when user becomes available or changes — always re-fetch
	if (import.meta.client) {
		watch(
			() => user.value?.id,
			(newId, oldId) => {
				if (!newId) {
					// Logged out — reset to default
					selectedPersona.value = 'default';
					personaLoaded = false;
					_prefRecordId = null;
					return;
				}
				if (newId !== oldId || !personaLoaded) {
					personaLoaded = false;
					_prefRecordId = null;
					load();
				}
			},
			{ immediate: true },
		);
	}

	return {
		personas,
		selectedPersona,
		activePersona,
		setPersona,
	};
}
