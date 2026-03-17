<template>
	<div class="p-4 md:p-6 max-w-7xl mx-auto">
		<!-- Header -->
		<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
			<div>
				<h1 class="text-2xl font-bold text-foreground">Marketing Intelligence</h1>
				<p class="text-sm text-muted-foreground mt-1">
					AI-powered insights across your entire business
				</p>
			</div>
			<div class="flex items-center gap-3">
				<span v-if="lastAnalyzed" class="text-xs text-muted-foreground">
					Last analyzed {{ timeAgo(lastAnalyzed) }}
				</span>
				<Button
					:disabled="analyzing"
					class="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white border-0 shadow-lg shadow-blue-500/20"
					@click="runDashboardAnalysis"
				>
					<Icon v-if="!analyzing" name="lucide:sparkles" class="w-4 h-4 mr-1.5" />
					<Icon v-else name="lucide:loader-2" class="w-4 h-4 mr-1.5 animate-spin" />
					{{ analyzing ? 'Analyzing...' : 'Analyze' }}
				</Button>
			</div>
		</div>

		<!-- Loading state -->
		<div v-if="analyzing && !dashboard" class="space-y-6">
			<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
				<div class="md:col-span-1">
					<div class="rounded-xl border bg-card p-6">
						<div class="animate-pulse space-y-4">
							<div class="w-32 h-32 rounded-full bg-muted/40 mx-auto" />
							<div class="space-y-2">
								<div class="h-2 bg-muted/40 rounded w-full" />
								<div class="h-2 bg-muted/40 rounded w-3/4" />
								<div class="h-2 bg-muted/40 rounded w-5/6" />
								<div class="h-2 bg-muted/40 rounded w-2/3" />
							</div>
						</div>
					</div>
				</div>
				<div class="md:col-span-2">
					<div class="rounded-xl border bg-card p-6">
						<div class="animate-pulse space-y-3">
							<div class="h-4 bg-muted/40 rounded w-1/3" />
							<div class="grid grid-cols-2 gap-3">
								<div v-for="i in 4" :key="i" class="h-24 bg-muted/40 rounded-lg" />
							</div>
						</div>
					</div>
				</div>
			</div>
			<div class="text-center py-6">
				<div class="flex justify-center gap-1 mb-3">
					<div v-for="i in 3" :key="i" class="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce" :style="{ animationDelay: `${i * 150}ms` }" />
				</div>
				<p class="text-sm text-muted-foreground">Analyzing contacts, social media, email campaigns, clients, revenue, and more...</p>
			</div>
		</div>

		<!-- Empty state -->
		<div v-else-if="!dashboard && !error" class="flex flex-col items-center justify-center py-20">
			<div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/10 to-cyan-500/10 flex items-center justify-center mb-4">
				<Icon name="lucide:brain" class="w-8 h-8 text-blue-500" />
			</div>
			<h2 class="text-lg font-semibold text-foreground mb-1">Ready to analyze</h2>
			<p class="text-sm text-muted-foreground text-center max-w-md mb-6">
				Click Analyze to scan your contacts, social media, email campaigns, clients, and revenue data for AI-powered marketing insights.
			</p>
			<Button
				class="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white border-0 shadow-lg shadow-blue-500/20"
				@click="runDashboardAnalysis"
			>
				<Icon name="lucide:sparkles" class="w-4 h-4 mr-1.5" />
				Run First Analysis
			</Button>
		</div>

		<!-- Error state -->
		<div v-else-if="error" class="flex flex-col items-center justify-center py-16">
			<div class="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mb-4">
				<Icon name="lucide:alert-circle" class="w-6 h-6 text-destructive" />
			</div>
			<h3 class="font-semibold text-foreground mb-1">Analysis failed</h3>
			<p class="text-sm text-muted-foreground mb-4">{{ error }}</p>
			<Button variant="outline" @click="runDashboardAnalysis">
				<Icon name="lucide:refresh-cw" class="w-4 h-4 mr-1" />
				Try Again
			</Button>
		</div>

		<!-- Dashboard content -->
		<div v-else-if="dashboard" class="space-y-6">
			<!-- Save button -->
			<div class="flex justify-end">
				<Button
					variant="outline"
					size="sm"
					:disabled="savingDashboard"
					@click="saveDashboard"
				>
					<Icon :name="savedDashboard ? 'lucide:check' : savingDashboard ? 'lucide:loader-2' : 'lucide:save'" class="w-4 h-4 mr-1" :class="{ 'animate-spin': savingDashboard }" />
					{{ savedDashboard ? 'Saved' : savingDashboard ? 'Saving...' : 'Save Analysis' }}
				</Button>
			</div>
			<!-- Top row: Health Score + Velocity + Audience -->
			<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
				<!-- Health Score -->
				<div class="rounded-xl border bg-card p-6">
					<h3 class="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Marketing Health</h3>
					<MarketingHealthScore
						:score="dashboard.healthScore"
						:breakdown="dashboard.healthBreakdown"
					/>
				</div>

				<!-- Content Velocity -->
				<div class="rounded-xl border bg-card p-6">
					<h3 class="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Content Velocity</h3>
					<div class="space-y-6">
						<div>
							<div class="flex items-baseline gap-2">
								<span class="text-3xl font-bold text-foreground">{{ dashboard.contentVelocity.postsPerWeek }}</span>
								<span class="text-sm text-muted-foreground">posts / week</span>
								<Icon
									:name="getTrendIcon(dashboard.contentVelocity.trend)"
									class="w-4 h-4 ml-auto"
									:class="getTrendColor(dashboard.contentVelocity.trend)"
								/>
							</div>
						</div>
						<div>
							<div class="flex items-baseline gap-2">
								<span class="text-3xl font-bold text-foreground">{{ dashboard.contentVelocity.emailsPerMonth }}</span>
								<span class="text-sm text-muted-foreground">emails / month</span>
							</div>
						</div>
					</div>
				</div>

				<!-- Audience Overview -->
				<div class="rounded-xl border bg-card p-6">
					<h3 class="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Audience</h3>
					<div class="space-y-4">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<Icon name="lucide:users" class="w-4 h-4 text-muted-foreground" />
								<span class="text-sm text-muted-foreground">Contacts</span>
							</div>
							<span class="text-lg font-bold text-foreground">{{ formatNumber(dashboard.audienceGrowth.contacts) }}</span>
						</div>
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<Icon name="lucide:mail" class="w-4 h-4 text-muted-foreground" />
								<span class="text-sm text-muted-foreground">Subscribers</span>
							</div>
							<span class="text-lg font-bold text-foreground">{{ formatNumber(dashboard.audienceGrowth.subscribers) }}</span>
						</div>
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<Icon name="lucide:share-2" class="w-4 h-4 text-muted-foreground" />
								<span class="text-sm text-muted-foreground">Social Followers</span>
							</div>
							<span class="text-lg font-bold text-foreground">{{ formatNumber(dashboard.audienceGrowth.followers) }}</span>
						</div>
						<div class="pt-2 border-t flex items-center gap-2">
							<Icon
								:name="getTrendIcon(dashboard.audienceGrowth.trend)"
								class="w-4 h-4"
								:class="getTrendColor(dashboard.audienceGrowth.trend)"
							/>
							<span class="text-xs text-muted-foreground">
								{{ dashboard.audienceGrowth.trend === 'up' ? 'Growing' : dashboard.audienceGrowth.trend === 'down' ? 'Declining' : 'Stable' }}
							</span>
						</div>
					</div>
				</div>
			</div>

			<!-- Insights grid -->
			<div>
				<h3 class="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">AI Insights</h3>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
					<MarketingInsightCard
						v-for="(insight, i) in dashboard.insights"
						:key="i"
						:insight="insight"
					/>
				</div>
			</div>

			<!-- Recommendations -->
			<div v-if="dashboard.recommendations?.length">
				<h3 class="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Recommendations</h3>
				<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
					<div
						v-for="(rec, i) in dashboard.recommendations"
						:key="i"
						class="rounded-xl border p-4 hover:shadow-md transition-shadow"
					>
						<h4 class="text-sm font-semibold text-foreground mb-1">{{ rec.title }}</h4>
						<p class="text-xs text-muted-foreground leading-relaxed mb-3">{{ rec.description }}</p>
						<div class="flex items-center gap-3">
							<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground uppercase tracking-wider">{{ rec.channel }}</span>
							<span class="text-[10px] text-muted-foreground">
								Effort: <span class="font-medium" :class="effortColor(rec.effort)">{{ rec.effort }}</span>
							</span>
							<span class="text-[10px] text-muted-foreground">
								Impact: <span class="font-medium" :class="impactColor(rec.impact)">{{ rec.impact }}</span>
							</span>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Campaign Planner -->
		<div class="mt-10 pt-8 border-t">
			<div class="flex items-center gap-3 mb-4">
				<div class="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
					<Icon name="lucide:rocket" class="w-4.5 h-4.5 text-white" />
				</div>
				<div>
					<h2 class="text-lg font-semibold text-foreground">Campaign Planner</h2>
					<p class="text-xs text-muted-foreground">Describe a goal and AI builds a multi-channel plan</p>
				</div>
			</div>

			<div class="flex gap-3">
				<input
					v-model="campaignGoal"
					type="text"
					placeholder="e.g. Launch our new service next month, re-engage churned clients, build brand awareness..."
					class="flex-1 rounded-xl border bg-background px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all placeholder:text-muted-foreground/60"
					@keyup.enter="runCampaignAnalysis"
				/>
				<Button
					:disabled="!campaignGoal.trim() || generatingCampaign"
					class="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white border-0 shadow-lg shadow-purple-500/20 px-6"
					@click="runCampaignAnalysis"
				>
					<Icon v-if="!generatingCampaign" name="lucide:sparkles" class="w-4 h-4 mr-1" />
					<Icon v-else name="lucide:loader-2" class="w-4 h-4 mr-1 animate-spin" />
					{{ generatingCampaign ? 'Planning...' : 'Generate Plan' }}
				</Button>
			</div>

			<!-- Campaign loading -->
			<div v-if="generatingCampaign" class="py-12 text-center">
				<div class="flex justify-center gap-1 mb-3">
					<div v-for="i in 3" :key="i" class="w-1.5 h-1.5 rounded-full bg-purple-500 animate-bounce" :style="{ animationDelay: `${i * 150}ms` }" />
				</div>
				<p class="text-sm text-muted-foreground">Building your multi-channel campaign plan...</p>
			</div>

			<!-- Campaign error -->
			<div v-if="campaignError" class="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-center">
				<p class="text-sm text-destructive">{{ campaignError }}</p>
				<Button variant="outline" size="sm" class="mt-2" @click="runCampaignAnalysis">Try Again</Button>
			</div>

			<!-- Campaign result -->
			<div v-if="campaign && !generatingCampaign" class="mt-6">
				<div class="flex justify-end mb-3">
					<Button
						variant="outline"
						size="sm"
						:disabled="savingCampaign"
						@click="saveCampaign"
					>
						<Icon :name="savedCampaign ? 'lucide:check' : savingCampaign ? 'lucide:loader-2' : 'lucide:save'" class="w-4 h-4 mr-1" :class="{ 'animate-spin': savingCampaign }" />
						{{ savedCampaign ? 'Saved' : savingCampaign ? 'Saving...' : 'Save Plan' }}
					</Button>
				</div>
				<MarketingCampaignTimeline
					:campaign="campaign"
					@create="handleCampaignCreate"
				/>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { Button } from '~/components/ui/button';
import type { DashboardAnalysis, CampaignAnalysis, CampaignActivity } from '~/types/marketing';

definePageMeta({
	middleware: ['auth'],
});

useHead({
	title: 'Marketing Intelligence | Earnest',
});

const { selectedOrg } = useOrganization();

const analyzing = ref(false);
const error = ref('');
const dashboard = ref<DashboardAnalysis | null>(null);
const lastAnalyzed = ref<Date | null>(null);

const campaignGoal = ref('');
const generatingCampaign = ref(false);
const campaignError = ref('');
const campaign = ref<CampaignAnalysis | null>(null);

const savingDashboard = ref(false);
const savedDashboard = ref(false);
const savingCampaign = ref(false);
const savedCampaign = ref(false);

async function runDashboardAnalysis() {
	if (!selectedOrg.value) {
		error.value = 'Please select an organization first.';
		return;
	}

	analyzing.value = true;
	error.value = '';

	try {
		const data = await $fetch('/api/marketing/ai-analyze', {
			method: 'POST',
			body: {
				analysisType: 'dashboard',
				organizationId: selectedOrg.value,
			},
		});

		dashboard.value = data as DashboardAnalysis;
		lastAnalyzed.value = new Date();
	} catch (err: any) {
		error.value = err?.data?.message || err?.message || 'Something went wrong. Please try again.';
	} finally {
		analyzing.value = false;
	}
}

async function runCampaignAnalysis() {
	if (!selectedOrg.value || !campaignGoal.value.trim()) return;

	generatingCampaign.value = true;
	campaignError.value = '';
	campaign.value = null;

	try {
		const data = await $fetch('/api/marketing/ai-analyze', {
			method: 'POST',
			body: {
				analysisType: 'campaign',
				organizationId: selectedOrg.value,
				goal: campaignGoal.value,
			},
		});

		campaign.value = data as CampaignAnalysis;
	} catch (err: any) {
		campaignError.value = err?.data?.message || err?.message || 'Failed to generate campaign plan.';
	} finally {
		generatingCampaign.value = false;
	}
}

async function saveDashboard() {
	if (!dashboard.value) return;
	savingDashboard.value = true;
	try {
		await $fetch('/api/marketing/save-plan', {
			method: 'POST',
			body: {
				type: 'dashboard',
				title: `Marketing Analysis — ${new Date().toLocaleDateString()}`,
				data: dashboard.value,
			},
		});
		savedDashboard.value = true;
		setTimeout(() => { savedDashboard.value = false; }, 3000);
	} catch (err: any) {
		console.error('Failed to save analysis:', err);
	} finally {
		savingDashboard.value = false;
	}
}

async function saveCampaign() {
	if (!campaign.value) return;
	savingCampaign.value = true;
	try {
		await $fetch('/api/marketing/save-plan', {
			method: 'POST',
			body: {
				type: 'campaign',
				title: (campaign.value as any).campaignName || 'Campaign Plan',
				data: campaign.value,
				goal: campaignGoal.value,
			},
		});
		savedCampaign.value = true;
		setTimeout(() => { savedCampaign.value = false; }, 3000);
	} catch (err: any) {
		console.error('Failed to save campaign plan:', err);
	} finally {
		savingCampaign.value = false;
	}
}

function handleCampaignCreate(activity: CampaignActivity) {
	if (activity.channel === 'social') {
		navigateTo('/social/compose');
	} else if (activity.channel === 'email') {
		navigateTo('/email/templates');
	}
}

function timeAgo(date: Date): string {
	const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
	if (seconds < 60) return 'just now';
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	return `${hours}h ago`;
}

function formatNumber(n: number): string {
	if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
	if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
	return String(n);
}

function getTrendIcon(trend: string): string {
	if (trend === 'up') return 'lucide:trending-up';
	if (trend === 'down') return 'lucide:trending-down';
	return 'lucide:minus';
}

function getTrendColor(trend: string): string {
	if (trend === 'up') return 'text-green-500';
	if (trend === 'down') return 'text-red-500';
	return 'text-muted-foreground';
}

function effortColor(level: string): string {
	if (level === 'low') return 'text-green-600 dark:text-green-400';
	if (level === 'high') return 'text-red-600 dark:text-red-400';
	return 'text-amber-600 dark:text-amber-400';
}

function impactColor(level: string): string {
	if (level === 'high') return 'text-green-600 dark:text-green-400';
	if (level === 'low') return 'text-red-600 dark:text-red-400';
	return 'text-amber-600 dark:text-amber-400';
}
</script>
