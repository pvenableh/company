<script setup lang="ts">
import { subDays, startOfDay, endOfDay, format } from 'date-fns';
import { getSocialPlatformIcon } from '~/utils/icons';

definePageMeta({
	layout: 'client-portal',
	middleware: ['auth'],
});
useHead({ title: 'Social Analytics | Client Portal' });

const { selectedOrg } = useOrganization();
const { clientScope } = useOrgRole();

// Date range preset — rendered through AppFloorStrip for visual parity
// with the staff apps' sub-nav.
type SocialPreset = '7d' | '30d' | '90d';
const selectedPreset = ref<SocialPreset>('30d');
const presets: Array<{ key: SocialPreset; label: string; icon: string }> = [
	{ key: '7d',  label: '7 days',  icon: 'lucide:calendar-clock' },
	{ key: '30d', label: '30 days', icon: 'lucide:calendar-range' },
	{ key: '90d', label: '90 days', icon: 'lucide:calendar' },
];

const dateRange = computed(() => {
	const end = new Date();
	const days = selectedPreset.value === '7d' ? 7 : selectedPreset.value === '90d' ? 90 : 30;
	return {
		start: format(startOfDay(subDays(end, days)), "yyyy-MM-dd'T'HH:mm:ss'Z'"),
		end: format(endOfDay(end), "yyyy-MM-dd'T'HH:mm:ss'Z'"),
	};
});

// Fetch accounts and analytics from the existing API endpoints
const { data: accountsData, pending: accountsLoading } = useLazyFetch('/api/social/accounts');
const accounts = computed(() => ((accountsData.value as any)?.data || []) as any[]);

// For a client-scoped portal, filter accounts by the client scope
const clientAccounts = computed(() => {
	if (!clientScope.value) return accounts.value;
	return accounts.value.filter((a: any) => a.client === clientScope.value || !a.client);
});

const analyticsQuery = computed(() => ({
	start_date: dateRange.value.start,
	end_date: dateRange.value.end,
}));

const { data: analyticsData, pending: analyticsLoading } = useLazyFetch('/api/social/analytics', {
	query: analyticsQuery,
	watch: [analyticsQuery],
});

const overview = computed(() => {
	const d = (analyticsData.value as any)?.data?.overview || {};
	return {
		followers:      d.total_followers ?? 0,
		reach:          d.total_reach ?? 0,
		impressions:    d.total_impressions ?? 0,
		engagementRate: d.avg_engagement_rate ?? 0,
		videoViews:     d.total_video_views ?? 0,
	};
});

const platformBreakdown = computed(() => {
	const accounts = (analyticsData.value as any)?.data?.accounts || [];
	return accounts.map((a: any) => ({
		platform:       a.platform,
		name:           a.account_name,
		handle:         a.account_handle,
		followers:      a.metrics?.followers_count ?? a.metrics?.follower_count ?? 0,
		reach:          a.metrics?.reach ?? 0,
		impressions:    a.metrics?.impressions ?? a.metrics?.page_impressions ?? 0,
		engagementRate: a.metrics?.engagement_rate ?? 0,
		posts:          a.metrics?.media_count ?? a.metrics?.video_count ?? 0,
	}));
});

const loading = computed(() => accountsLoading.value || analyticsLoading.value);
const hasData = computed(() => platformBreakdown.value.length > 0);

function fmt(n: number) {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return n.toLocaleString();
}

const PLATFORM_COLORS: Record<string, string> = {
	instagram: 'text-pink-500',
	facebook:  'text-blue-600',
	tiktok:    'text-gray-900 dark:text-white',
	linkedin:  'text-blue-500',
	threads:   'text-foreground',
};
</script>

<template>
	<div class="portal-page">
		<AppHeader title="Social Analytics" />

		<LayoutPageContainer>
			<p class="text-sm text-muted-foreground mb-4 -mt-1">Performance metrics across your connected channels.</p>

			<AppFloorStrip v-model="selectedPreset" :items="presets" aria-label="Date range" />

		<!-- Loading -->
		<div v-if="loading" class="flex items-center justify-center py-24">
			<Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
		</div>

		<!-- No accounts -->
		<div v-else-if="!clientAccounts.length" class="flex flex-col items-center justify-center py-24 gap-3">
			<Icon name="lucide:bar-chart-3" class="w-10 h-10 text-muted-foreground/40" />
			<p class="text-sm text-muted-foreground">No social accounts connected yet.</p>
		</div>

		<template v-else>
			<!-- Overview KPIs -->
			<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
				<div class="ios-card p-4">
					<p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Followers</p>
					<p class="text-xl font-semibold">{{ fmt(overview.followers) }}</p>
				</div>
				<div class="ios-card p-4">
					<p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Reach</p>
					<p class="text-xl font-semibold">{{ fmt(overview.reach) }}</p>
				</div>
				<div class="ios-card p-4">
					<p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Impressions</p>
					<p class="text-xl font-semibold">{{ fmt(overview.impressions) }}</p>
				</div>
				<div class="ios-card p-4">
					<p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Engagement</p>
					<p class="text-xl font-semibold">{{ overview.engagementRate.toFixed(1) }}%</p>
				</div>
				<div class="ios-card p-4 col-span-2 sm:col-span-1">
					<p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Video Views</p>
					<p class="text-xl font-semibold">{{ fmt(overview.videoViews) }}</p>
				</div>
			</div>

			<!-- Platform Breakdown -->
			<div v-if="hasData">
				<h2 class="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">By Platform</h2>
				<div class="space-y-3">
					<div
						v-for="account in platformBreakdown"
						:key="`${account.platform}-${account.name}`"
						class="ios-card p-4"
					>
						<!-- Platform header -->
						<div class="flex items-center gap-2 mb-3">
							<Icon
								:name="getSocialPlatformIcon(account.platform)"
								class="w-5 h-5"
								:class="PLATFORM_COLORS[account.platform] ?? 'text-muted-foreground'"
							/>
							<div>
								<p class="text-sm font-medium">{{ account.name || account.platform }}</p>
								<p v-if="account.handle" class="text-[10px] text-muted-foreground">@{{ account.handle }}</p>
							</div>
						</div>

						<!-- Metrics row -->
						<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
							<div>
								<p class="text-[10px] text-muted-foreground">Followers</p>
								<p class="text-sm font-semibold">{{ fmt(account.followers) }}</p>
							</div>
							<div>
								<p class="text-[10px] text-muted-foreground">Reach</p>
								<p class="text-sm font-semibold">{{ fmt(account.reach) }}</p>
							</div>
							<div>
								<p class="text-[10px] text-muted-foreground">Impressions</p>
								<p class="text-sm font-semibold">{{ fmt(account.impressions) }}</p>
							</div>
							<div>
								<p class="text-[10px] text-muted-foreground">Engagement</p>
								<p class="text-sm font-semibold">{{ account.engagementRate.toFixed(1) }}%</p>
							</div>
						</div>

						<!-- Engagement bar -->
						<div v-if="account.engagementRate > 0" class="mt-3">
							<div class="h-1.5 rounded-full bg-muted overflow-hidden">
								<div
									class="h-full rounded-full bg-primary transition-all"
									:style="{ width: `${Math.min(account.engagementRate * 10, 100)}%` }"
								/>
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- No snapshots yet -->
			<div v-else class="flex flex-col items-center justify-center py-16 gap-3">
				<Icon name="lucide:clock" class="w-8 h-8 text-muted-foreground/40" />
				<p class="text-sm text-muted-foreground">Metrics are captured daily — check back tomorrow for your first snapshot.</p>
			</div>
		</template>
		</LayoutPageContainer>
	</div>
</template>
