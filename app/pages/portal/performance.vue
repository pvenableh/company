<script setup lang="ts">
/**
 * /portal/performance — Performance hub.
 *
 * Cross-cutting view of how the client's marketing efforts are doing.
 * Combines social analytics (reach, engagement, followers) with the
 * marketing campaigns surface. The framing is "are my investments
 * paying off" rather than the staff-side "what's the agency doing" —
 * KPIs lead with outcomes.
 *
 * Sub-pages stay at /portal/social and /portal/marketing for deep
 * detail; the hub's two columns each link out to them.
 */
import { subDays, startOfDay, endOfDay, format } from 'date-fns';

definePageMeta({
	layout: 'client-portal',
	middleware: ['auth'],
});
useHead({ title: 'Performance | Client Portal' });

const { selectedOrg } = useOrganization();
const { membership, clientScope } = useOrgRole();
// Social channels panel depends on connected platform analytics — hidden
// until social publishing is enabled.
const { socialPublishingEnabled } = useSocialPublishing();

const campaignItems = usePortalItems('marketing_campaigns');

const loading = ref(true);
const recentCampaigns = ref<any[]>([]);

const end = new Date();
const dateRange = {
	start: format(startOfDay(subDays(end, 30)), "yyyy-MM-dd'T'HH:mm:ss'Z'"),
	end: format(endOfDay(end), "yyyy-MM-dd'T'HH:mm:ss'Z'"),
};

const { data: accountsData, pending: accountsLoading } = useLazyFetch('/api/social/accounts');
const accounts = computed(() => ((accountsData.value as any)?.data || []) as any[]);
const clientAccounts = computed(() => {
	if (!clientScope.value) return accounts.value;
	return accounts.value.filter((a: any) => a.client === clientScope.value || !a.client);
});

const { data: analyticsData, pending: analyticsLoading } = useLazyFetch('/api/social/analytics', {
	query: { start_date: dateRange.start, end_date: dateRange.end },
});

const overview = computed(() => {
	const d = (analyticsData.value as any)?.data?.overview || {};
	return {
		followers: d.total_followers ?? 0,
		reach: d.total_reach ?? 0,
		impressions: d.total_impressions ?? 0,
		engagementRate: d.avg_engagement_rate ?? 0,
	};
});

async function loadCampaigns() {
	if (!selectedOrg.value) return;
	try {
		recentCampaigns.value = await campaignItems.list({
			filter: { status: { _nin: ['archived'] } },
			fields: ['id', 'title', 'goal', 'status', 'type', 'start_date', 'end_date'],
			sort: ['-start_date'],
			limit: 5,
		});
	} catch (err) {
		console.error('Failed to load campaigns:', err);
	}
}

const campaignStatusConfig: Record<string, { label: string; classes: string; icon: string }> = {
	draft:        { label: 'Draft',       classes: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400', icon: 'lucide:file' },
	scheduled:    { label: 'Scheduled',   classes: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: 'lucide:clock' },
	partial_sent: { label: 'In Progress', classes: 'bg-warning/10 text-warning dark:bg-warning/30 dark:text-warning', icon: 'lucide:send' },
	completed:    { label: 'Completed',   classes: 'bg-success/10 text-success dark:bg-success/30 dark:text-success', icon: 'lucide:check-circle-2' },
	cancelled:    { label: 'Cancelled',   classes: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500', icon: 'lucide:x-circle' },
};

const clientName = computed(() => {
	if (!membership.value?.client) return null;
	const client = membership.value.client;
	return typeof client === 'object' ? client.name : null;
});

function formatNumber(n: number): string {
	if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
	if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
	return String(n);
}

function formatDate(iso: string | null | undefined): string {
	if (!iso) return '—';
	return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

onMounted(async () => {
	await loadCampaigns();
	loading.value = false;
});
watch(() => selectedOrg.value, async () => {
	loading.value = true;
	await loadCampaigns();
	loading.value = false;
});
</script>

<template>
	<div class="portal-page">
		<AppHeader>
			<template #default>Performance</template>
		</AppHeader>

		<LayoutPageContainer>
			<p v-if="clientName" class="text-sm text-muted-foreground mb-6 -mt-1">
				{{ clientName }} &mdash; the last 30 days of reach, engagement, and campaign activity.
			</p>

			<div v-if="loading && analyticsLoading" class="flex items-center justify-center py-24">
				<Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
			</div>

			<template v-else>
				<!-- KPI Strip -->
				<div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
					<div class="ios-card p-5">
						<div class="flex items-center gap-3">
							<div class="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
								<Icon name="lucide:users" class="w-5 h-5 text-primary" />
							</div>
							<div>
								<p class="text-2xl font-semibold tabular-nums">{{ formatNumber(overview.followers) }}</p>
								<p class="text-xs text-muted-foreground">Followers</p>
							</div>
						</div>
					</div>
					<div class="ios-card p-5">
						<div class="flex items-center gap-3">
							<div class="flex items-center justify-center w-10 h-10 rounded-full bg-blue-500/10">
								<Icon name="lucide:eye" class="w-5 h-5 text-blue-500" />
							</div>
							<div>
								<p class="text-2xl font-semibold tabular-nums">{{ formatNumber(overview.reach) }}</p>
								<p class="text-xs text-muted-foreground">Reach · 30d</p>
							</div>
						</div>
					</div>
					<div class="ios-card p-5">
						<div class="flex items-center gap-3">
							<div class="flex items-center justify-center w-10 h-10 rounded-full bg-warning/10">
								<Icon name="lucide:bar-chart" class="w-5 h-5 text-warning" />
							</div>
							<div>
								<p class="text-2xl font-semibold tabular-nums">{{ formatNumber(overview.impressions) }}</p>
								<p class="text-xs text-muted-foreground">Impressions · 30d</p>
							</div>
						</div>
					</div>
					<div class="ios-card p-5">
						<div class="flex items-center gap-3">
							<div class="flex items-center justify-center w-10 h-10 rounded-full bg-success/10">
								<Icon name="lucide:heart" class="w-5 h-5 text-success" />
							</div>
							<div>
								<p class="text-2xl font-semibold tabular-nums">{{ overview.engagementRate.toFixed(1) }}%</p>
								<p class="text-xs text-muted-foreground">Engagement Rate</p>
							</div>
						</div>
					</div>
				</div>

				<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
					<!-- Social channels -->
					<div v-if="socialPublishingEnabled" class="ios-card p-5">
						<div class="flex items-center justify-between mb-4">
							<h2 class="font-medium flex items-center gap-2">
								<Icon name="ph:chart-line-up-duotone" class="w-4 h-4 text-muted-foreground" />
								Social Channels
							</h2>
							<NuxtLink to="/portal/social" class="inline-flex items-center gap-0.5 text-[10px] font-medium uppercase tracking-wide text-primary hover:underline">
								Open analytics
								<Icon name="lucide:chevron-right" class="w-3 h-3" />
							</NuxtLink>
						</div>

						<div v-if="clientAccounts.length" class="space-y-2">
							<div
								v-for="acc in clientAccounts.slice(0, 6)"
								:key="acc.id"
								class="flex items-center justify-between p-3 rounded-xl bg-muted/40"
							>
								<div class="flex items-center gap-3 min-w-0">
									<Icon :name="`logos:${(acc.platform || '').toLowerCase()}-icon`" class="w-5 h-5 shrink-0" />
									<div class="min-w-0">
										<p class="text-sm font-medium truncate">{{ acc.display_name || acc.username || acc.platform }}</p>
										<p class="text-xs text-muted-foreground capitalize">{{ acc.platform }}</p>
									</div>
								</div>
								<span v-if="acc.metrics?.followers" class="text-sm tabular-nums font-medium shrink-0">
									{{ formatNumber(acc.metrics.followers) }}
								</span>
							</div>
						</div>
						<p v-else class="text-sm text-muted-foreground text-center py-6">
							No connected social accounts yet.
						</p>
					</div>

					<!-- Campaigns -->
					<div class="ios-card p-5">
						<div class="flex items-center justify-between mb-4">
							<h2 class="font-medium flex items-center gap-2">
								<Icon name="ph:waveform-duotone" class="w-4 h-4 text-muted-foreground" />
								Recent Campaigns
							</h2>
							<NuxtLink to="/portal/marketing" class="inline-flex items-center gap-0.5 text-[10px] font-medium uppercase tracking-wide text-primary hover:underline">
								Open campaigns
								<Icon name="lucide:chevron-right" class="w-3 h-3" />
							</NuxtLink>
						</div>

						<div v-if="recentCampaigns.length" class="space-y-2">
							<NuxtLink
								v-for="c in recentCampaigns"
								:key="c.id"
								to="/portal/marketing"
								class="flex flex-col gap-1 p-3 rounded-xl bg-muted/40 hover:bg-muted/70 transition-colors"
							>
								<div class="flex items-center justify-between">
									<span class="text-sm font-medium truncate">{{ c.title }}</span>
									<span
										class="text-xs px-2 py-0.5 rounded-full shrink-0"
										:class="campaignStatusConfig[c.status]?.classes ?? 'bg-gray-100 text-gray-500'"
									>
										{{ campaignStatusConfig[c.status]?.label ?? c.status }}
									</span>
								</div>
								<div class="flex items-center justify-between text-xs text-muted-foreground">
									<span>{{ formatDate(c.start_date) }} → {{ formatDate(c.end_date) }}</span>
									<span v-if="c.type" class="capitalize">{{ c.type }}</span>
								</div>
							</NuxtLink>
						</div>
						<p v-else class="text-sm text-muted-foreground text-center py-6">
							No active campaigns yet.
						</p>
					</div>
				</div>
			</template>
		</LayoutPageContainer>
	</div>
</template>
