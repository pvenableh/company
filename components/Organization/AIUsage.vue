<template>
	<div class="space-y-6">
		<!-- Period selector -->
		<div class="flex items-center justify-between">
			<h3 class="text-lg font-semibold text-foreground">AI Usage</h3>
			<div class="flex items-center gap-2">
				<button
					v-for="p in periods"
					:key="p.value"
					class="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
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
					<p class="text-xl font-bold" :class="orgTokenInfo.balance !== null && orgTokenInfo.balance <= 0 ? 'text-red-400' : 'text-foreground'">
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
						:class="orgTokenInfo.used / orgTokenInfo.limit > 0.8 ? 'bg-red-500' : orgTokenInfo.used / orgTokenInfo.limit > 0.6 ? 'bg-amber-500' : 'bg-primary'"
						:style="{ width: Math.min(100, (orgTokenInfo.used / orgTokenInfo.limit) * 100) + '%' }"
					/>
				</div>
				<p class="text-[10px] text-muted-foreground mt-1">
					{{ formatNumber(orgTokenInfo.used) }} / {{ formatNumber(orgTokenInfo.limit) }} tokens used
					({{ Math.round((orgTokenInfo.used / orgTokenInfo.limit) * 100) }}%)
				</p>
			</div>
			<!-- Depleted warning -->
			<div v-if="orgTokenInfo.balance !== null && orgTokenInfo.balance <= 0" class="mt-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
				<p class="text-[11px] text-red-400">
					Token balance depleted. AI features are disabled until more tokens are purchased.
				</p>
			</div>
		</div>

		<!-- Loading -->
		<div v-if="loading" class="grid grid-cols-2 lg:grid-cols-4 gap-3">
			<div v-for="i in 4" :key="i" class="ios-card p-4 animate-pulse">
				<div class="h-3 bg-muted/40 rounded w-20 mb-3" />
				<div class="h-7 bg-muted/40 rounded w-16" />
			</div>
		</div>

		<template v-else-if="stats">
			<!-- Stat cards -->
			<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
				<div class="ios-card p-4">
					<div class="flex items-center gap-2 mb-2">
						<div class="h-8 w-8 rounded-xl bg-blue-500/10 flex items-center justify-center">
							<UIcon name="i-heroicons-bolt" class="w-4 h-4 text-blue-500" />
						</div>
					</div>
					<span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Requests</span>
					<p class="text-2xl font-bold text-foreground">{{ formatNumber(stats.totalRequests) }}</p>
				</div>
				<div class="ios-card p-4">
					<div class="flex items-center gap-2 mb-2">
						<div class="h-8 w-8 rounded-xl bg-purple-500/10 flex items-center justify-center">
							<UIcon name="i-heroicons-cpu-chip" class="w-4 h-4 text-purple-500" />
						</div>
					</div>
					<span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tokens</span>
					<p class="text-2xl font-bold text-foreground">{{ formatNumber(stats.totalTokens) }}</p>
					<p class="text-[10px] text-muted-foreground mt-0.5">{{ formatNumber(stats.totalInput) }} in / {{ formatNumber(stats.totalOutput) }} out</p>
				</div>
				<div class="ios-card p-4">
					<div class="flex items-center gap-2 mb-2">
						<div class="h-8 w-8 rounded-xl bg-green-500/10 flex items-center justify-center">
							<UIcon name="i-heroicons-currency-dollar" class="w-4 h-4 text-green-500" />
						</div>
					</div>
					<span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Est. Cost</span>
					<p class="text-2xl font-bold text-foreground">${{ stats.totalCost.toFixed(2) }}</p>
				</div>
				<div class="ios-card p-4">
					<div class="flex items-center gap-2 mb-2">
						<div class="h-8 w-8 rounded-xl bg-amber-500/10 flex items-center justify-center">
							<UIcon name="i-heroicons-users" class="w-4 h-4 text-amber-500" />
						</div>
					</div>
					<span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Active Users</span>
					<p class="text-2xl font-bold text-foreground">{{ stats.activeUsers }}</p>
				</div>
			</div>

			<!-- Usage over time chart -->
			<div v-if="stats.daily?.length > 1" class="ios-card p-4">
				<h4 class="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Usage Over Time</h4>
				<div class="h-64">
					<ClientOnly>
						<ChartContainer :config="lineChartConfig" class="aspect-auto h-full w-full">
							<VisXYContainer :data="dailyChartData" :padding="{ top: 10 }" :y-domain="[0, undefined]">
								<VisLine
									:x="(d) => d.index"
									:y="[(d) => d.input, (d) => d.output]"
									:color="[lineChartConfig.input.color, lineChartConfig.output.color]"
									:curve-type="CurveType.MonotoneX"
								/>
								<VisAxis type="x" :x="(d) => d.index" :tick-format="(i) => { const idx = Math.round(i); return idx >= 0 && idx < dailyChartData.length ? dailyChartData[idx]?.label || '' : ''; }" :grid-line="false" :tick-line="false" :domain-line="false" />
								<VisAxis type="y" :grid-line="true" :tick-line="false" :domain-line="false" />
								<ChartCrosshair
									:template="lineTooltip"
									:color="[lineChartConfig.input.color, lineChartConfig.output.color]"
								/>
							</VisXYContainer>
						</ChartContainer>
						<div class="flex items-center justify-center gap-6 mt-2 text-xs text-muted-foreground">
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

				<!-- Usage by member -->
				<div v-if="userData" class="ios-card p-4">
					<h4 class="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">By Member</h4>
					<div class="space-y-3">
						<div v-for="u in userData.users.slice(0, 10)" :key="u.id" class="flex items-center gap-3">
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
						</div>
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
										:class="ub.used / ub.budget > 0.8 ? 'bg-red-500' : 'bg-primary'"
										:style="{ width: Math.min(100, (ub.used / ub.budget) * 100) + '%' }"
									/>
								</div>
								<p class="text-[10px] text-muted-foreground mt-0.5">
									{{ formatNumber(ub.used) }} / {{ formatNumber(ub.budget) }}
								</p>
							</div>
							<p v-else class="text-[10px] text-muted-foreground">No budget set</p>
						</div>
						<span v-if="ub.isLowUsage" class="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-medium">Low Usage</span>
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
		</template>

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
			<div class="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
				<UIcon name="i-heroicons-sparkles" class="w-6 h-6 text-primary" />
			</div>
			<h3 class="font-semibold text-foreground mb-1">No usage data yet</h3>
			<p class="text-sm text-muted-foreground text-center max-w-sm">
				AI usage will appear here as your team uses AI features like Chat, Marketing Intelligence, Social, and Email generators.
			</p>
		</div>
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
});

const period = ref('month');
const loading = ref(true);
const stats = ref<any>(null);
const endpointData = ref<any>(null);
const userData = ref<any>(null);
const recentData = ref<any>(null);
const orgTokenInfo = ref<{ balance: number | null; limit: number | null; used: number; billingPeriodStart: string | null } | null>(null);
const userBudgets = ref<{ userId: string; name: string; budget: number | null; used: number; isLowUsage: boolean }[]>([]);
const showManagement = ref(false);

// Check if current user can manage AI settings (owner/admin)
const { canAccess } = useOrgRole();
const canManageAI = computed(() => canAccess('org_settings'));

const periods = [
	{ label: '24h', value: 'day' },
	{ label: '7d', value: 'week' },
	{ label: '30d', value: 'month' },
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
		label: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
		input: d.input,
		output: d.output,
	}));
});

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
const prefItems = useDirectusItems('ai_preferences');

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
	if (!props.organizationId) return;
	try {
		const prefs = await prefItems.list({
			fields: ['user.id', 'user.first_name', 'user.last_name', 'token_budget_monthly', 'low_usage_mode'],
			filter: { organization: { _eq: props.organizationId } },
			limit: 50,
		}) as any[];

		if (!prefs?.length) return;

		// Get user usage this month
		const monthStart = new Date();
		monthStart.setDate(1);
		monthStart.setHours(0, 0, 0, 0);

		userBudgets.value = prefs
			.filter((p: any) => p.user)
			.map((p: any) => {
				const u = p.user;
				// Match with userData for usage info
				const userUsage = userData.value?.users?.find((ud: any) => ud.id === u.id);
				return {
					userId: u.id,
					name: [u.first_name, u.last_name].filter(Boolean).join(' ') || 'Unknown',
					budget: p.token_budget_monthly ?? null,
					used: userUsage?.totalTokens || 0,
					isLowUsage: p.low_usage_mode === true,
				};
			});
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
			$fetch(`/api/ai/usage/stats?${qs}`),
			$fetch(`/api/ai/usage/by-endpoint?${qs}`),
			$fetch(`/api/ai/usage/by-user?${qs}`),
			$fetch(`/api/ai/usage/recent?${qs}&limit=20`),
		]);
		stats.value = statsRes;
		endpointData.value = endpointRes;
		userData.value = userRes;
		recentData.value = recentRes;

		// Load token info after main data (userBudgets needs userData)
		await Promise.all([loadOrgTokenInfo(), loadUserBudgets()]);
	} catch (err) {
		console.error('[AIUsage] Failed to load:', err);
	} finally {
		loading.value = false;
	}
}

onMounted(refresh);
</script>
