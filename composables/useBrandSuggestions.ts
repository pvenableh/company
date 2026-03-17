// composables/useBrandSuggestions.ts
/**
 * Brand Suggestions composable.
 *
 * Provides AI-generated brand field suggestions for organizations and clients.
 * Returns multiple options per field that the user can select or edit.
 */

interface BrandSuggestion {
	field: string;
	options: string[];
}

interface BrandSuggestionsResponse {
	suggestions: BrandSuggestion[];
}

export const useBrandSuggestions = () => {
	const isGenerating = ref(false);
	const error = ref<string | null>(null);
	const suggestions = ref<BrandSuggestion[]>([]);

	const generate = async (opts: {
		entityType: 'organization' | 'client';
		entityId: string;
		organizationId: string;
		field: 'brand_direction' | 'goals' | 'target_audience' | 'location' | 'all';
		currentValue?: string;
	}) => {
		isGenerating.value = true;
		error.value = null;
		suggestions.value = [];

		try {
			const data = await $fetch<BrandSuggestionsResponse>('/api/ai/brand-suggestions', {
				method: 'POST',
				body: opts,
			});

			suggestions.value = data.suggestions || [];
			return data.suggestions;
		} catch (e: any) {
			const message = e?.data?.message || e?.message || 'Failed to generate suggestions';
			error.value = message;
			console.error('[Brand Suggestions]', message);
			return [];
		} finally {
			isGenerating.value = false;
		}
	};

	const getOptionsForField = (field: string): string[] => {
		const match = suggestions.value.find(s => s.field === field);
		return match?.options || [];
	};

	const clear = () => {
		suggestions.value = [];
		error.value = null;
	};

	return {
		isGenerating: readonly(isGenerating),
		error: readonly(error),
		suggestions: readonly(suggestions),
		generate,
		getOptionsForField,
		clear,
	};
};
