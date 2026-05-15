<template>
	<LayoutPageContainer>
		<!-- Header -->
		<div class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
			<div>
				<h1 class="text-2xl font-semibold text-foreground">Marketing</h1>
				<p class="text-xs text-muted-foreground mt-1">
					Pulse of email + social for
					<span class="font-medium text-foreground">{{ analysisScope }}</span>
				</p>
			</div>
			<div class="flex items-center gap-2">
				<div class="bg-muted/40 rounded-full p-0.5 flex gap-0.5">
					<button
						v-for="r in ranges"
						:key="r.value"
						class="rounded-full px-2.5 py-1 text-[10px] font-medium transition-all"
						:class="rangeDays === r.value
							? 'bg-background shadow-sm text-foreground'
							: 'text-muted-foreground hover:text-foreground'"
						@click="rangeDays = r.value"
					>
						{{ r.label }}
					</button>
				</div>
				<button
					class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium border border-border bg-card hover:bg-muted ios-press transition-colors"
					@click="sidebarOpen = true"
				>
					<Icon name="lucide:sparkles" class="w-3 h-3" />
					<span class="hidden sm:inline">Ask Earnest</span>
				</button>
			</div>
		</div>

		<!-- Recommendation feed — folded in from the deprecated /marketing-feed route -->
		<MarketingFeedSection />

		<!-- Hero KPI strip — horizontal-scroll on mobile with snap -->
		<div
			class="-mx-4 sm:mx-0 px-4 sm:px-0 mb-6 overflow-x-auto sm:overflow-visible snap-x snap-mandatory sm:snap-none scrollbar-hide"
		>
			<div class="flex sm:grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
				<MarketingKPICard
					v-for="kpi in heroKPIs"
					:key="kpi.label"
					:label="kpi.label"
					:value="kpi.value"
					:delta="kpi.delta"
					:icon="kpi.icon"
					:tone="kpi.tone"
					:loading="loadingKPIs"
					class="snap-start shrink-0 w-[78%] sm:w-auto"
				/>
			</div>
		</div>

		<!-- Action Bar -->
		<div v-if="actionItems.length || loadingActions" class="mb-8">
			<h3 class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
				<Icon name="lucide:zap" class="w-3 h-3 text-warning" />
				Needs your attention
			</h3>
			<div v-if="loadingActions" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
				<div v-for="i in 3" :key="i" class="ios-card p-4 animate-pulse">
					<div class="h-3 w-1/3 bg-muted/40 rounded mb-2" />
					<div class="h-4 w-2/3 bg-muted/40 rounded" />
				</div>
			</div>
			<div v-else-if="actionItems.length === 0" class="ios-card p-4 flex items-center gap-3 text-xs text-muted-foreground">
				<Icon name="lucide:check-circle-2" class="w-4 h-4 text-success" />
				All clear — nothing waiting on you right now.
			</div>
			<div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
				<NuxtLink
					v-for="(action, i) in actionItems"
					:key="i"
					:to="action.href"
					class="ios-card p-4 hover:shadow-md transition-all group flex items-start gap-3"
					:class="action.toneClass"
				>
					<div
						class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
						:class="action.iconBgClass"
					>
						<Icon :name="action.icon" class="w-4 h-4" :class="action.iconColorClass" />
					</div>
					<div class="flex-1 min-w-0">
						<p class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">
							{{ action.label }}
						</p>
						<p class="text-sm font-medium text-foreground leading-snug">
							{{ action.message }}
						</p>
					</div>
					<Icon
						name="lucide:chevron-right"
						class="w-4 h-4 text-muted-foreground/50 group-hover:text-foreground group-hover:translate-x-0.5 transition-all"
					/>
				</NuxtLink>
			</div>
		</div>

		<!-- Channel Performance: Email + Social -->
		<div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
			<!-- Email card -->
			<div class="ios-card p-5">
				<div class="flex items-center justify-between mb-4">
					<div class="flex items-center gap-2">
						<div class="w-8 h-8 rounded-xl bg-info/10 flex items-center justify-center">
							<Icon name="lucide:mail" class="w-4 h-4 text-info" />
						</div>
						<h3 class="text-sm font-semibold text-foreground">Email</h3>
					</div>
					<NuxtLink
						to="/email"
						class="text-[10px] uppercase tracking-wider font-medium text-muted-foreground hover:text-foreground"
					>
						Open →
					</NuxtLink>
				</div>

				<div v-if="loadingKPIs" class="space-y-3 animate-pulse">
					<div class="h-8 bg-muted/40 rounded w-1/2" />
					<div class="h-3 bg-muted/40 rounded w-3/4" />
					<div class="h-3 bg-muted/40 rounded w-2/3" />
				</div>

				<div v-else-if="hasEmailData" class="space-y-4">
					<div>
						<p class="text-3xl font-bold text-foreground tabular-nums">{{ formatNumber(emailMetrics.totalSubscribers) }}</p>
						<p class="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Subscribers</p>
					</div>
					<div class="grid grid-cols-2 gap-3 pt-3 border-t border-border/30">
						<div>
							<p class="text-lg font-semibold text-foreground tabular-nums">{{ emailMetrics.mailingLists }}</p>
							<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Lists</p>
						</div>
						<div>
							<p class="text-lg font-semibold text-foreground tabular-nums">{{ emailMetrics.recentCampaigns }}</p>
							<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Sent ({{ rangeDays }}d)</p>
						</div>
					</div>
					<div v-if="emailMetrics.subscriptionRate > 0" class="pt-3 border-t border-border/30">
						<div class="flex items-center justify-between text-[11px] mb-1.5">
							<span class="text-muted-foreground">Subscription rate</span>
							<span class="font-medium tabular-nums">{{ emailMetrics.subscriptionRate }}%</span>
						</div>
						<div class="h-1.5 rounded-full bg-muted/40 overflow-hidden">
							<div
								class="h-full bg-info/70"
								:style="{ width: `${Math.min(100, emailMetrics.subscriptionRate)}%` }"
							/>
						</div>
					</div>
				</div>

				<div v-else class="py-6 text-center">
					<Icon name="lucide:mail-x" class="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
					<p class="text-xs text-foreground font-medium mb-1">No email sends yet</p>
					<p class="text-[10px] text-muted-foreground mb-3">
						Build a list from your contacts, then ship a newsletter.
					</p>
					<NuxtLink
						to="/contacts"
						class="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[10px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
					>
						<Icon name="lucide:plus" class="w-3 h-3" />
						Build a list
					</NuxtLink>
				</div>
			</div>

			<!-- Social per-platform tiles (spans 2 cols on lg) -->
			<div class="ios-card p-5 lg:col-span-2">
				<div class="flex items-center justify-between mb-4">
					<div class="flex items-center gap-2">
						<div class="w-8 h-8 rounded-xl bg-violet-500/10 flex items-center justify-center">
							<Icon name="lucide:share-2" class="w-4 h-4 text-violet-500" />
						</div>
						<h3 class="text-sm font-semibold text-foreground">Social</h3>
					</div>
					<NuxtLink
						to="/social"
						class="text-[10px] uppercase tracking-wider font-medium text-muted-foreground hover:text-foreground"
					>
						Open →
					</NuxtLink>
				</div>

				<div v-if="loadingSocial" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 animate-pulse">
					<div v-for="i in 5" :key="i" class="rounded-xl border bg-muted/20 h-28" />
				</div>

				<div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
					<MarketingPlatformTile
						v-for="tile in platformTiles"
						:key="tile.platform"
						:tile="tile"
					/>
				</div>
			</div>
		</div>

		<!-- Active Campaigns — recommendations now live in the feed at the top of the page -->
		<div class="mb-8">
			<div class="ios-card p-5">
				<div class="flex items-center justify-between mb-4">
					<div class="flex items-center gap-2">
						<div class="w-8 h-8 rounded-xl bg-success/10 flex items-center justify-center">
							<Icon name="lucide:rocket" class="w-4 h-4 text-success" />
						</div>
						<h3 class="text-sm font-semibold text-foreground">Active Campaigns</h3>
					</div>
					<NuxtLink
						to="/marketing-timeline"
						class="text-[10px] uppercase tracking-wider font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
					>
						Timeline
						<Icon name="lucide:chevron-right" class="w-3 h-3" />
					</NuxtLink>
				</div>

				<div v-if="loadingCampaigns" class="space-y-2 animate-pulse">
					<div v-for="i in 3" :key="i" class="rounded-xl border bg-muted/10 p-3 h-14" />
				</div>

				<div v-else-if="topCampaigns.length === 0" class="py-8 text-center">
					<Icon name="lucide:rocket" class="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
					<p class="text-xs text-foreground font-medium mb-1">No active campaigns</p>
					<p class="text-[10px] text-muted-foreground mb-3">Plan one with the Campaign Planner below.</p>
				</div>

				<div v-else class="space-y-2">
					<div
						v-for="c in topCampaigns"
						:key="c.id"
						class="group rounded-xl border border-border/40 bg-card/40 hover:bg-muted/30 transition-colors overflow-hidden"
					>
						<!-- Sticky label row (Clean Gantt) -->
						<div class="flex items-center gap-2 px-3 py-2">
							<span
								class="w-2 h-2 rounded-full shrink-0"
								:class="campaignStatusDot(c.status)"
							/>
							<NuxtLink
								:to="`/marketing-timeline?campaign=${c.id}`"
								class="text-xs font-medium text-foreground truncate flex-1"
							>
								{{ c.title }}
							</NuxtLink>
							<span
								class="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full font-medium"
								:class="getStatusBadgeClasses(c.status)"
							>
								{{ c.status }}
							</span>
						</div>
						<!-- Flat 12px progress bar -->
						<div class="h-3 bg-muted/30 relative">
							<div
								class="h-full transition-all"
								:class="campaignBarColor(c.status)"
								:style="{ width: `${c.progressPct}%`, opacity: c.status === 'paused' ? 0.4 : 0.85 }"
							/>
						</div>
						<div class="flex items-center justify-between px-3 py-1.5 text-[10px] text-muted-foreground">
							<span v-if="c.nextMilestone">Next: {{ c.nextMilestone }}</span>
							<span v-else>Created {{ relativeDate(c.date_created) }}</span>
							<span class="tabular-nums">{{ c.progressPct }}%</span>
						</div>
					</div>
				</div>
			</div>

		</div>

		<!-- AI Tools — collapsed/secondary -->
		<div class="ios-card overflow-hidden mb-6">
			<button
				type="button"
				class="w-full flex items-center justify-between gap-3 px-5 py-4 cursor-pointer hover:bg-muted/30 transition-colors"
				:aria-expanded="aiToolsOpen"
				@click="aiToolsOpen = !aiToolsOpen"
			>
				<div class="flex items-center gap-3">
					<div class="w-8 h-8 rounded-xl bg-warning/10 flex items-center justify-center">
						<Icon name="lucide:wand" class="w-4 h-4 text-warning" />
					</div>
					<div class="text-left">
						<h3 class="text-sm font-semibold text-foreground">Earnest Intelligence</h3>
						<p class="text-[10px] text-muted-foreground">Deep analysis + AI campaign planner</p>
					</div>
				</div>
				<Icon
					name="lucide:chevron-down"
					class="w-4 h-4 text-muted-foreground transition-transform"
					:class="{ 'rotate-180': aiToolsOpen }"
				/>
			</button>

			<div v-if="aiToolsOpen" class="px-5 pb-5 pt-1 space-y-6 border-t border-border/30">
				<!-- Run analysis row -->
				<div class="flex items-center justify-between gap-3 pt-3">
					<div>
						<p class="text-xs font-medium text-foreground">Marketing Health Analysis</p>
						<p class="text-[10px] text-muted-foreground">
							{{ dashboard ? `Last run ${lastAnalyzed ? timeAgo(lastAnalyzed) : ''}` : 'Generate a deep AI analysis with insights + recommendations.' }}
						</p>
					</div>
					<button
						class="rounded-full px-3 py-1.5 text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 ios-press shadow-sm transition-colors inline-flex items-center gap-1.5 disabled:opacity-40"
						:disabled="analyzing"
						@click="runDashboardAnalysis"
					>
						<Icon v-if="!analyzing" name="lucide:sparkles" class="w-3.5 h-3.5" />
						<Icon v-else name="lucide:loader-2" class="w-3.5 h-3.5 animate-spin" />
						{{ analyzing ? 'Analyzing…' : (dashboard ? 'Re-run' : 'Run analysis') }}
					</button>
				</div>

				<!-- AI dashboard insights (when present) -->
				<div v-if="dashboard" class="space-y-4">
					<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
						<MarketingInsightCard
							v-for="(insight, i) in dashboard.insights"
							:key="i"
							:insight="insight"
						/>
					</div>
					<div v-if="dashboard.recommendations?.length" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
						<div
							v-for="(rec, i) in dashboard.recommendations"
							:key="i"
							class="ios-card p-4"
						>
							<h4 class="text-xs font-semibold text-foreground mb-1">{{ rec.title }}</h4>
							<p class="text-[10px] text-muted-foreground leading-relaxed mb-3">{{ rec.description }}</p>
							<div class="flex items-center gap-3 text-[9px]">
								<span class="px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground uppercase tracking-wider font-medium">{{ rec.channel }}</span>
								<span class="text-muted-foreground">
									Effort <span class="font-medium" :class="effortColor(rec.effort)">{{ rec.effort }}</span>
								</span>
								<span class="text-muted-foreground">
									Impact <span class="font-medium" :class="impactColor(rec.impact)">{{ rec.impact }}</span>
								</span>
							</div>
						</div>
					</div>
				</div>

				<!-- Campaign Planner -->
				<div class="border-t border-border/30 pt-5">
					<div class="flex items-center gap-2 mb-3">
						<Icon name="lucide:rocket" class="w-3.5 h-3.5 text-violet-500" />
						<h4 class="text-xs font-semibold text-foreground">Campaign Planner</h4>
						<span class="text-[10px] text-muted-foreground">Describe a goal, get a multi-channel plan.</span>
					</div>
					<div class="flex flex-col sm:flex-row gap-2">
						<input
							v-model="campaignGoal"
							type="text"
							placeholder="e.g. Launch our new service next month, re-engage churned clients…"
							class="flex-1 rounded-full border bg-muted/20 px-4 py-2 text-sm focus:ring-1 focus:ring-primary/30 outline-none transition-all placeholder:text-muted-foreground/50"
							@keyup.enter="runCampaignAnalysis"
						/>
						<button
							class="rounded-full px-4 py-2 text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 ios-press shadow-sm transition-colors inline-flex items-center gap-1.5 shrink-0 disabled:opacity-40"
							:disabled="!campaignGoal.trim() || generatingCampaign"
							@click="runCampaignAnalysis"
						>
							<Icon v-if="!generatingCampaign" name="lucide:sparkles" class="w-3.5 h-3.5" />
							<Icon v-else name="lucide:loader-2" class="w-3.5 h-3.5 animate-spin" />
							{{ generatingCampaign ? 'Planning…' : 'Generate Plan' }}
						</button>
					</div>

					<div v-if="campaignError" class="mt-3 ios-card border-destructive/30 bg-destructive/5 p-3 text-center">
						<p class="text-xs text-destructive">{{ campaignError }}</p>
					</div>

					<div v-if="campaign && !generatingCampaign" class="mt-4">
						<div class="flex justify-end mb-2">
							<button
								class="rounded-full px-3 py-1 text-[10px] font-medium border border-border bg-card hover:bg-muted ios-press transition-colors inline-flex items-center gap-1 disabled:opacity-40"
								:disabled="savingCampaign"
								@click="saveCampaign"
							>
								<Icon :name="savedCampaign ? 'lucide:check' : savingCampaign ? 'lucide:loader-2' : 'lucide:save'" class="w-3 h-3" :class="{ 'animate-spin': savingCampaign }" />
								{{ savedCampaign ? 'Saved' : savingCampaign ? 'Saving…' : 'Save Plan' }}
							</button>
						</div>
						<MarketingCampaignTimeline
							:campaign="campaign"
							@create="handleCampaignCreate"
						/>
					</div>
				</div>
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
	</LayoutPageContainer>
</template>

<script setup lang="ts">
import type {
	DashboardAnalysis,
	CampaignAnalysis,
	CampaignActivity,
} from '~~/shared/marketing';
import type { SocialPlatform, SocialAccountPublic } from '~~/shared/social';

definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Marketing | Earnest' });

const { selectedOrg, currentOrg } = useOrganization();
const { selectedClient, currentClient } = useClients();
const { setEntity, clearEntity, sidebarOpen, closeSidebar } = useEntityPageContext();
const { getStatusBadgeClasses } = useStatusStyle();

const analysisScope = computed(() => {
	if (currentClient.value) return currentClient.value.name;
	return currentOrg.value?.name || 'your organization';
});

// ── Time range ─────────────────────────────────────────────────────────
const ranges = [
	{ label: '7d', value: 7 },
	{ label: '30d', value: 30 },
	{ label: '90d', value: 90 },
];
const rangeDays = ref(30);

// ── Loading flags ──────────────────────────────────────────────────────
const loadingKPIs = ref(false);
const loadingActions = ref(false);
const loadingSocial = ref(false);
const loadingCampaigns = ref(false);
const loadingRecs = ref(false);

// ── Health snapshot (KPIs + email metrics) ─────────────────────────────
interface HealthSnapshot {
	healthScore: number;
	breakdown: { audience: number; social: number; email: number; revenue: number };
	alerts: Array<{ type: string; message: string }>;
	metrics: {
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
		totalRevenue: number;
		revenueTrend: 'up' | 'down' | 'flat';
		monthlyRevenue: Array<{ month: string; total: number }>;
		totalClients: number;
	};
}
const health = ref<HealthSnapshot | null>(null);

// ── Social ────────────────────────────────────────────────────────────
const socialAccounts = ref<SocialAccountPublic[]>([]);
const socialAnalytics = ref<any | null>(null);
const recentPosts = ref<any[]>([]);
const scheduledPosts = ref<any[]>([]);
const failedPosts = ref<any[]>([]);

// ── Campaigns + Recs ───────────────────────────────────────────────────
const activeCampaigns = ref<any[]>([]);
const recommendations = ref<any[]>([]);
const dismissingId = ref<string | null>(null);

// ── AI tools (kept) ────────────────────────────────────────────────────
const aiToolsOpen = ref(false);
const analyzing = ref(false);
const dashboard = ref<DashboardAnalysis | null>(null);
const lastAnalyzed = ref<Date | null>(null);
const campaignGoal = ref('');
const generatingCampaign = ref(false);
const campaignError = ref('');
const campaign = ref<CampaignAnalysis | null>(null);
const savingCampaign = ref(false);
const savedCampaign = ref(false);

// ── Derived: hero KPIs ─────────────────────────────────────────────────
const PLATFORMS: SocialPlatform[] = ['instagram', 'linkedin', 'facebook', 'tiktok', 'threads'];

const emailMetrics = computed(() => ({
	totalSubscribers: health.value?.metrics.totalSubscribers ?? 0,
	mailingLists: health.value?.metrics.mailingLists ?? 0,
	recentCampaigns: health.value?.metrics.recentCampaigns ?? 0,
	subscriptionRate: health.value?.metrics.subscriptionRate ?? 0,
}));

const hasEmailData = computed(() =>
	emailMetrics.value.totalSubscribers > 0 || emailMetrics.value.mailingLists > 0,
);

const totalReach = computed(() => socialAnalytics.value?.overview?.total_followers ?? 0);

const heroKPIs = computed(() => {
	const m = health.value?.metrics;
	const contactDelta = m?.contactGrowth ?? 0;
	const deltaLabel = contactDelta > 0 ? `+${contactDelta} this month` : null;
	return [
		{
			label: 'Marketing Health',
			value: health.value ? String(health.value.healthScore) : '—',
			delta: null,
			icon: 'lucide:activity',
			tone: healthTone(health.value?.healthScore),
		},
		{
			label: `Posts (${rangeDays.value}d)`,
			value: m ? String(m.socialPostsLast30Days) : '—',
			delta: null,
			icon: 'lucide:share-2',
			tone: 'violet',
		},
		{
			label: 'Email Subscribers',
			value: m ? formatNumber(m.totalSubscribers) : '—',
			delta: null,
			icon: 'lucide:mail',
			tone: 'sky',
		},
		{
			label: 'Social Reach',
			value: formatNumber(totalReach.value),
			delta: null,
			icon: 'lucide:users',
			tone: 'fuchsia',
		},
		{
			label: 'Contacts',
			value: m ? formatNumber(m.totalContacts) : '—',
			delta: deltaLabel,
			icon: 'lucide:user-round',
			tone: 'emerald',
		},
	];
});

function healthTone(score?: number): string {
	if (score === undefined) return 'neutral';
	if (score >= 70) return 'emerald';
	if (score >= 40) return 'amber';
	return 'rose';
}

// ── Derived: Action items ──────────────────────────────────────────────
const actionItems = computed(() => {
	const items: any[] = [];
	const m = health.value?.metrics;

	// (Pending recommendations are surfaced in the feed at the top of the page,
	// so they don't need a duplicate entry in the action bar.)

	// Failed social posts
	if (failedPosts.value.length > 0 || (m?.failedPosts ?? 0) > 0) {
		const count = Math.max(failedPosts.value.length, m?.failedPosts ?? 0);
		items.push({
			label: 'Publishing failed',
			message: `${count} post${count > 1 ? 's' : ''} failed to publish`,
			icon: 'lucide:alert-circle',
			href: { path: '/social', query: { status: 'failed' } },
			toneClass: 'border-destructive/20',
			iconBgClass: 'bg-destructive/10',
			iconColorClass: 'text-destructive',
		});
	}

	// 3. Expiring/expired tokens
	const expiring = socialAccounts.value.filter(a => a.is_token_expiring_soon || a.status === 'expired');
	if (expiring.length > 0) {
		items.push({
			label: 'Reconnect needed',
			message: `${expiring.length} ${expiring.length === 1 ? 'account' : 'accounts'} need reconnecting`,
			icon: 'lucide:link-2-off',
			href: '/social/settings',
			toneClass: 'border-warning/20',
			iconBgClass: 'bg-warning/10',
			iconColorClass: 'text-warning',
		});
	}

	// 4. Scheduled posts publishing today
	const today = new Date(); today.setHours(23, 59, 59, 999);
	const todayMs = today.getTime();
	const scheduledToday = scheduledPosts.value.filter(p => {
		const t = p.scheduled_at ? new Date(p.scheduled_at).getTime() : 0;
		return t > 0 && t <= todayMs;
	});
	if (scheduledToday.length > 0) {
		items.push({
			label: 'Going out today',
			message: `${scheduledToday.length} scheduled post${scheduledToday.length > 1 ? 's' : ''} today`,
			icon: 'lucide:clock',
			href: { path: '/social', query: { status: 'scheduled' } },
			toneClass: 'border-info/20',
			iconBgClass: 'bg-info/10',
			iconColorClass: 'text-info',
		});
	}

	// 5. Disconnected platforms
	const connectedSet = new Set(socialAccounts.value.filter(a => a.status === 'active').map(a => a.platform));
	const disconnected = PLATFORMS.filter(p => !connectedSet.has(p));
	if (disconnected.length > 0 && socialAccounts.value.length === 0) {
		items.push({
			label: 'Connect accounts',
			message: 'No social accounts connected yet',
			icon: 'lucide:plug',
			href: '/social/settings',
			toneClass: 'border-violet-500/20',
			iconBgClass: 'bg-violet-500/10',
			iconColorClass: 'text-violet-500',
		});
	}

	return items.slice(0, 5);
});

// ── Derived: per-platform tiles ────────────────────────────────────────
const platformTiles = computed(() => {
	const accountsByPlatform = new Map<SocialPlatform, SocialAccountPublic[]>();
	for (const a of socialAccounts.value) {
		const list = accountsByPlatform.get(a.platform) || [];
		list.push(a);
		accountsByPlatform.set(a.platform, list);
	}

	const postsCountByPlatform = new Map<SocialPlatform, number>();
	for (const p of recentPosts.value) {
		for (const target of (p.platforms || [])) {
			postsCountByPlatform.set(target.platform, (postsCountByPlatform.get(target.platform) || 0) + 1);
		}
	}

	const nextScheduledByPlatform = new Map<SocialPlatform, string>();
	const sortedScheduled = [...scheduledPosts.value].sort((a, b) => {
		const at = a.scheduled_at ? new Date(a.scheduled_at).getTime() : Infinity;
		const bt = b.scheduled_at ? new Date(b.scheduled_at).getTime() : Infinity;
		return at - bt;
	});
	for (const p of sortedScheduled) {
		for (const target of (p.platforms || [])) {
			if (!nextScheduledByPlatform.has(target.platform)) {
				nextScheduledByPlatform.set(target.platform, p.scheduled_at);
			}
		}
	}

	const followersByAccount = new Map<string, number>();
	for (const a of (socialAnalytics.value?.accounts ?? [])) {
		const m = a.metrics || {};
		const followers = m.followers_count ?? m.follower_count ?? 0;
		followersByAccount.set(a.account_id, followers);
	}

	return PLATFORMS.map((platform) => {
		const accounts = accountsByPlatform.get(platform) || [];
		const primary = accounts[0];
		const connected = !!primary && primary.status === 'active';
		const followers = primary ? (followersByAccount.get(primary.id) || 0) : 0;
		return {
			platform,
			connected,
			expired: !!primary && (primary.status === 'expired' || primary.is_token_expiring_soon),
			accountName: primary?.account_name || null,
			accountHandle: primary?.account_handle || null,
			followers,
			postsLastPeriod: postsCountByPlatform.get(platform) || 0,
			nextScheduledAt: nextScheduledByPlatform.get(platform) || null,
		};
	});
});

// ── Derived: top campaigns ─────────────────────────────────────────────
const topCampaigns = computed(() =>
	[...activeCampaigns.value]
		.filter(c => c.status === 'active' || c.status === 'paused')
		.slice(0, 3)
		.map((c) => {
			const start = c.start_date ? new Date(c.start_date).getTime() : new Date(c.date_created).getTime();
			const end = c.end_date ? new Date(c.end_date).getTime() : start + 30 * 86400000;
			const now = Date.now();
			const total = Math.max(1, end - start);
			const elapsed = Math.max(0, Math.min(total, now - start));
			const progressPct = Math.round((elapsed / total) * 100);
			return {
				...c,
				progressPct,
				nextMilestone: c.end_date ? `Ends ${relativeDate(c.end_date)}` : null,
			};
		}),
);

// ── Derived: top recommendations (preview) ─────────────────────────────
const topRecs = computed(() =>
	recommendations.value.slice(0, 3).map((r) => ({
		id: r.id,
		urgency: r.urgency,
		headline: r.ranker_output?.headline || r.candidate_data?.title || 'Marketing recommendation',
		why_now: r.ranker_output?.why_now || '',
	})),
);

// ── Helpers ────────────────────────────────────────────────────────────
function recUrgencyDot(u: string | number): string {
	const v = typeof u === 'string' ? u : (u >= 70 ? 'high' : u >= 40 ? 'medium' : 'low');
	if (v === 'high') return 'bg-destructive';
	if (v === 'medium') return 'bg-warning';
	return 'bg-success';
}

function campaignStatusDot(s: string): string {
	if (s === 'active') return 'bg-success';
	if (s === 'paused') return 'bg-warning';
	if (s === 'completed') return 'bg-info';
	return 'bg-muted-foreground/40';
}

function campaignBarColor(s: string): string {
	if (s === 'active') return 'bg-success';
	if (s === 'paused') return 'bg-warning';
	if (s === 'completed') return 'bg-info';
	return 'bg-muted-foreground/40';
}

function effortColor(level: string): string {
	if (level === 'low') return 'text-success dark:text-success';
	if (level === 'high') return 'text-destructive dark:text-destructive';
	return 'text-warning dark:text-warning';
}

function impactColor(level: string): string {
	if (level === 'high') return 'text-success dark:text-success';
	if (level === 'low') return 'text-destructive dark:text-destructive';
	return 'text-warning dark:text-warning';
}

function formatNumber(n: number): string {
	if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
	if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
	return String(n ?? 0);
}

function timeAgo(date: Date): string {
	const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
	if (seconds < 60) return 'just now';
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 48) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

function relativeDate(iso: string | Date): string {
	const d = typeof iso === 'string' ? new Date(iso) : iso;
	const ms = d.getTime() - Date.now();
	const days = Math.round(ms / 86400000);
	if (Math.abs(days) < 1) return 'today';
	if (days === 1) return 'tomorrow';
	if (days === -1) return 'yesterday';
	if (days > 0) return `in ${days}d`;
	return `${Math.abs(days)}d ago`;
}

// ── Data loaders ───────────────────────────────────────────────────────
async function loadAll() {
	if (!selectedOrg.value) return;
	loadingKPIs.value = true;
	loadingActions.value = true;
	loadingSocial.value = true;
	loadingCampaigns.value = true;
	loadingRecs.value = true;

	const orgId = selectedOrg.value;
	const sinceISO = new Date(Date.now() - rangeDays.value * 86400000).toISOString();

	const tasks: Promise<any>[] = [
		// Health snapshot
		$fetch('/api/marketing/health-snapshot', { query: { organizationId: orgId } })
			.then((r: any) => { health.value = r as HealthSnapshot; })
			.catch(() => { health.value = null; }),

		// Social accounts
		$fetch('/api/social/accounts')
			.then((r: any) => { socialAccounts.value = (r?.data ?? []) as SocialAccountPublic[]; })
			.catch(() => { socialAccounts.value = []; }),

		// Social analytics
		$fetch('/api/social/analytics')
			.then((r: any) => { socialAnalytics.value = r?.data ?? null; })
			.catch(() => { socialAnalytics.value = null; }),

		// Recent published posts
		$fetch('/api/social/posts', { query: { status: 'published', limit: 100 } })
			.then((r: any) => {
				const posts = (r?.data ?? []) as any[];
				recentPosts.value = posts.filter((p) => {
					const ts = p.published_at || p.scheduled_at;
					return ts ? new Date(ts).toISOString() >= sinceISO : true;
				});
			})
			.catch(() => { recentPosts.value = []; }),

		// Scheduled posts (upcoming)
		$fetch('/api/social/posts', { query: { status: 'scheduled', limit: 50 } })
			.then((r: any) => { scheduledPosts.value = (r?.data ?? []) as any[]; })
			.catch(() => { scheduledPosts.value = []; }),

		// Failed posts
		$fetch('/api/social/posts', { query: { status: 'failed', limit: 20 } })
			.then((r: any) => { failedPosts.value = (r?.data ?? []) as any[]; })
			.catch(() => { failedPosts.value = []; }),

		// Active campaigns
		$fetch('/api/marketing/campaigns', { query: { organizationId: orgId, type: 'campaign' } })
			.then((r: any) => {
				activeCampaigns.value = ((r?.campaigns ?? []) as any[])
					.filter((c) => c.status === 'active' || c.status === 'paused');
			})
			.catch(() => { activeCampaigns.value = []; }),

		// Recommendations
		$fetch('/api/marketing/recommendations', { query: { organizationId: orgId } })
			.then((r: any) => { recommendations.value = (r?.recommendations ?? []) as any[]; })
			.catch(() => { recommendations.value = []; }),
	];

	await Promise.allSettled(tasks);

	loadingKPIs.value = false;
	loadingActions.value = false;
	loadingSocial.value = false;
	loadingCampaigns.value = false;
	loadingRecs.value = false;
}

async function dismissRec(id: string) {
	dismissingId.value = id;
	try {
		await $fetch(`/api/marketing/recommendations/${id}/skip`, { method: 'POST' });
		recommendations.value = recommendations.value.filter(r => r.id !== id);
	} catch (err) {
		console.error('Failed to skip recommendation:', err);
	} finally {
		dismissingId.value = null;
	}
}

// ── AI tools (kept) ────────────────────────────────────────────────────
async function runDashboardAnalysis() {
	if (!selectedOrg.value) return;
	analyzing.value = true;
	try {
		const clientId = selectedClient.value && selectedClient.value !== 'org' ? selectedClient.value : undefined;
		const data = await $fetch('/api/marketing/ai-analyze', {
			method: 'POST',
			body: {
				analysisType: 'dashboard',
				organizationId: selectedOrg.value,
				clientId,
			},
		});
		dashboard.value = data as DashboardAnalysis;
		lastAnalyzed.value = new Date();
	} catch {
		// silent
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
				goal: campaignGoal.value,
			},
		});
		campaign.value = data as CampaignAnalysis;
	} catch (err: any) {
		campaignError.value = err?.data?.message || err?.message || 'Failed to generate plan.';
	} finally {
		generatingCampaign.value = false;
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
		loadAll();
	} catch (err) {
		console.error('Failed to save campaign:', err);
	} finally {
		savingCampaign.value = false;
	}
}

function handleCampaignCreate(activity: CampaignActivity) {
	if (activity.channel === 'social') navigateTo('/social/compose');
	else if (activity.channel === 'email') navigateTo('/email');
}

// ── Lifecycle ──────────────────────────────────────────────────────────
onMounted(() => {
	setEntity('marketing', 'dashboard', 'Marketing Intelligence');
	loadAll();
});

onUnmounted(() => clearEntity());

watch([selectedOrg, selectedClient, rangeDays], () => {
	loadAll();
});
</script>

<style scoped>
.scrollbar-hide::-webkit-scrollbar { display: none; }
.scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
.overlay-enter-active,
.overlay-leave-active { transition: opacity 0.3s ease; }
.overlay-enter-from,
.overlay-leave-to { opacity: 0; }
</style>
