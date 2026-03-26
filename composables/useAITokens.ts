// composables/useAITokens.ts
// Token usage management — checks budgets, records usage, and enforces limits.
//
// Fail-safe design:
// - Always sets _usageSummary (even on partial fetch failure) so the TokenMeter renders
// - Retries when selectedOrg changes (not gated by _loaded)
// - Catches individual fetch failures independently so one bad query doesn't block all data
// - Logs warnings for debugging but never leaves _usageSummary as null after an attempt

const _usageSummary = ref<{
	userTokensUsed: number;
	userBudget: number | null;
	orgTokensUsed: number;
	orgBalance: number | null;
	orgLimit: number | null;
	isLowUsage: boolean;
	aiEnabled: boolean;
} | null>(null);

const _loading = ref(false);

export const useAITokens = () => {
	const { user } = useDirectusAuth();
	const { selectedOrg } = useOrganization();
	const orgItems = useDirectusItems('organizations');
	const usageItems = useDirectusItems('ai_usage_logs');

	/** Load usage summary for the current user + org. */
	const loadUsageSummary = async () => {
		if (import.meta.server || !user.value?.id) return;
		if (_loading.value) return; // Prevent concurrent fetches

		_loading.value = true;

		// Defaults — always produce a valid summary even if every fetch fails
		let userTokensUsed = 0;
		let userBudget: number | null = null;
		let orgTokensUsed = 0;
		let orgBalance: number | null = null;
		let orgLimit: number | null = null;
		let isLowUsage = false;
		let aiEnabled = true;

		// 1. Fetch user preferences via server API (bypasses Directus permissions)
		try {
			const res = await $fetch('/api/ai/preferences') as any;
			const userPref = res?.data;
			if (userPref) {
				userBudget = userPref.token_budget_monthly ?? null;
				isLowUsage = userPref.low_usage_mode === true;
				aiEnabled = userPref.ai_enabled !== false;
			}
		} catch (err) {
			console.warn('[useAITokens] Failed to load user preferences:', err);
		}

		// 2. Fetch org token info (independent — failure doesn't block other data)
		if (selectedOrg.value) {
			try {
				const orgData = await orgItems.get(selectedOrg.value, {
					fields: ['ai_token_balance', 'ai_token_limit_monthly', 'ai_tokens_used_this_period', 'ai_billing_period_start'],
				}) as any;

				if (orgData) {
					orgTokensUsed = Number(orgData.ai_tokens_used_this_period) || 0;
					orgBalance = orgData.ai_token_balance ?? null;
					orgLimit = orgData.ai_token_limit_monthly ?? null;
				}
			} catch (err) {
				console.warn('[useAITokens] Failed to load org token info:', err);
			}
		}

		// 3. Count user's tokens this month (independent — failure doesn't block other data)
		try {
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

			userTokensUsed = (userUsage || []).reduce((sum: number, log: any) => sum + (Number(log.total_tokens) || 0), 0);
		} catch (err) {
			console.warn('[useAITokens] Failed to load user usage logs:', err);
		}

		// Always set the summary — even with partial/default data
		_usageSummary.value = {
			userTokensUsed,
			userBudget,
			orgTokensUsed,
			orgBalance,
			orgLimit,
			isLowUsage,
			aiEnabled,
		};

		_loading.value = false;
	};

	/** Check if user/org can make an AI call. */
	const checkTokenBudget = computed(() => {
		const s = _usageSummary.value;
		if (!s) return { canUse: true, remaining: null, isLowUsage: false, reason: null };

		// Check if AI is disabled by admin
		if (!s.aiEnabled) {
			return { canUse: false, remaining: 0, isLowUsage: s.isLowUsage, reason: 'AI access has been disabled by your organization admin.' };
		}

		// Check user personal budget
		if (s.userBudget !== null && s.userTokensUsed >= s.userBudget) {
			return { canUse: false, remaining: 0, isLowUsage: s.isLowUsage, reason: 'Your personal AI token budget has been exhausted for this month.' };
		}

		// Check org balance
		if (s.orgBalance !== null && s.orgBalance <= 0) {
			return { canUse: false, remaining: 0, isLowUsage: s.isLowUsage, reason: 'Organization AI token balance is depleted.' };
		}

		// Check org monthly limit
		if (s.orgLimit !== null && s.orgTokensUsed >= s.orgLimit) {
			return { canUse: false, remaining: 0, isLowUsage: s.isLowUsage, reason: 'Organization monthly AI token limit has been reached.' };
		}

		const remaining = s.userBudget !== null
			? s.userBudget - s.userTokensUsed
			: s.orgBalance ?? null;

		return { canUse: true, remaining, isLowUsage: s.isLowUsage, reason: null };
	});

	/** Whether the user is in low-usage mode. */
	const isLowUsage = computed(() => _usageSummary.value?.isLowUsage ?? false);

	/** Get the full usage summary. */
	const usageSummary = readonly(_usageSummary);

	// Reload when user or org changes — always re-fetch (no _loaded gate)
	if (import.meta.client) {
		watch(
			[() => user.value?.id, () => selectedOrg.value],
			([newUser, newOrg], [oldUser, oldOrg]) => {
				if (!newUser) {
					_usageSummary.value = null;
					return;
				}
				// Re-fetch when user or org actually changed, or on first load
				if (newUser !== oldUser || newOrg !== oldOrg || !_usageSummary.value) {
					loadUsageSummary();
				}
			},
			{ immediate: true },
		);
	}

	return {
		usageSummary,
		checkTokenBudget,
		isLowUsage,
		refresh: loadUsageSummary,
	};
};
