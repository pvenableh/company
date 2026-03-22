// composables/useAITokens.ts
// Token usage management — checks budgets, records usage, and enforces limits.

const _usageSummary = ref<{
	userTokensUsed: number;
	userBudget: number | null;
	orgTokensUsed: number;
	orgBalance: number | null;
	orgLimit: number | null;
	isLowUsage: boolean;
} | null>(null);

const _loaded = ref(false);

export const useAITokens = () => {
	const { user } = useDirectusAuth();
	const { selectedOrg } = useOrganization();
	const prefItems = useDirectusItems('ai_preferences');
	const orgItems = useDirectusItems('organizations');
	const usageItems = useDirectusItems('ai_usage_logs');

	/** Load usage summary for the current user + org. */
	const loadUsageSummary = async () => {
		if (import.meta.server || !user.value?.id) return;

		try {
			// Fetch user preferences
			const prefs = await prefItems.list({
				fields: ['low_usage_mode', 'token_budget_monthly'],
				filter: { user: { _eq: user.value.id } },
				limit: 1,
			}) as any[];

			const userPref = prefs?.[0];

			// Fetch org token info
			let orgData: any = null;
			if (selectedOrg.value) {
				orgData = await orgItems.get(selectedOrg.value, {
					fields: ['ai_token_balance', 'ai_token_limit_monthly', 'ai_tokens_used_this_period', 'ai_billing_period_start'],
				});
			}

			// Count user's tokens this month
			const monthStart = new Date();
			monthStart.setDate(1);
			monthStart.setHours(0, 0, 0, 0);

			const userUsage = await usageItems.list({
				fields: ['total_tokens'],
				filter: {
					_and: [
						{ user: { _eq: user.value.id } },
						{ date_created: { _gte: monthStart.toISOString() } },
					],
				},
				limit: 5000,
			}) as any[];

			const userTokensUsed = (userUsage || []).reduce((sum: number, log: any) => sum + (Number(log.total_tokens) || 0), 0);

			_usageSummary.value = {
				userTokensUsed,
				userBudget: userPref?.token_budget_monthly ?? null,
				orgTokensUsed: Number(orgData?.ai_tokens_used_this_period) || 0,
				orgBalance: orgData?.ai_token_balance ?? null,
				orgLimit: orgData?.ai_token_limit_monthly ?? null,
				isLowUsage: userPref?.low_usage_mode === true,
			};
			_loaded.value = true;
		} catch (err) {
			console.warn('[useAITokens] Failed to load usage summary:', err);
		}
	};

	/** Check if user/org can make an AI call. */
	const checkTokenBudget = computed(() => {
		const s = _usageSummary.value;
		if (!s) return { canUse: true, remaining: null, isLowUsage: false };

		// Check user personal budget
		if (s.userBudget !== null && s.userTokensUsed >= s.userBudget) {
			return { canUse: false, remaining: 0, isLowUsage: s.isLowUsage };
		}

		// Check org balance
		if (s.orgBalance !== null && s.orgBalance <= 0) {
			return { canUse: false, remaining: 0, isLowUsage: s.isLowUsage };
		}

		// Check org monthly limit
		if (s.orgLimit !== null && s.orgTokensUsed >= s.orgLimit) {
			return { canUse: false, remaining: 0, isLowUsage: s.isLowUsage };
		}

		const remaining = s.userBudget !== null
			? s.userBudget - s.userTokensUsed
			: s.orgBalance ?? null;

		return { canUse: true, remaining, isLowUsage: s.isLowUsage };
	});

	/** Whether the user is in low-usage mode. */
	const isLowUsage = computed(() => _usageSummary.value?.isLowUsage ?? false);

	/** Get the full usage summary. */
	const usageSummary = readonly(_usageSummary);

	// Load on init
	if (!_loaded.value) {
		loadUsageSummary();
	}

	// Reload when user/org changes; clear state on logout
	watch([() => user.value?.id, selectedOrg], ([newUser]) => {
		_loaded.value = false;
		if (!newUser) {
			_usageSummary.value = null;
			return;
		}
		loadUsageSummary();
	});

	return {
		usageSummary,
		checkTokenBudget,
		isLowUsage,
		refresh: loadUsageSummary,
	};
};
