<template>
	<div class="p-4 md:p-6 max-w-7xl mx-auto">
		<!-- Header -->
		<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
			<div>
				<h1 class="text-2xl font-semibold text-foreground">Marketing Intelligence</h1>
				<p class="text-xs text-muted-foreground mt-1">
					Create marketing for <span class="font-medium text-foreground">{{ analysisScope }}</span>
				</p>
				<!-- Scope indicator -->
				<div class="flex items-center gap-3 mt-2">
					<span v-if="currentClient" class="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
						<Icon name="lucide:user" class="w-3 h-3" />
						Client: {{ currentClient.name }}
					</span>
					<span v-else class="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
						<Icon name="lucide:building-2" class="w-3 h-3" />
						{{ currentOrg?.name || 'Organization' }}
					</span>
					<label v-if="!currentClient" class="inline-flex items-center gap-1.5 text-[10px] cursor-pointer select-none">
						<input
							type="checkbox"
							v-model="includeClients"
							class="rounded border-border text-primary focus:ring-primary/50 w-3.5 h-3.5"
						/>
						<span class="text-muted-foreground">Include all client data</span>
					</label>
				</div>
			</div>
			<div class="flex flex-col items-end gap-2">
				<div class="flex items-center gap-2">
					<button
						class="rounded-full px-3 py-1.5 text-[11px] font-medium border border-border bg-card hover:bg-muted ios-press inline-flex items-center gap-1.5 transition-colors"
						@click="sidebarOpen = true"
					>
						<Icon name="lucide:sparkles" class="w-3 h-3" />
						<span class="hidden sm:inline">Ask Earnest</span>
					</button>
					<span v-if="lastAnalyzed" class="text-[10px] text-muted-foreground">
						{{ timeAgo(lastAnalyzed) }}
					</span>
					<button
						class="rounded-full px-4 py-2 text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 ios-press shadow-sm transition-colors inline-flex items-center gap-1.5 disabled:opacity-40"
						:disabled="analyzing"
						@click="runDashboardAnalysis"
					>
						<Icon v-if="!analyzing" name="lucide:sparkles" class="w-3.5 h-3.5" />
						<Icon v-else name="lucide:loader-2" class="w-3.5 h-3.5 animate-spin" />
						{{ analyzing ? 'Analyzing...' : `Analyze ${currentClient ? currentClient.name : ''}` }}
					</button>
				</div>
				<p v-if="currentClient" class="text-[10px] text-muted-foreground">
					Select "All Clients" in the header for org-wide analysis
				</p>
			</div>
		</div>

		<!-- Loading state -->
		<div v-if="analyzing && !dashboard" class="space-y-6">
			<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
				<div class="ios-card p-5">
					<div class="animate-pulse space-y-4">
						<div class="w-32 h-32 rounded-full bg-muted/40 mx-auto" />
						<div class="space-y-2">
							<div class="h-2 bg-muted/40 rounded w-full" />
							<div class="h-2 bg-muted/40 rounded w-3/4" />
							<div class="h-2 bg-muted/40 rounded w-5/6" />
						</div>
					</div>
				</div>
				<div class="md:col-span-2 ios-card p-5">
					<div class="animate-pulse space-y-3">
						<div class="h-4 bg-muted/40 rounded w-1/3" />
						<div class="grid grid-cols-2 gap-3">
							<div v-for="i in 4" :key="i" class="h-20 bg-muted/40 rounded-xl" />
						</div>
					</div>
				</div>
			</div>
			<div class="text-center py-6">
				<div class="flex justify-center gap-1 mb-3">
					<div v-for="i in 3" :key="i" class="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" :style="{ animationDelay: `${i * 150}ms` }" />
				</div>
				<p class="text-xs text-muted-foreground">Analyzing contacts, social media, email campaigns, and more...</p>
			</div>
		</div>

		<!-- Empty state -->
		<div v-else-if="!dashboard && !error" class="flex flex-col items-center justify-center py-20">
			<div class="w-14 h-14 rounded-2xl bg-primary/5 flex items-center justify-center mb-4">
				<Icon name="lucide:brain" class="w-7 h-7 text-primary/40" />
			</div>
			<h2 class="text-lg font-medium text-foreground mb-1">Ready to analyze {{ analysisScope }}</h2>
			<p class="text-xs text-muted-foreground text-center max-w-md mb-6">
				{{ currentClient
					? `Generate AI-powered marketing insights tailored to ${currentClient.name}'s brand, goals, and audience.`
					: 'Click Analyze to scan your contacts, social media, email campaigns, and revenue data.'
				}}
			</p>
			<button
				class="rounded-full px-4 py-2 text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 ios-press shadow-sm transition-colors inline-flex items-center gap-1.5"
				@click="runDashboardAnalysis"
			>
				<Icon name="lucide:sparkles" class="w-3.5 h-3.5" />
				{{ currentClient ? `Analyze ${currentClient.name}` : 'Run First Analysis' }}
			</button>
		</div>

		<!-- Error state -->
		<div v-else-if="error" class="flex flex-col items-center justify-center py-16">
			<div class="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center mb-4">
				<Icon name="lucide:alert-circle" class="w-5 h-5 text-destructive" />
			</div>
			<h3 class="text-sm font-semibold text-foreground mb-1">Analysis failed</h3>
			<p class="text-xs text-muted-foreground mb-4">{{ error }}</p>
			<button class="rounded-full px-3 py-1.5 text-[11px] font-medium border border-border bg-card hover:bg-muted ios-press transition-colors inline-flex items-center gap-1" @click="runDashboardAnalysis">
				<Icon name="lucide:refresh-cw" class="w-3 h-3" /> Try Again
			</button>
		</div>

		<!-- Dashboard content -->
		<div v-else-if="dashboard" class="space-y-6">
			<!-- Save button -->
			<div class="flex justify-end">
				<button
					class="rounded-full px-3 py-1.5 text-[11px] font-medium border border-border bg-card hover:bg-muted ios-press transition-colors inline-flex items-center gap-1 disabled:opacity-40"
					:disabled="savingDashboard"
					@click="saveDashboard"
				>
					<Icon :name="savedDashboard ? 'lucide:check' : savingDashboard ? 'lucide:loader-2' : 'lucide:save'" class="w-3 h-3" :class="{ 'animate-spin': savingDashboard }" />
					{{ savedDashboard ? 'Saved' : savingDashboard ? 'Saving...' : 'Save Analysis' }}
				</button>
			</div>

			<!-- Top row: Health Score + Velocity + Audience -->
			<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
				<div class="ios-card p-5">
					<h3 class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-4">Marketing Health</h3>
					<MarketingHealthScore
						:score="dashboard.healthScore"
						:breakdown="dashboard.healthBreakdown"
					/>
				</div>

				<div class="ios-card p-5">
					<h3 class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-4">Content Velocity</h3>
					<div class="space-y-6">
						<div>
							<div class="flex items-baseline gap-2">
								<span class="text-3xl font-bold text-foreground">{{ dashboard.contentVelocity.postsPerWeek }}</span>
								<span class="text-xs text-muted-foreground">posts / week</span>
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
								<span class="text-xs text-muted-foreground">emails / month</span>
							</div>
						</div>
					</div>
				</div>

				<div class="ios-card p-5">
					<h3 class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-4">Audience</h3>
					<div class="space-y-4">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<Icon name="lucide:users" class="w-3.5 h-3.5 text-muted-foreground" />
								<span class="text-xs text-muted-foreground">Contacts</span>
							</div>
							<span class="text-lg font-bold text-foreground">{{ formatNumber(dashboard.audienceGrowth.contacts) }}</span>
						</div>
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<Icon name="lucide:mail" class="w-3.5 h-3.5 text-muted-foreground" />
								<span class="text-xs text-muted-foreground">Subscribers</span>
							</div>
							<span class="text-lg font-bold text-foreground">{{ formatNumber(dashboard.audienceGrowth.subscribers) }}</span>
						</div>
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<Icon name="lucide:share-2" class="w-3.5 h-3.5 text-muted-foreground" />
								<span class="text-xs text-muted-foreground">Social Followers</span>
							</div>
							<span class="text-lg font-bold text-foreground">{{ formatNumber(dashboard.audienceGrowth.followers) }}</span>
						</div>
						<div class="pt-2 border-t border-border/30 flex items-center gap-2">
							<Icon
								:name="getTrendIcon(dashboard.audienceGrowth.trend)"
								class="w-3.5 h-3.5"
								:class="getTrendColor(dashboard.audienceGrowth.trend)"
							/>
							<span class="text-[10px] text-muted-foreground">
								{{ dashboard.audienceGrowth.trend === 'up' ? 'Growing' : dashboard.audienceGrowth.trend === 'down' ? 'Declining' : 'Stable' }}
							</span>
						</div>
					</div>
				</div>
			</div>

			<!-- Insights -->
			<div>
				<h3 class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Insights</h3>
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
				<h3 class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Recommendations</h3>
				<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
					<div
						v-for="(rec, i) in dashboard.recommendations"
						:key="i"
						class="ios-card p-4"
					>
						<h4 class="text-xs font-semibold text-foreground mb-1">{{ rec.title }}</h4>
						<p class="text-[10px] text-muted-foreground leading-relaxed mb-3">{{ rec.description }}</p>
						<div class="flex items-center gap-3">
							<span class="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground uppercase tracking-wider font-medium">{{ rec.channel }}</span>
							<span class="text-[9px] text-muted-foreground">
								Effort: <span class="font-medium" :class="effortColor(rec.effort)">{{ rec.effort }}</span>
							</span>
							<span class="text-[9px] text-muted-foreground">
								Impact: <span class="font-medium" :class="impactColor(rec.impact)">{{ rec.impact }}</span>
							</span>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Saved Campaigns -->
		<div v-if="savedCampaigns.length > 0 || loadingCampaigns" class="mt-10 pt-8 border-t border-border/30">
			<div class="flex items-center justify-between mb-4">
				<div class="flex items-center gap-3">
					<div class="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center">
						<Icon name="lucide:folder-open" class="w-4 h-4 text-emerald-500" />
					</div>
					<div>
						<h2 class="text-lg font-medium text-foreground">Saved Campaigns</h2>
						<p class="text-[10px] text-muted-foreground">{{ savedCampaigns.length }} campaign{{ savedCampaigns.length !== 1 ? 's' : '' }}</p>
					</div>
				</div>
				<div class="bg-muted/40 rounded-full p-0.5 flex gap-0.5">
					<button
						v-for="f in campaignFilters"
						:key="f.value"
						class="rounded-full px-2.5 py-1 text-[10px] font-medium transition-all"
						:class="campaignFilter === f.value
							? 'bg-background shadow-sm text-foreground'
							: 'text-muted-foreground hover:text-foreground'"
						@click="campaignFilter = f.value"
					>
						{{ f.label }}
					</button>
				</div>
			</div>

			<div v-if="loadingCampaigns" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
				<div v-for="i in 3" :key="i" class="ios-card p-4 animate-pulse">
					<div class="h-4 bg-muted/40 rounded w-2/3 mb-2" />
					<div class="h-3 bg-muted/40 rounded w-full mb-3" />
					<div class="h-3 bg-muted/40 rounded w-1/4" />
				</div>
			</div>

			<div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
				<div
					v-for="c in filteredCampaigns"
					:key="c.id"
					class="ios-card p-4 cursor-pointer group"
					@click="expandedCampaign = expandedCampaign === c.id ? null : c.id"
				>
					<div class="flex items-start justify-between mb-2">
						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-2 mb-1">
								<Icon
									:name="c.type === 'campaign' ? 'lucide:rocket' : 'lucide:bar-chart-2'"
									class="w-3.5 h-3.5 text-muted-foreground flex-shrink-0"
								/>
								<h4 class="text-xs font-semibold text-foreground truncate">{{ c.title }}</h4>
							</div>
							<p v-if="c.goal" class="text-[10px] text-muted-foreground line-clamp-2">{{ c.goal }}</p>
						</div>
						<span
							class="text-[9px] font-semibold uppercase px-2 py-0.5 rounded-full flex-shrink-0 ml-2"
							:class="statusBadgeClass(c.status)"
						>
							{{ c.status }}
						</span>
					</div>

					<div class="flex items-center justify-between mt-3">
						<span class="text-[10px] text-muted-foreground">
							{{ new Date(c.date_created).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }}
						</span>
						<div class="flex items-center gap-1">
							<button
								v-if="c.status === 'draft'"
								class="rounded-full text-[10px] px-2 py-0.5 bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 ios-press transition-colors"
								@click.stop="updateCampaignStatus(c.id, 'active')"
							>
								Activate
							</button>
							<button
								v-if="c.status === 'active'"
								class="rounded-full text-[10px] px-2 py-0.5 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 ios-press transition-colors"
								@click.stop="updateCampaignStatus(c.id, 'paused')"
							>
								Pause
							</button>
							<button
								v-if="c.status === 'active' || c.status === 'paused'"
								class="rounded-full text-[10px] px-2 py-0.5 bg-green-500/10 text-green-600 hover:bg-green-500/20 ios-press transition-colors"
								@click.stop="updateCampaignStatus(c.id, 'completed')"
							>
								Complete
							</button>
							<button
								class="rounded-full text-[10px] px-2 py-0.5 bg-red-500/10 text-red-600 hover:bg-red-500/20 ios-press transition-colors opacity-0 group-hover:opacity-100"
								@click.stop="deleteCampaign(c.id)"
							>
								Archive
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Campaign Planner -->
		<div class="mt-10 pt-8 border-t border-border/30">
			<div class="flex items-center gap-3 mb-4">
				<div class="w-8 h-8 rounded-xl bg-violet-500/10 flex items-center justify-center">
					<Icon name="lucide:rocket" class="w-4 h-4 text-violet-500" />
				</div>
				<div>
					<h2 class="text-lg font-medium text-foreground">Campaign Planner</h2>
					<p class="text-[10px] text-muted-foreground">Describe a goal and AI builds a multi-channel plan</p>
				</div>
			</div>

			<div class="flex gap-3">
				<input
					v-model="campaignGoal"
					type="text"
					placeholder="e.g. Launch our new service next month, re-engage churned clients..."
					class="flex-1 rounded-full border bg-muted/20 px-4 py-2.5 text-sm focus:ring-1 focus:ring-primary/30 outline-none transition-all placeholder:text-muted-foreground/50"
					@keyup.enter="runCampaignAnalysis"
				/>
				<button
					class="rounded-full px-4 py-2.5 text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 ios-press shadow-sm transition-colors inline-flex items-center gap-1.5 shrink-0 disabled:opacity-40"
					:disabled="!campaignGoal.trim() || generatingCampaign"
					@click="runCampaignAnalysis"
				>
					<Icon v-if="!generatingCampaign" name="lucide:sparkles" class="w-3.5 h-3.5" />
					<Icon v-else name="lucide:loader-2" class="w-3.5 h-3.5 animate-spin" />
					{{ generatingCampaign ? 'Planning...' : 'Generate Plan' }}
				</button>
			</div>

			<!-- Campaign loading -->
			<div v-if="generatingCampaign" class="py-12 text-center">
				<div class="flex justify-center gap-1 mb-3">
					<div v-for="i in 3" :key="i" class="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" :style="{ animationDelay: `${i * 150}ms` }" />
				</div>
				<p class="text-xs text-muted-foreground">Building your multi-channel campaign plan...</p>
			</div>

			<!-- Campaign error -->
			<div v-if="campaignError" class="mt-4 ios-card border-destructive/30 bg-destructive/5 p-4 text-center">
				<p class="text-xs text-destructive">{{ campaignError }}</p>
				<button class="rounded-full px-3 py-1.5 text-[11px] font-medium border border-border bg-card hover:bg-muted ios-press transition-colors mt-2" @click="runCampaignAnalysis">Try Again</button>
			</div>

			<!-- Campaign result -->
			<div v-if="campaign && !generatingCampaign" class="mt-6">
				<div class="flex justify-end mb-3">
					<button
						class="rounded-full px-3 py-1.5 text-[11px] font-medium border border-border bg-card hover:bg-muted ios-press transition-colors inline-flex items-center gap-1 disabled:opacity-40"
						:disabled="savingCampaign"
						@click="saveCampaign"
					>
						<Icon :name="savedCampaign ? 'lucide:check' : savingCampaign ? 'lucide:loader-2' : 'lucide:save'" class="w-3 h-3" :class="{ 'animate-spin': savingCampaign }" />
						{{ savedCampaign ? 'Saved' : savingCampaign ? 'Saving...' : 'Save Plan' }}
					</button>
				</div>
				<MarketingCampaignTimeline
					:campaign="campaign"
					@create="handleCampaignCreate"
				/>
			</div>
		</div>

		<!-- AI Contextual Sidebar -->
		<ClientOnly>
			<AIContextualSidebar
				v-if="sidebarOpen"
				entity-type="marketing"
				entity-id="dashboard"
				entity-label="Marketing Intelligence"
				@close="closeSidebar"
			/>
			<Transition name="overlay">
				<div v-if="sidebarOpen" class="fixed inset-0 bg-black/20 z-40" @click="closeSidebar" />
			</Transition>
		</ClientOnly>
	</div>
</template>

<script setup lang="ts">
import type { DashboardAnalysis, CampaignAnalysis, CampaignActivity } from '~~/shared/marketing';

definePageMeta({
	middleware: ['auth'],
});

useHead({
	title: 'Marketing Intelligence | Earnest',
});

const { selectedOrg, currentOrg } = useOrganization();
const { selectedClient, currentClient } = useClients();
const { setEntity, clearEntity, sidebarOpen, closeSidebar } = useEntityPageContext();
const includeClients = ref(false);

const analysisScope = computed(() => {
	if (currentClient.value) return currentClient.value.name;
	return currentOrg.value?.name || 'your organization';
});

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

const savedCampaigns = ref<any[]>([]);
const loadingCampaigns = ref(false);
const campaignFilter = ref('all');
const expandedCampaign = ref<string | null>(null);

const campaignFilters = [
	{ label: 'All', value: 'all' },
	{ label: 'Active', value: 'active' },
	{ label: 'Done', value: 'completed' },
	{ label: 'Drafts', value: 'draft' },
];

watch([selectedOrg, selectedClient], () => {
	dashboard.value = null;
	campaign.value = null;
	lastAnalyzed.value = null;
});

const filteredCampaigns = computed(() => {
	if (campaignFilter.value === 'all') return savedCampaigns.value.filter(c => c.status !== 'archived');
	return savedCampaigns.value.filter(c => c.status === campaignFilter.value);
});

function statusBadgeClass(status: string): string {
	switch (status) {
		case 'active': return 'bg-blue-500/10 text-blue-600';
		case 'completed': return 'bg-green-500/10 text-green-600';
		case 'paused': return 'bg-amber-500/10 text-amber-600';
		case 'archived': return 'bg-muted text-muted-foreground';
		default: return 'bg-muted/50 text-muted-foreground';
	}
}

async function fetchCampaigns() {
	if (!selectedOrg.value) return;
	loadingCampaigns.value = true;
	try {
		const data = await $fetch(`/api/marketing/campaigns?organizationId=${selectedOrg.value}`);
		savedCampaigns.value = (data as any).campaigns || [];
	} catch {
		savedCampaigns.value = [];
	} finally {
		loadingCampaigns.value = false;
	}
}

async function updateCampaignStatus(id: string, status: string) {
	try {
		await $fetch(`/api/marketing/campaigns/${id}`, {
			method: 'PATCH',
			body: { status },
		});
		const idx = savedCampaigns.value.findIndex(c => c.id === id);
		if (idx !== -1) savedCampaigns.value[idx].status = status;
	} catch (err) {
		console.error('Failed to update campaign:', err);
	}
}

async function deleteCampaign(id: string) {
	try {
		await $fetch(`/api/marketing/campaigns/${id}`, { method: 'DELETE' });
		savedCampaigns.value = savedCampaigns.value.filter(c => c.id !== id);
	} catch (err) {
		console.error('Failed to archive campaign:', err);
	}
}

async function runDashboardAnalysis() {
	if (!selectedOrg.value) {
		error.value = 'Please select an organization first.';
		return;
	}

	analyzing.value = true;
	error.value = '';

	try {
		const clientId = selectedClient.value && selectedClient.value !== 'org' ? selectedClient.value : undefined;
		const data = await $fetch('/api/marketing/ai-analyze', {
			method: 'POST',
			body: {
				analysisType: 'dashboard',
				organizationId: selectedOrg.value,
				clientId,
				includeClients: !clientId && includeClients.value,
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
		const clientId = selectedClient.value && selectedClient.value !== 'org' ? selectedClient.value : undefined;
		const data = await $fetch('/api/marketing/ai-analyze', {
			method: 'POST',
			body: {
				analysisType: 'campaign',
				organizationId: selectedOrg.value,
				clientId,
				includeClients: !clientId && includeClients.value,
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
				organizationId: selectedOrg.value,
			},
		});
		savedDashboard.value = true;
		setTimeout(() => { savedDashboard.value = false; }, 3000);
		fetchCampaigns();
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
				organizationId: selectedOrg.value,
			},
		});
		savedCampaign.value = true;
		setTimeout(() => { savedCampaign.value = false; }, 3000);
		fetchCampaigns();
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

onMounted(() => {
	setEntity('marketing', 'dashboard', 'Marketing Intelligence');
	fetchCampaigns();
});

onUnmounted(() => clearEntity());

watch(selectedOrg, () => {
	fetchCampaigns();
});
</script>

<style scoped>
.overlay-enter-active,
.overlay-leave-active {
	transition: opacity 0.3s ease;
}
.overlay-enter-from,
.overlay-leave-to {
	opacity: 0;
}
</style>
