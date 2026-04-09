/**
 * AI Usage Tracking — monitors Anthropic API usage across the app.
 * Tracks message counts, estimated tokens, and provides usage summaries.
 * Stored per-user in localStorage for client-side visibility.
 */

export interface AIUsageEntry {
	timestamp: string;
	messageLength: number;
	responseLength: number;
	model?: string;
	persona?: string;
}

export interface AIUsageSummary {
	totalMessages: number;
	totalResponseChars: number;
	estimatedInputTokens: number;
	estimatedOutputTokens: number;
	todayMessages: number;
	weekMessages: number;
	monthMessages: number;
	averageResponseLength: number;
	lastUsed: string | null;
}

const STORAGE_KEY = 'ai-usage-log';
const MAX_ENTRIES = 500;

// Rough token estimation (1 token ~ 4 chars for English text)
const estimateTokens = (chars: number) => Math.ceil(chars / 4);

// Module-level shared state — avoids re-parsing localStorage on every composable call
const _entries = ref<AIUsageEntry[]>([]);
let _loadedKey: string | null = null;

export const useAIUsage = () => {
	const { user } = useDirectusAuth();

	const storageKey = computed(() => {
		const userId = user.value?.id || 'anonymous';
		return `${STORAGE_KEY}-${userId}`;
	});

	const load = () => {
		if (import.meta.server) return;
		if (_loadedKey === storageKey.value) return; // Already loaded for this user
		try {
			const saved = localStorage.getItem(storageKey.value);
			_entries.value = saved ? JSON.parse(saved) : [];
			_loadedKey = storageKey.value;
		} catch {
			_entries.value = [];
		}
	};

	const save = () => {
		if (import.meta.server) return;
		try {
			// Keep only the most recent entries
			const trimmed = _entries.value.slice(-MAX_ENTRIES);
			localStorage.setItem(storageKey.value, JSON.stringify(trimmed));
		} catch {
			// localStorage may be full — silently continue
		}
	};

	const trackUsage = (messageLength: number, responseLength: number, model?: string, persona?: string) => {
		_entries.value.push({
			timestamp: new Date().toISOString(),
			messageLength,
			responseLength,
			model,
			persona,
		});
		save();
	};

	const summary = computed<AIUsageSummary>(() => {
		const now = new Date();
		const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const weekStart = new Date(todayStart);
		weekStart.setDate(weekStart.getDate() - 7);
		const monthStart = new Date(todayStart);
		monthStart.setMonth(monthStart.getMonth() - 1);

		const totalMessages = _entries.value.length;
		const totalResponseChars = _entries.value.reduce((sum, e) => sum + e.responseLength, 0);
		const totalInputChars = _entries.value.reduce((sum, e) => sum + e.messageLength, 0);

		const todayMessages = _entries.value.filter(e => new Date(e.timestamp) >= todayStart).length;
		const weekMessages = _entries.value.filter(e => new Date(e.timestamp) >= weekStart).length;
		const monthMessages = _entries.value.filter(e => new Date(e.timestamp) >= monthStart).length;

		return {
			totalMessages,
			totalResponseChars,
			estimatedInputTokens: estimateTokens(totalInputChars),
			estimatedOutputTokens: estimateTokens(totalResponseChars),
			todayMessages,
			weekMessages,
			monthMessages,
			averageResponseLength: totalMessages > 0 ? Math.round(totalResponseChars / totalMessages) : 0,
			lastUsed: _entries.value.length > 0 ? _entries.value[_entries.value.length - 1].timestamp : null,
		};
	});

	const clearUsage = () => {
		_entries.value = [];
		_loadedKey = null;
		save();
	};

	// Load on init (skips if already loaded for this user)
	load();
	watch(storageKey, () => {
		_loadedKey = null;
		load();
	});

	return {
		entries: readonly(_entries),
		summary,
		trackUsage,
		clearUsage,
	};
};
