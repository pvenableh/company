// composables/useCRMIntelligence.ts
/**
 * CRM Intelligence Engine composable.
 *
 * Client-side interface for the AI CRM Intelligence endpoint.
 * Fetches cross-module analysis (contacts, cd_contacts, clients,
 * projects, tasks, tickets, invoices, deals) and returns
 * smart suggestions, actions, and growth ideas.
 */

import type {
	CRMAnalysisType,
	CRMOverviewAnalysis,
	CRMContactStrategyAnalysis,
	CRMGrowthPlanAnalysis,
	CRMPipelineReviewAnalysis,
} from '~/types/crm-intelligence';

type AnalysisResult =
	| CRMOverviewAnalysis
	| CRMContactStrategyAnalysis
	| CRMGrowthPlanAnalysis
	| CRMPipelineReviewAnalysis;

interface CachedResult {
	data: AnalysisResult;
	expiresAt: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const useCRMIntelligence = () => {
	const { selectedOrg } = useOrganization();

	const result = ref<AnalysisResult | null>(null);
	const isLoading = ref(false);
	const error = ref<string | null>(null);

	// Per-type cache so switching tabs doesn't re-fetch
	const cache = new Map<string, CachedResult>();

	const getCacheKey = (type: CRMAnalysisType, focus?: string) =>
		`${selectedOrg.value || ''}:${type}:${focus || ''}`;

	/**
	 * Run AI analysis on the CRM data.
	 *
	 * @param type - Analysis type: overview, contact-strategy, growth-plan, pipeline-review
	 * @param options - Optional focus area or target ID
	 * @param options.focus - Free-text focus area (e.g., "improve client retention")
	 * @param options.skipCache - Force fresh analysis
	 */
	const analyze = async (
		type: CRMAnalysisType,
		options?: { focus?: string; skipCache?: boolean },
	) => {
		const orgId = selectedOrg.value;
		if (!orgId) {
			error.value = 'No organization selected';
			return;
		}

		// Check cache
		const cacheKey = getCacheKey(type, options?.focus);
		if (!options?.skipCache) {
			const cached = cache.get(cacheKey);
			if (cached && Date.now() < cached.expiresAt) {
				result.value = cached.data;
				return;
			}
		}

		isLoading.value = true;
		error.value = null;

		try {
			const data = await $fetch<AnalysisResult>('/api/crm/ai-intelligence', {
				method: 'POST',
				body: {
					analysisType: type,
					organizationId: orgId,
					focus: options?.focus,
				},
			});

			result.value = data;
			cache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL });
		} catch (e: any) {
			const message = e?.data?.message || e?.message || 'Analysis failed';
			error.value = message;
			console.error('[CRM Intelligence]', message);
		} finally {
			isLoading.value = false;
		}
	};

	/** Typed getter for overview analysis */
	const overview = computed(() =>
		result.value && 'healthScore' in result.value
			? result.value as CRMOverviewAnalysis
			: null,
	);

	/** Typed getter for contact strategy analysis */
	const contactStrategy = computed(() =>
		result.value && 'segmentStrategies' in result.value
			? result.value as CRMContactStrategyAnalysis
			: null,
	);

	/** Typed getter for growth plan analysis */
	const growthPlan = computed(() =>
		result.value && 'targets' in result.value
			? result.value as CRMGrowthPlanAnalysis
			: null,
	);

	/** Typed getter for pipeline review analysis */
	const pipelineReview = computed(() =>
		result.value && 'stageAnalysis' in result.value
			? result.value as CRMPipelineReviewAnalysis
			: null,
	);

	/** Clear cache (e.g., when org changes) */
	const clearCache = () => {
		cache.clear();
		result.value = null;
	};

	// Invalidate cache when org changes
	watch(() => selectedOrg.value, () => {
		clearCache();
	});

	return {
		result: readonly(result),
		isLoading: readonly(isLoading),
		error: readonly(error),
		analyze,
		overview,
		contactStrategy,
		growthPlan,
		pipelineReview,
		clearCache,
	};
};
