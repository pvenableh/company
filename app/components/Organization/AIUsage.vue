<template>
	<div class="space-y-6">
		<!-- Access gate — only shown when the server refuses entirely (non-member). -->
		<div v-if="accessDenied" class="flex flex-col items-center justify-center py-16">
			<div class="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
				<UIcon name="i-heroicons-lock-closed" class="w-6 h-6 text-destructive" />
			</div>
			<h3 class="font-semibold text-foreground mb-1">Access Restricted</h3>
			<p class="text-sm text-muted-foreground text-center max-w-sm">
				You don't have permission to view AI usage data. Contact your organization admin to request access.
			</p>
		</div>

		<template v-else>
		<!-- Period selector -->
		<div class="flex items-center justify-between gap-3 flex-wrap">
			<div class="min-w-0">
				<h3 class="text-lg font-semibold text-foreground">
					{{ viewScope === 'own' ? 'Your AI Usage' : 'Token Usage' }}
				</h3>
				<p v-if="viewScope === 'own'" class="text-xs text-muted-foreground mt-0.5">
					You're seeing your own usage. Org-wide totals are visible to managers and admins.
				</p>
			</div>
			<div class="flex items-center gap-2">
				<button
					v-for="p in periods"
					:key="p.value"
					class="px-3 py-1.5 text-xs font-medium rounded-full transition-colors"
					:class="period === p.value
						? 'bg-primary/10 text-primary'
						: 'text-muted-foreground hover:bg-muted/50'"
					@click="period = p.value; refresh()"
				>
					{{ p.label }}
				</button>
			</div>
		</div>

		<!-- Token Balance & Limits -->
		<div v-if="orgTokenInfo" class="ios-card p-4">
			<div class="flex items-center justify-between mb-3">
				<h4 class="text-sm font-semibold text-foreground">Token Balance</h4>
				<span v-if="orgTokenInfo.billingPeriodStart" class="text-[10px] text-muted-foreground">
					Billing period started {{ new Date(orgTokenInfo.billingPeriodStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }}
				</span>
			</div>
			<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
				<!-- Balance -->
				<div>
					<span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Balance</span>
					<p class="text-xl font-bold" :class="orgTokenInfo.balance !== null && orgTokenInfo.balance <= 0 ? 'text-destructive' : 'text-foreground'">
						{{ orgTokenInfo.balance !== null ? formatNumber(orgTokenInfo.balance) : 'Unlimited' }}
					</p>
				</div>
				<!-- Monthly Limit -->
				<div>
					<span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Monthly Limit</span>
					<p class="text-xl font-bold text-foreground">
						{{ orgTokenInfo.limit !== null ? formatNumber(orgTokenInfo.limit) : 'Unlimited' }}
					</p>
				</div>
				<!-- Used This Period -->
				<div>
					<span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Used This Period</span>
					<p class="text-xl font-bold text-foreground">{{ formatNumber(orgTokenInfo.used) }}</p>
				</div>
			</div>
			<!-- Usage bar -->
			<div v-if="orgTokenInfo.limit" class="mt-3">
				<div class="w-full h-2 bg-muted/30 rounded-full overflow-hidden">
					<div
						class="h-full rounded-full transition-all"
						:class="orgTokenInfo.used / orgTokenInfo.limit > 0.8 ? 'bg-destructive' : orgTokenInfo.used / orgTokenInfo.limit > 0.6 ? 'bg-warning' : 'bg-primary'"
						:style="{ width: Math.min(100, (orgTokenInfo.used / orgTokenInfo.limit) * 100) + '%' }"
					/>
				</div>
				<p class="text-[10px] text-muted-foreground mt-1">
					{{ formatNumber(orgTokenInfo.used) }} / {{ formatNumber(orgTokenInfo.limit) }} tokens used
					({{ Math.round((orgTokenInfo.used / orgTokenInfo.limit) * 100) }}%)
				</p>
			</div>
			<!-- Depleted warning -->
			<div v-if="orgTokenInfo.balance !== null && orgTokenInfo.balance <= 0" class="mt-3 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20">
				<p class="text-[11px] text-destructive">
					Token balance depleted. AI features are disabled until more tokens are purchased.
				</p>
			</div>
		</div>

		<!-- First load only: skeletons (cards + reserved chart height). Later
		     refetches keep the content below mounted and just dim it, so nothing
		     collapses and the chart never unmounts/jumps. -->
		<div v-if="firstLoad" class="space-y-6">
			<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
				<div v-for="i in 4" :key="i" class="ios-card p-4 animate-pulse">
					<div class="h-3 bg-muted/40 rounded w-20 mb-3" />
					<div class="h-7 bg-muted/40 rounded w-16" />
				</div>
			</div>
			<div class="ios-card h-72 animate-pulse" />
		</div>

		<div
			v-else-if="stats"
			class="space-y-6 transition-opacity duration-300"
			:class="{ 'opacity-50 pointer-events-none': loading }"
		>
			<!-- Stat cards -->
			<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
				<div class="ios-card p-4">
					<div class="flex items-center gap-2 mb-2">
						<div class="h-8 w-8 rounded-full bg-blue-500/10 flex items-center justify-center">
							<UIcon name="i-heroicons-bolt" class="w-4 h-4 text-blue-500" />
						</div>
					</div>
					<span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Requests</span>
					<p class="text-2xl font-bold text-foreground">{{ formatNumber(stats.totalRequests) }}</p>
				</div>
				<div class="ios-card p-4">
					<div class="flex items-center gap-2 mb-2">
						<div class="h-8 w-8 rounded-full bg-purple-500/10 flex items-center justify-center">
							<UIcon name="i-heroicons-cpu-chip" class="w-4 h-4 text-purple-500" />
						</div>
					</div>
					<span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tokens</span>
					<p class="text-2xl font-bold text-foreground">{{ formatNumber(stats.totalTokens) }}</p>
					<p class="text-[10px] text-muted-foreground mt-0.5">{{ formatNumber(stats.totalInput) }} in / {{ formatNumber(stats.totalOutput) }} out</p>
				</div>
				<div class="ios-card p-4">
					<div class="flex items-center gap-2 mb-2">
						<div class="h-8 w-8 rounded-full bg-success/10 flex items-center justify-center">
							<UIcon name="i-heroicons-currency-dollar" class="w-4 h-4 text-success" />
						</div>
					</div>
					<span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Est. Cost</span>
					<p class="text-2xl font-bold text-foreground">${{ stats.totalCost.toFixed(2) }}</p>
				</div>
				<div class="ios-card p-4">
					<div class="flex items-center gap-2 mb-2">
						<div class="h-8 w-8 rounded-full bg-warning/10 flex items-center justify-center">
							<UIcon name="i-heroicons-users" class="w-4 h-4 text-warning" />
						</div>
					</div>
					<span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Active Users</span>
					<p class="text-2xl font-bold text-foreground">{{ stats.activeUsers }}</p>
				</div>
			</div>

			<!-- Usage over time chart -->
			<div v-if="stats.daily?.length > 1" class="ios-card p-4">
				<h4 class="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Usage Over Time</h4>
				<ClientOnly>
					<!-- The fixed height bounds ONLY the chart; the legend is a
					     sibling below it so it flows inside the card instead of
					     being pushed past the h-64 box (which overflowed the card). -->
					<div class="h-64">
						<ChartContainer :config="lineChartConfig" class="aspect-auto h-full w-full">
							<VisXYContainer :data="dailyChartData" :padding="{ top: 10 }" :y-domain="[0, undefined]">
								<VisLine
									:x="(d) => d.index"
									:y="[(d) => d.input, (d) => d.output]"
									:color="[lineChartConfig.input.color, lineChartConfig.output.color]"
									:curve-type="CurveType.MonotoneX"
								/>
								<VisAxis type="x" :x="(d) => d.index" :tick-values="dailyTickValues" :tick-format="(i) => { const data = dailyChartData; const idx = Math.round(i); return data && idx >= 0 && idx < data.length ? data[idx]?.label || '' : ''; }" :grid-line="false" :tick-line="false" :domain-line="false" />
								<VisAxis type="y" :grid-line="true" :tick-line="false" :domain-line="false" />
								<ChartCrosshair
									:template="lineTooltip"
									:color="[lineChartConfig.input.color, lineChartConfig.output.color]"
								/>
							</VisXYContainer>
						</ChartContainer>
					</div>
					<div class="flex items-center justify-center gap-6 mt-3 text-xs text-muted-foreground">
						<span class="flex items-center gap-1.5">
							<span class="w-3 h-0.5 rounded-full bg-blue-500"></span>
							Input Tokens
						</span>
						<span class="flex items-center gap-1.5">
							<span class="w-3 h-0.5 rounded-full bg-purple-500"></span>
							Output Tokens
						</span>
					</div>
				</ClientOnly>
			</div>

			<!-- Usage by endpoint -->
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
				<div v-if="endpointData" class="ios-card p-4">
					<h4 class="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">By Feature</h4>
					<div class="space-y-3">
						<div v-for="ep in endpointData.endpoints" :key="ep.endpoint" class="flex items-center gap-3">
							<div class="flex-1 min-w-0">
								<div class="flex items-center justify-between mb-1">
									<span class="text-sm font-medium text-foreground truncate">{{ ep.label }}</span>
									<span class="text-xs text-muted-foreground ml-2">{{ formatNumber(ep.totalTokens) }} tokens</span>
								</div>
								<div class="h-2 rounded-full bg-muted/30 overflow-hidden">
									<div
										class="h-full rounded-full bg-primary/60 transition-all"
										:style="{ width: `${maxEndpointTokens ? (ep.totalTokens / maxEndpointTokens) * 100 : 0}%` }"
									/>
								</div>
							</div>
							<span class="text-xs font-medium text-muted-foreground w-12 text-right">{{ ep.requests }}</span>
						</div>
					</div>
				</div>

				<!-- Usage by member (org-wide viewers only). Rows open a highlights
				     slide-over; the org view here stays put underneath. -->
				<div v-if="userData && viewScope === 'all'" class="ios-card p-4">
					<h4 class="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">By Member</h4>
					<div class="space-y-1">
						<button
							v-for="u in userData.users.slice(0, 10)"
							:key="u.id"
							type="button"
							class="w-full flex items-center gap-3 text-left rounded-lg px-2 py-1.5 -mx-2 transition-colors hover:bg-muted/50"
							@click="openMember(u)"
						>
							<div class="w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center text-xs font-semibold text-muted-foreground flex-shrink-0">
								{{ u.name?.charAt(0)?.toUpperCase() || '?' }}
							</div>
							<div class="flex-1 min-w-0">
								<div class="flex items-center justify-between">
									<span class="text-sm font-medium text-foreground truncate">{{ u.name }}</span>
									<span class="text-xs text-muted-foreground ml-2">{{ formatNumber(u.totalTokens) }}</span>
								</div>
								<span class="text-[10px] text-muted-foreground">{{ u.requests }} requests · ${{ u.cost.toFixed(2) }}</span>
							</div>
							<UIcon name="i-heroicons-chevron-right" class="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
						</button>
						<p v-if="!userData.users.length" class="text-sm text-muted-foreground text-center py-4">No usage data yet</p>
					</div>
				</div>
			</div>

			<!-- Per-user budgets (admin only) -->
			<div v-if="userBudgets.length" class="ios-card p-4">
				<h4 class="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Per-User Token Budgets</h4>
				<div class="space-y-2">
					<div v-for="ub in userBudgets" :key="ub.userId" class="flex items-center gap-3 p-2 rounded-lg bg-muted/10">
						<div class="w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center text-xs font-semibold text-muted-foreground flex-shrink-0">
							{{ ub.name?.charAt(0)?.toUpperCase() || '?' }}
						</div>
						<div class="flex-1 min-w-0">
							<span class="text-sm font-medium text-foreground truncate">{{ ub.name }}</span>
							<div v-if="ub.budget" class="mt-1">
								<div class="w-full h-1.5 bg-muted/30 rounded-full overflow-hidden">
									<div
										class="h-full rounded-full transition-all"
										:class="ub.used / ub.budget > 0.8 ? 'bg-destructive' : 'bg-primary'"
										:style="{ width: Math.min(100, (ub.used / ub.budget) * 100) + '%' }"
									/>
								</div>
								<p class="text-[10px] text-muted-foreground mt-0.5">
									{{ formatNumber(ub.used) }} / {{ formatNumber(ub.budget) }}
								</p>
							</div>
							<p v-else class="text-[10px] text-muted-foreground">No budget set</p>
						</div>
						<span v-if="ub.isLowUsage" class="text-[10px] px-1.5 py-0.5 rounded bg-warning/10 text-warning font-medium">Low Usage</span>
					</div>
				</div>
			</div>

			<!-- Recent activity -->
			<div v-if="recentData?.activity?.length" class="ios-card p-4">
				<h4 class="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Recent Activity</h4>
				<div class="space-y-2 max-h-80 overflow-y-auto">
					<div v-for="item in recentData.activity" :key="item.id" class="flex items-center gap-3 py-2 border-b border-border/30 last:border-0">
						<div class="w-7 h-7 rounded-full bg-muted/50 flex items-center justify-center text-[10px] font-semibold text-muted-foreground flex-shrink-0">
							{{ item.userName?.charAt(0)?.toUpperCase() || '?' }}
						</div>
						<div class="flex-1 min-w-0">
							<span class="text-sm text-foreground">{{ item.userName }}</span>
							<span class="text-xs text-muted-foreground ml-1.5">{{ item.endpointLabel }}</span>
						</div>
						<div class="text-right flex-shrink-0">
							<span class="text-xs font-medium text-foreground">{{ formatNumber(item.totalTokens) }}</span>
							<p class="text-[10px] text-muted-foreground">{{ formatTimeAgo(item.date) }}</p>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Admin Token Management -->
		<div v-if="canManageAI">
			<div class="flex items-center justify-between mb-4">
				<h4 class="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Token Management</h4>
				<UButton
					color="gray"
					variant="ghost"
					size="xs"
					:icon="showManagement ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
					@click="showManagement = !showManagement"
				>
					{{ showManagement ? 'Hide' : 'Manage' }}
				</UButton>
			</div>
			<OrganizationAITokenManagement
				v-if="showManagement"
				:organization-id="organizationId"
			/>
		</div>

		<!-- Empty state -->
		<div v-else-if="!stats" class="flex flex-col items-center justify-center py-16">
			<div class="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
				<EarnestIcon class="w-6 h-6 text-primary" />
			</div>
			<h3 class="font-semibold text-foreground mb-1">No usage data yet</h3>
			<p class="text-sm text-muted-foreground text-center max-w-sm">
				Earnest usage will appear here as your team uses Earnest features like Chat, Marketing Intelligence, Social, and Email generators.
			</p>
		</div>

			<!-- Per-member highlights slide-over (right sheet) -->
			<OrganizationAIUsageMemberSheet
				v-model:open="memberSheetOpen"
				:organization-id="organizationId"
				:period="period"
				:member="selectedMember"
			/>
		</template>
	</div>
</template>

<script setup lang="ts">
import { ChartContainer, ChartCrosshair, ChartTooltipContent, componentToString } from '~/components/ui/chart';
import { VisXYContainer, VisLine, VisAxis } from '@unovis/vue';
import { CurveType } from '@unovis/ts';

const props = defineProps({
	organizationId: {
		type: String,
		default: null,
	},
	// When true, the admin Token Management panel starts expanded rather than
	// collapsed behind the "Manage" toggle. The dedicated "AI & Tokens" org
	// floor passes this since managing spend is the whole reason to land there;
	// the classic /organization page leaves it collapsed.
	manageExpanded: {
		type: Boolean,
		default: false,
	},
});

const period = ref('month');
const loading = ref(true);
const stats = ref<any>(null);
const endpointData = ref<any>(null);
const userData = ref<any>(null);
const recentData = ref<any>(null);
const orgTokenInfo = ref<{ balance: number | null; limit: number | null; used: number; billingPeriodStart: string | null } | null>(null);
const userBudgets = ref<{ userId: string; name: string; budget: number | null; used: number; isLowUsage: boolean }[]>([]);
const showManagement = ref(props.manageExpanded);

// How much the server let us see: 'all' = org-wide, 'own' = just this member.
// Authoritative source of truth for what to render (drives the By Member panel
// + headings), decided server-side from the session role — not the client's
// permission guess, so there's no async-role race on cold mount.
const viewScope = ref<'all' | 'own'>('all');
// Set true only when the server refuses access entirely (non-member 403).
const accessDenied = ref(false);
// Admin per-member drill-down: opens a right slide-over with that member's
// highlights. The org-wide view underneath is never touched, so closing the
// sheet is instant. Only reachable in 'all' scope (By Member is hidden in 'own'
// scope, so a member can never open a colleague).
const memberSheetOpen = ref(false);
const selectedMember = ref<{ id: string; name: string } | null>(null);

// Skeletons only on the very first load. Once we have data, subsequent
// refetches (period change) keep the content mounted and just dim it — no
// collapse-to-skeletons, so the chart never unmounts and the layout can't jump.
const firstLoad = computed(() => loading.value && !stats.value);

// Check if current user can manage AI settings (owner/admin) and view all usage
const { canAccess, hasPermission } = useOrgRole();
const canManageAI = computed(() => canAccess('org_settings'));
const canViewAll = computed(() => hasPermission('ai_usage', 'read'));

const periods = [
	{ label: '24h', value: 'day' },
	{ label: '7d', value: 'week' },
	{ label: '30d', value: 'month' },
	{ label: 'All', value: 'all' },
];

const lineChartConfig = {
	input: { label: 'Input Tokens', color: 'rgba(59, 130, 246, 0.8)' },
	output: { label: 'Output Tokens', color: 'rgba(168, 85, 247, 0.8)' },
};

const lineTooltip = componentToString(lineChartConfig, ChartTooltipContent, { hideLabel: true });

const dailyChartData = computed(() => {
	if (!stats.value?.daily) return [];
	return stats.value.daily.map((d: any, i: number) => ({
		index: i,
		// `d.date` is a calendar day string ("2026-07-11"). `new Date(str)` parses
		// it as UTC midnight, which then renders as the PREVIOUS day in any negative
		// UTC-offset timezone. Build a local Date from the parts so the label shows
		// the actual bucket day.
		label: (() => {
			const [y, m, day] = String(d.date).split('-').map(Number);
			return new Date(y, (m || 1) - 1, day || 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
		})(),
		input: d.input,
		output: d.output,
	}));
});

// One x-axis tick per actual day. Without this, VisAxis auto-generates a fixed
// number of ticks across the numeric domain, which rounds fractional positions
// to duplicate day labels (e.g. "Jul 12, Jul 12, Jul 13") when there are only a
// few data points.
const dailyTickValues = computed(() => dailyChartData.value.map((d) => d.index));

const maxEndpointTokens = computed(() => {
	if (!endpointData.value?.endpoints?.length) return 0;
	return Math.max(...endpointData.value.endpoints.map((e: any) => e.totalTokens));
});

function formatNumber(n: number): string {
	if (!n) return '0';
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return String(n);
}

function formatTimeAgo(dateStr: string): string {
	const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
	if (seconds < 60) return 'just now';
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

const orgItems = useDirectusItems('organizations');

async function loadOrgTokenInfo() {
	if (!props.organizationId) return;
	try {
		const org = await orgItems.get(props.organizationId, {
			fields: ['ai_token_balance', 'ai_token_limit_monthly', 'ai_tokens_used_this_period', 'ai_billing_period_start'],
		}) as any;
		if (org) {
			orgTokenInfo.value = {
				balance: org.ai_token_balance ?? null,
				limit: org.ai_token_limit_monthly ?? null,
				used: Number(org.ai_tokens_used_this_period) || 0,
				billingPeriodStart: org.ai_billing_period_start ?? null,
			};
		}
	} catch {
		// Org may not have token fields yet
	}
}

async function loadUserBudgets() {
	if (!props.organizationId || !canManageAI.value) return;
	try {
		// Source from the admin members endpoint. It scopes ai_preferences by the
		// org's member ids (the collection is a per-user singleton — filtering it
		// by `organization` returns nothing), and already merges month-to-date
		// usage. Only members with a budget or low-usage flag are surfaced here.
		const data = await $fetch<{ members: any[] }>('/api/ai/manage/members', {
			params: { organizationId: props.organizationId },
		});

		userBudgets.value = (data.members || [])
			.filter((m: any) => m.tokenBudget != null || m.lowUsageMode)
			.map((m: any) => ({
				userId: m.id,
				name: m.name || 'Unknown',
				budget: m.tokenBudget ?? null,
				used: m.tokensUsedThisMonth || 0,
				isLowUsage: m.lowUsageMode === true,
			}));
	} catch {
		// Silently fail
	}
}

async function refresh() {
	loading.value = true;
	const params: Record<string, string> = { period: period.value };
	if (props.organizationId) params.organizationId = props.organizationId;
	const qs = new URLSearchParams(params).toString();

	try {
		const [statsRes, endpointRes, userRes, recentRes] = await Promise.all([
			$fetch<any>(`/api/ai/usage/stats?${qs}`),
			$fetch(`/api/ai/usage/by-endpoint?${qs}`),
			$fetch(`/api/ai/usage/by-user?${qs}`),
			$fetch(`/api/ai/usage/recent?${qs}&limit=20`),
		]);
		accessDenied.value = false;
		stats.value = statsRes;
		endpointData.value = endpointRes;
		userData.value = userRes;
		recentData.value = recentRes;
		// Server decides scope from the session role — trust it over the client.
		if (statsRes?.scope === 'own' || statsRes?.scope === 'all') viewScope.value = statsRes.scope;

		// Load token info after main data (userBudgets needs userData)
		await Promise.all([loadOrgTokenInfo(), loadUserBudgets()]);
	} catch (err: any) {
		// 403 = not a member of this org → show the access-restricted state.
		const status = err?.statusCode || err?.response?.status;
		if (status === 403 || status === 401) accessDenied.value = true;
		console.error('[AIUsage] Failed to load:', err);
	} finally {
		loading.value = false;
	}
}

// Open the per-member highlights slide-over (org-wide viewers only). The
// org-wide view underneath is left untouched — the sheet fetches its own
// member-scoped data — so closing it is instant.
function openMember(u: { id: string; name: string }) {
	selectedMember.value = { id: u.id, name: u.name };
	memberSheetOpen.value = true;
}

onMounted(refresh);

// `canManageAI` (org_settings) resolves async via useOrgRole — when it flips
// true on a cold mount, pull in the admin-only per-user budgets it gates.
watch(canManageAI, (ok) => {
	if (ok) loadUserBudgets();
});
</script>
