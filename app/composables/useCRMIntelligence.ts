// composables/useCRMIntelligence.ts
/**
 * CRM Intelligence Engine composable.
 *
 * Two modes:
 * 1. Algorithmic snapshot (instant, no AI) — loads on mount via fetchSnapshot()
 * 2. AI deep analysis (on-demand) — only when user clicks "Run AI Analysis"
 *
 * AI results are cached in localStorage with a 30-minute TTL to avoid
 * repeated calls. The cache is cleared when the org changes.
 */

import type {
	CRMAnalysisType,
	CRMOverviewAnalysis,
	CRMContactStrategyAnalysis,
	CRMGrowthPlanAnalysis,
	CRMPipelineReviewAnalysis,
} from '~~/types/crm-intelligence';

type AnalysisResult =
	| CRMOverviewAnalysis
	| CRMContactStrategyAnalysis
	| CRMGrowthPlanAnalysis
	| CRMPipelineReviewAnalysis;

interface CachedResult {
	data: AnalysisResult;
	expiresAt: number;
}

// Cache TTL: 30 minutes for AI results (persisted in localStorage)
const AI_CACHE_TTL = 30 * 60 * 1000;

// Module-level state to avoid duplicated requests across component instances
const _snapshot = ref<any>(null);
const _snapshotLoading = ref(false);
const _aiResult = ref<AnalysisResult | null>(null);
const _aiLoading = ref(false);
const _aiError = ref<string | null>(null);
const _lastAIAnalysis = ref<string | null>(null);
let _currentOrgId: string | null = null;

export const useCRMIntelligence = () => {
	const { selectedOrg } = useOrganization();

	/**
	 * Fetch algorithmic snapshot (no AI, instant).
	 * Safe to call on page load — uses zero tokens.
	 */
	const fetchSnapshot = async () => {
		const orgId = selectedOrg.value;
		if (!orgId) return;

		_snapshotLoading.value = true;
		try {
			_snapshot.value = await $fetch('/api/crm/health-snapshot', {
				params: { organizationId: orgId },
			});
		} catch (e: any) {
			console.warn('[CRM Intelligence] Snapshot failed:', e?.message);
		} finally {
			_snapshotLoading.value = false;
		}
	};

	/**
	 * Run full AI analysis (on-demand only).
	 * Checks localStorage cache first; only calls API if stale/missing.
	 */
	const analyze = async (
		type: CRMAnalysisType,
		options?: { focus?: string; skipCache?: boolean },
	) => {
		const orgId = selectedOrg.value;
		if (!orgId) {
			_aiError.value = 'No organization selected';
			return;
		}

		const cacheKey = `crm-ai:${orgId}:${type}:${options?.focus || ''}`;

		// Check localStorage cache unless explicitly skipping
		if (!options?.skipCache && !import.meta.server) {
			try {
				const cached = localStorage.getItem(cacheKey);
				if (cached) {
					const parsed: CachedResult = JSON.parse(cached);
					if (Date.now() < parsed.expiresAt) {
						_aiResult.value = parsed.data;
						_lastAIAnalysis.value = new Date(parsed.expiresAt - AI_CACHE_TTL).toISOString();
						return;
					}
					localStorage.removeItem(cacheKey);
				}
			} catch {
				// Corrupted cache — proceed with fresh request
			}
		}

		_aiLoading.value = true;
		_aiError.value = null;

		try {
			const data = await $fetch<AnalysisResult>('/api/crm/ai-intelligence', {
				method: 'POST',
				body: {
					analysisType: type,
					organizationId: orgId,
					focus: options?.focus,
				},
			});

			_aiResult.value = data;
			_lastAIAnalysis.value = new Date().toISOString();

			// Persist to localStorage
			if (!import.meta.server) {
				try {
					localStorage.setItem(cacheKey, JSON.stringify({
						data,
						expiresAt: Date.now() + AI_CACHE_TTL,
					}));
				} catch {
					// localStorage full — continue without caching
				}
			}
		} catch (e: any) {
			const message = e?.data?.message || e?.message || 'Analysis failed';
			_aiError.value = message;
			console.error('[CRM Intelligence]', message);
		} finally {
			_aiLoading.value = false;
		}
	};

	/** Typed getter for overview analysis */
	const overview = computed(() =>
		_aiResult.value && 'healthScore' in _aiResult.value
			? _aiResult.value as CRMOverviewAnalysis
			: null,
	);

	/** Typed getter for contact strategy analysis */
	const contactStrategy = computed(() =>
		_aiResult.value && 'segmentStrategies' in _aiResult.value
			? _aiResult.value as CRMContactStrategyAnalysis
			: null,
	);

	/** Typed getter for growth plan analysis */
	const growthPlan = computed(() =>
		_aiResult.value && 'targets' in _aiResult.value
			? _aiResult.value as CRMGrowthPlanAnalysis
			: null,
	);

	/** Typed getter for pipeline review analysis */
	const pipelineReview = computed(() =>
		_aiResult.value && 'stageAnalysis' in _aiResult.value
			? _aiResult.value as CRMPipelineReviewAnalysis
			: null,
	);

	/** Clear all cached data */
	const clearCache = () => {
		_aiResult.value = null;
		_snapshot.value = null;
		_lastAIAnalysis.value = null;

		// Clear localStorage cache for this org
		if (!import.meta.server && _currentOrgId) {
			try {
				const prefix = `crm-ai:${_currentOrgId}:`;
				for (let i = localStorage.length - 1; i >= 0; i--) {
					const key = localStorage.key(i);
					if (key?.startsWith(prefix)) {
						localStorage.removeItem(key);
					}
				}
			} catch {
				// Silent
			}
		}
	};

	// Track org changes — clear cache and reload snapshot
	watch(() => selectedOrg.value, (newOrg) => {
		if (newOrg !== _currentOrgId) {
			clearCache();
			_currentOrgId = newOrg || null;
			if (newOrg) fetchSnapshot();
		}
	});

	// Initialize
	if (selectedOrg.value && selectedOrg.value !== _currentOrgId) {
		_currentOrgId = selectedOrg.value;
		fetchSnapshot();
	}

	return {
		// Algorithmic snapshot (instant, no AI)
		snapshot: readonly(_snapshot),
		snapshotLoading: readonly(_snapshotLoading),

		// AI analysis (on-demand)
		result: readonly(_aiResult),
		isLoading: readonly(_aiLoading),
		error: readonly(_aiError),
		lastAIAnalysis: readonly(_lastAIAnalysis),

		// Methods
		fetchSnapshot,
		analyze,
		overview,
		contactStrategy,
		growthPlan,
		pipelineReview,
		clearCache,
	};
};
