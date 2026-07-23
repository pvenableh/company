import type { MarketingRecommendation } from '~~/shared/marketing-persistence';

interface HealthMetrics {
	totalContacts: number;
	subscribedContacts: number;
	contactGrowth: number;
	subscriptionRate: number;
	socialPostsLast30Days: number;
	connectedPlatforms: number;
	failedPosts: number;
	totalCampaigns: number;
	recentCampaigns: number;
	totalSubscribers: number;
	mailingLists: number;
}

interface SocialAccount {
	id: string;
	platform: string;
	account_name: string;
}

interface SocialOverview {
	total_accounts: number;
	total_followers: number;
	total_reach: number;
	total_impressions: number;
	avg_engagement_rate: number;
}

/**
 * Shared marketing-pulse state for the home dashboard. Wires the marketing
 * recommendations feed, the marketing health snapshot (email/social/contact
 * counts), and aggregated social analytics into one source so the compact
 * MarketingActionsWidget and the full-width MarketingPulseWidget can both
 * read the same data without re-fetching.
 *
 * `hasRichData` controls which widget renders: false → compact, true → rich.
 */
// Module-level inflight guard so the 3 widgets that call load() on the same org
// collapse into ONE request (the loadedFor guard only helps AFTER a fetch
// completes; concurrent callers all slipped past it). Mirrors the
// active-clients / channel-unread guards.
let _marketingInflight: Promise<void> | null = null;
let _marketingInflightOrg: string | null = null;

export const useMarketingPulse = () => {
	const { selectedOrg } = useOrganization();
	const { socialPublishingEnabled } = useSocialPublishing();

	const recommendations = useState<MarketingRecommendation[]>('marketingPulse:recs', () => []);
	const metrics = useState<HealthMetrics | null>('marketingPulse:metrics', () => null);
	const socialOverview = useState<SocialOverview | null>('marketingPulse:socialOverview', () => null);
	const socialAccounts = useState<SocialAccount[]>('marketingPulse:socialAccounts', () => []);
	const loading = useState<boolean>('marketingPulse:loading', () => false);
	const loadedFor = useState<string | null>('marketingPulse:loadedFor', () => null);

	const pendingCount = computed(() =>
		recommendations.value.filter((r) => r.status === 'pending' || r.status === 'drafted').length,
	);

	const topRec = computed<MarketingRecommendation | null>(() => {
		const active = recommendations.value
			.filter((r) => r.status === 'pending' || r.status === 'drafted')
			.slice()
			.sort((a, b) => (b.ranker_output?.urgency ?? 0) - (a.ranker_output?.urgency ?? 0));
		return active[0] ?? null;
	});

	const hasSocial = computed(() => (metrics.value?.connectedPlatforms ?? 0) > 0);
	const hasEmail = computed(
		() =>
			(metrics.value?.totalCampaigns ?? 0) > 0 ||
			(metrics.value?.totalSubscribers ?? 0) > 0,
	);
	const hasRichData = computed(() => hasSocial.value || hasEmail.value);

	async function load(force = false) {
		const orgId = selectedOrg.value;
		if (!orgId) {
			recommendations.value = [];
			metrics.value = null;
			socialOverview.value = null;
			socialAccounts.value = [];
			loadedFor.value = null;
			return;
		}
		// Allow refetch when SSR failed (loadedFor set but metrics still null)
		if (!force && loadedFor.value === orgId && metrics.value !== null) return;
		// Coalesce concurrent callers for the same org into one request.
		if (!force && _marketingInflight && _marketingInflightOrg === orgId) return _marketingInflight;
		_marketingInflightOrg = orgId;
		_marketingInflight = (async () => {
		loading.value = true;
		const fetchFn = useRequestFetch();
		try {
			// Social is hidden until the Meta/LinkedIn apps are approved — skip the
			// social fetches entirely so they don't fire (and 500) on dashboard load.
			const socialOn = socialPublishingEnabled.value;
			const [recsRes, healthRes, analyticsRes, accountsRes] = await Promise.allSettled([
				fetchFn<{ recommendations: MarketingRecommendation[] }>(
					'/api/marketing/recommendations',
					{ query: { organizationId: orgId } },
				),
				fetchFn<{ metrics: HealthMetrics }>('/api/marketing/health-snapshot', {
					query: { organizationId: orgId },
				}),
				socialOn
					? fetchFn<{ data: { overview: SocialOverview } }>('/api/social/analytics').catch(
							() => null,
						)
					: Promise.resolve(null),
				socialOn
					? fetchFn<{ data: SocialAccount[] }>('/api/social/accounts').catch(() => null)
					: Promise.resolve(null),
			]);

			recommendations.value =
				recsRes.status === 'fulfilled' ? recsRes.value.recommendations || [] : [];
			metrics.value = healthRes.status === 'fulfilled' ? healthRes.value.metrics : null;
			socialOverview.value =
				analyticsRes.status === 'fulfilled' && analyticsRes.value?.data?.overview
					? analyticsRes.value.data.overview
					: null;
			socialAccounts.value =
				accountsRes.status === 'fulfilled' && Array.isArray(accountsRes.value?.data)
					? accountsRes.value.data.map((a: any) => ({
							id: a.id,
							platform: a.platform,
							account_name: a.account_name,
						}))
					: [];

			loadedFor.value = orgId;
		} finally {
			loading.value = false;
			_marketingInflight = null;
		}
		})();
		return _marketingInflight;
	}

	return {
		recommendations,
		metrics,
		socialOverview,
		socialAccounts,
		loading,
		pendingCount,
		topRec,
		hasSocial,
		hasEmail,
		hasRichData,
		load,
	};
};
