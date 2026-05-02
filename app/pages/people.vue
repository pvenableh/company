<template>
	<LayoutPageContainer>
		<!-- Header -->
		<div class="flex items-center justify-between mb-6">
			<div>
				<h1 class="text-xl font-semibold">People Intelligence</h1>
				<p class="text-[11px] text-muted-foreground mt-0.5">
					Pipeline, audience, and the relationships that move the studio.
				</p>
			</div>
			<div class="flex items-center gap-2">
				<NuxtLink to="/contacts?new=true" class="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted/50 transition-colors">
					<Icon name="lucide:plus" class="w-4 h-4" /> Contact
				</NuxtLink>
				<NuxtLink to="/clients?new=true" class="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
					<Icon name="lucide:plus" class="w-4 h-4" /> Client
				</NuxtLink>
			</div>
		</div>

		<!-- Hero stat row with sparklines -->
		<div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
			<NuxtLink
				to="/contacts"
				class="ios-card p-4 hover:ring-1 hover:ring-white/10 transition-all flex flex-col gap-2"
			>
				<div class="flex items-center justify-between">
					<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Contacts</p>
					<Icon name="lucide:users" class="w-3.5 h-3.5 text-muted-foreground" />
				</div>
				<div class="flex items-baseline gap-2">
					<p class="text-2xl font-bold">{{ contactCount }}</p>
					<span v-if="contactDelta" class="text-[10px] font-medium" :class="deltaColor(contactDelta)">
						{{ formatDelta(contactDelta) }}
					</span>
				</div>
				<ClientOnly>
					<div v-if="contactGrowthSeries.length" class="h-8 -mx-1">
						<VisXYContainer :data="contactGrowthSeries" :margin="{ left: 0, right: 0, top: 2, bottom: 2 }">
							<VisLine
								:x="(d: any) => d.weekIdx"
								:y="(d: any) => d.count"
								:color="['hsl(217, 91%, 60%)']"
								:curve-type="CurveType.MonotoneX"
							/>
						</VisXYContainer>
					</div>
				</ClientOnly>
			</NuxtLink>

			<NuxtLink
				to="/leads"
				class="ios-card p-4 hover:ring-1 hover:ring-white/10 transition-all flex flex-col gap-2"
			>
				<div class="flex items-center justify-between">
					<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Pipeline</p>
					<Icon name="lucide:trending-up" class="w-3.5 h-3.5 text-muted-foreground" />
				</div>
				<div class="flex items-baseline gap-2">
					<p class="text-2xl font-bold">{{ leadCount }}</p>
					<span class="text-[10px] text-muted-foreground">
						leads
					</span>
				</div>
				<p class="text-[11px] text-emerald-500/90 font-medium">
					${{ formatNumber(pipelineValue) }} value
				</p>
			</NuxtLink>

			<NuxtLink
				to="/clients"
				class="ios-card p-4 hover:ring-1 hover:ring-white/10 transition-all flex flex-col gap-2"
			>
				<div class="flex items-center justify-between">
					<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Clients</p>
					<Icon name="lucide:building-2" class="w-3.5 h-3.5 text-muted-foreground" />
				</div>
				<div class="flex items-baseline gap-2">
					<p class="text-2xl font-bold">{{ clientCount }}</p>
					<span class="text-[10px] text-muted-foreground">
						{{ activeClientCount }} active
					</span>
				</div>
				<p class="text-[11px] text-muted-foreground">
					${{ formatNumber(yearRevenue) }} YTD revenue
				</p>
			</NuxtLink>

			<NuxtLink
				to="/carddesk"
				class="ios-card p-4 hover:ring-1 hover:ring-white/10 transition-all flex flex-col gap-2"
			>
				<div class="flex items-center justify-between">
					<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Network</p>
					<Icon name="lucide:scan" class="w-3.5 h-3.5 text-muted-foreground" />
				</div>
				<div class="flex items-baseline gap-2">
					<p class="text-2xl font-bold">{{ networkCount }}</p>
					<span class="text-[10px] text-muted-foreground">
						captured
					</span>
				</div>
				<p class="text-[11px] text-muted-foreground">
					{{ partnerCount }} partners
				</p>
			</NuxtLink>
		</div>

		<!-- Charts row -->
		<div class="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
			<!-- Contact growth -->
			<div class="ios-card p-5 lg:col-span-2">
				<div class="flex items-center justify-between mb-3">
					<h3 class="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Audience Growth — last 90 days</h3>
					<span v-if="contactGrowthSeries.length" class="text-[10px] text-muted-foreground">
						+{{ contactsLast90 }} new contacts
					</span>
				</div>
				<div class="h-[160px] overflow-hidden">
					<ClientOnly>
						<div v-if="contactGrowthSeries.length" class="h-full">
							<VisXYContainer :data="contactGrowthSeries" :height="160" :margin="{ left: 30, right: 8, top: 8, bottom: 24 }">
								<VisLine
									:x="(d: any) => d.weekIdx"
									:y="(d: any) => d.cumulative"
									:color="['hsl(217, 91%, 60%)']"
									:line-width="2"
									:curve-type="CurveType.MonotoneX"
								/>
								<VisAxis
									type="x"
									:tick-line="false"
									:domain-line="false"
									:grid-line="false"
									:tick-format="(v: number) => contactGrowthSeries[Math.round(v)]?.label ?? ''"
									:num-ticks="6"
								/>
								<VisAxis
									type="y"
									:tick-line="false"
									:domain-line="false"
									:grid-line="true"
									:num-ticks="4"
								/>
							</VisXYContainer>
						</div>
						<div v-else class="h-full flex items-center justify-center text-[11px] text-muted-foreground">
							Not enough data yet — contacts will appear here as you add them.
						</div>
					</ClientOnly>
				</div>
			</div>

			<!-- Network composition donut -->
			<div class="ios-card p-5">
				<div class="flex items-center justify-between mb-3">
					<h3 class="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Network Composition</h3>
					<span class="text-[10px] text-muted-foreground">{{ networkTotal }} total</span>
				</div>
				<ClientOnly>
					<div v-if="dataLoaded && networkTotal > 0" class="flex flex-col items-center">
						<div class="h-[140px] w-full relative">
							<VisSingleContainer :data="networkComposition" :height="140">
								<VisDonut
									:value="(d: any) => d.value"
									:arc-width="28"
									:pad-angle="0.02"
									:corner-radius="3"
									:color="(d: any, i: number) => networkColors[i % networkColors.length]"
									:show-empty-segments="false"
									:arc-label="() => ''"
								/>
							</VisSingleContainer>
							<div class="absolute inset-0 flex items-center justify-center pointer-events-none">
								<div class="text-center">
									<p class="text-2xl font-bold leading-none">{{ networkTotal }}</p>
									<p class="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">total</p>
								</div>
							</div>
						</div>
						<div class="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-3 w-full">
							<div
								v-for="(item, i) in networkComposition"
								:key="item.label"
								class="flex items-center gap-1.5 text-[11px]"
							>
								<span class="w-2 h-2 rounded-sm shrink-0" :style="{ background: networkColors[i % networkColors.length] }" />
								<span class="text-muted-foreground truncate">{{ item.label }}</span>
								<span class="ml-auto font-medium">{{ item.value }}</span>
							</div>
						</div>
					</div>
					<div v-else class="h-[160px] flex items-center justify-center text-[11px] text-muted-foreground">
						Add contacts to see your network composition.
					</div>
				</ClientOnly>
			</div>
		</div>

		<!-- Funnel + Top Clients row -->
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
			<!-- Lead pipeline funnel -->
			<div class="ios-card p-5">
				<div class="flex items-center justify-between mb-3">
					<h3 class="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Lead Pipeline</h3>
					<NuxtLink to="/leads" class="text-[10px] text-primary hover:underline">View all →</NuxtLink>
				</div>
				<div v-if="funnelStages.some(s => s.count > 0)" class="space-y-2">
					<div
						v-for="stage in funnelStages"
						:key="stage.key"
						class="group"
					>
						<div class="flex items-center gap-2 mb-0.5">
							<span class="text-[11px] font-medium capitalize w-24 shrink-0">{{ stage.label }}</span>
							<div class="flex-1 relative h-5 bg-muted/30 rounded-md overflow-hidden">
								<div
									class="absolute inset-y-0 left-0 rounded-md transition-all"
									:style="{ width: funnelBarWidth(stage.count) + '%', background: stage.color }"
								/>
								<span class="absolute inset-y-0 left-2 flex items-center text-[10px] font-medium text-foreground/90 z-10">
									{{ stage.count }}
								</span>
							</div>
						</div>
					</div>
				</div>
				<div v-else class="py-8 text-center text-[11px] text-muted-foreground">
					No leads in pipeline. <NuxtLink to="/leads?new=true" class="text-primary hover:underline">Add a lead →</NuxtLink>
				</div>
			</div>

			<!-- Top clients by revenue -->
			<div class="ios-card p-5">
				<div class="flex items-center justify-between mb-3">
					<h3 class="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Top Clients by Revenue</h3>
					<span class="text-[10px] text-muted-foreground">last 12 mo</span>
				</div>
				<div v-if="topClients.length" class="space-y-2">
					<div
						v-for="(client, i) in topClients"
						:key="client.id"
						class="flex items-center gap-3"
					>
						<span class="text-[10px] text-muted-foreground w-4">{{ i + 1 }}</span>
						<NuxtLink :to="`/clients/${client.id}`" class="flex-1 min-w-0 group">
							<div class="flex items-center gap-2 mb-0.5">
								<span class="text-[11px] font-medium truncate group-hover:text-primary">{{ client.name }}</span>
								<span class="text-[10px] text-muted-foreground ml-auto shrink-0">${{ formatNumber(client.revenue) }}</span>
							</div>
							<div class="h-1.5 bg-muted/30 rounded-full overflow-hidden">
								<div
									class="h-full rounded-full bg-emerald-500/70"
									:style="{ width: topClientBarWidth(client.revenue) + '%' }"
								/>
							</div>
						</NuxtLink>
					</div>
				</div>
				<div v-else class="py-8 text-center text-[11px] text-muted-foreground">
					No revenue data yet. <NuxtLink to="/invoices?new=true" class="text-primary hover:underline">Add an invoice →</NuxtLink>
				</div>
			</div>
		</div>

		<!-- Needs Attention -->
		<div v-if="needsAttention.length" class="ios-card p-5 mb-4">
			<h3 class="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">
				Needs Attention
				<span class="text-amber-400 ml-1">({{ needsAttention.length }})</span>
			</h3>
			<div class="space-y-0.5">
				<NuxtLink
					v-for="item in needsAttention"
					:key="item.id"
					:to="item.route"
					class="flex items-center justify-between py-2.5 px-2 -mx-2 rounded-md hover:bg-muted/30 transition-colors"
				>
					<div class="flex items-center gap-3 min-w-0 flex-1">
						<span
							class="w-2 h-2 rounded-full shrink-0"
							:class="item.urgency === 'high' ? 'bg-red-500' : 'bg-amber-500'"
						/>
						<div class="min-w-0">
							<p class="text-sm font-medium truncate">{{ item.name }}</p>
							<p class="text-[11px] text-muted-foreground">{{ item.reason }}</p>
						</div>
					</div>
					<span class="text-xs font-medium text-primary shrink-0 ml-3">{{ item.action }}</span>
				</NuxtLink>
			</div>
		</div>

		<!-- Unified search -->
		<div class="relative mb-4">
			<Icon name="i-heroicons-magnifying-glass" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
			<input
				v-model="search"
				type="text"
				placeholder="Search contacts, clients, and connections..."
				class="w-full rounded-lg border bg-background pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all placeholder:text-muted-foreground/60"
			/>
		</div>

		<!-- Quick links (only when not searching) -->
		<div v-if="!search" class="flex gap-2 mb-2 overflow-x-auto pb-1">
			<NuxtLink to="/contacts/import" class="flex items-center gap-1.5 px-3 py-2 ios-card hover:ring-1 hover:ring-white/10 transition-all shrink-0">
				<Icon name="lucide:upload" class="w-4 h-4 text-blue-400" />
				<span class="text-xs font-medium">Import CSV</span>
			</NuxtLink>
			<NuxtLink to="/carddesk" class="flex items-center gap-1.5 px-3 py-2 ios-card hover:ring-1 hover:ring-white/10 transition-all shrink-0">
				<Icon name="lucide:scan" class="w-4 h-4 text-purple-400" />
				<span class="text-xs font-medium">Scan Card</span>
			</NuxtLink>
			<NuxtLink to="/contacts" class="flex items-center gap-1.5 px-3 py-2 ios-card hover:ring-1 hover:ring-white/10 transition-all shrink-0">
				<Icon name="lucide:list" class="w-4 h-4 text-muted-foreground" />
				<span class="text-xs font-medium">All Contacts</span>
			</NuxtLink>
			<NuxtLink to="/leads" class="flex items-center gap-1.5 px-3 py-2 ios-card hover:ring-1 hover:ring-white/10 transition-all shrink-0">
				<Icon name="lucide:columns-3" class="w-4 h-4 text-sky-400" />
				<span class="text-xs font-medium">Pipeline Board</span>
			</NuxtLink>
			<NuxtLink to="/clients" class="flex items-center gap-1.5 px-3 py-2 ios-card hover:ring-1 hover:ring-white/10 transition-all shrink-0">
				<Icon name="lucide:building-2" class="w-4 h-4 text-muted-foreground" />
				<span class="text-xs font-medium">All Clients</span>
			</NuxtLink>
		</div>

		<!-- Search results -->
		<div v-else-if="searchLoading" class="py-12 text-center">
			<Icon name="lucide:loader-2" class="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
			<p class="text-sm text-muted-foreground mt-2">Searching...</p>
		</div>
		<div v-else-if="searchResults.length > 0" class="space-y-2">
			<p class="text-xs text-muted-foreground mb-3">{{ searchResults.length }} result{{ searchResults.length !== 1 ? 's' : '' }}</p>
			<NuxtLink
				v-for="result in searchResults"
				:key="`${result.source}-${result.id}`"
				:to="result.route"
				class="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors"
			>
				<div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white"
					:class="result.source === 'contacts' ? 'bg-orange-500' : result.source === 'clients' ? 'bg-red-500' : result.source === 'leads' ? 'bg-sky-500' : 'bg-purple-500'"
				>
					{{ result.initials }}
				</div>
				<div class="flex-1 min-w-0">
					<p class="text-sm font-medium text-foreground truncate">{{ result.name }}</p>
					<p class="text-xs text-muted-foreground truncate">{{ result.detail }}</p>
				</div>
				<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground uppercase tracking-wider">
					{{ result.source === 'carddesk' ? 'network' : result.source }}
				</span>
			</NuxtLink>
		</div>
		<div v-else-if="search && !searchLoading" class="py-12 text-center">
			<p class="text-sm text-muted-foreground">No results found for "{{ search }}"</p>
		</div>
	</LayoutPageContainer>
</template>

<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core';
import { VisXYContainer, VisLine, VisAxis, VisSingleContainer, VisDonut } from '@unovis/vue';
import { CurveType } from '@unovis/ts';

definePageMeta({ middleware: ['auth'] });
useHead({ title: 'People | Earnest' });

const { getContacts } = useContacts();
const { getClients } = useClients();
const { getLeads, getLeadStats } = useLeads();
const { fetchContacts: fetchCdContacts } = useCardDesk();
const { selectedOrg } = useOrganization();

const search = ref('');
const searchLoading = ref(false);
const searchResults = ref<Array<{
	id: string;
	name: string;
	detail: string;
	initials: string;
	source: string;
	route: string;
}>>([]);

// Hero counts
const contactCount = ref(0);
const leadCount = ref(0);
const clientCount = ref(0);
const networkCount = ref(0);
const activeClientCount = ref(0);
const partnerCount = ref(0);

const dataLoaded = ref(false);

// Charts data
const contactGrowthSeries = ref<Array<{ weekIdx: number; label: string; count: number; cumulative: number }>>([]);
const contactsLast90 = ref(0);
const contactDelta = ref(0); // 30d vs prior 30d
const pipelineValue = ref(0);
const yearRevenue = ref(0);
const funnelStages = ref<Array<{ key: string; label: string; count: number; color: string }>>([]);
const topClients = ref<Array<{ id: string; name: string; revenue: number }>>([]);

// Network composition donut
const networkColors = ['hsl(25, 95%, 55%)', 'hsl(199, 89%, 55%)', 'hsl(0, 72%, 55%)', 'hsl(280, 65%, 60%)'];
const networkComposition = computed(() => [
	{ label: 'Contacts', value: contactCount.value },
	{ label: 'Leads', value: leadCount.value },
	{ label: 'Clients', value: clientCount.value },
	{ label: 'Network', value: networkCount.value },
]);
const networkTotal = computed(() => networkComposition.value.reduce((s, x) => s + Number(x.value || 0), 0));

const STAGE_LABELS: Record<string, string> = {
	new: 'New',
	contacted: 'Contacted',
	qualified: 'Qualified',
	proposal_sent: 'Proposal Sent',
	negotiating: 'Negotiating',
	won: 'Won',
};
const STAGE_COLORS: Record<string, string> = {
	new: 'hsl(217, 91%, 60%)',
	contacted: 'hsl(199, 89%, 55%)',
	qualified: 'hsl(173, 78%, 45%)',
	proposal_sent: 'hsl(43, 95%, 55%)',
	negotiating: 'hsl(25, 95%, 55%)',
	won: 'hsl(142, 71%, 45%)',
};

const needsAttention = ref<Array<{ id: string; name: string; reason: string; urgency: 'high' | 'medium'; route: string; action: string }>>([]);

function formatNumber(n: number): string {
	if (!n) return '0';
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
	return String(Math.round(n));
}

function formatDelta(n: number): string {
	const sign = n > 0 ? '+' : '';
	return `${sign}${n}`;
}

function deltaColor(n: number): string {
	if (n > 0) return 'text-emerald-500';
	if (n < 0) return 'text-red-500';
	return 'text-muted-foreground';
}

const maxFunnelCount = computed(() => Math.max(1, ...funnelStages.value.map(s => s.count)));
function funnelBarWidth(count: number): number {
	return Math.max(2, (count / maxFunnelCount.value) * 100);
}

const maxClientRevenue = computed(() => Math.max(1, ...topClients.value.map(c => c.revenue)));
function topClientBarWidth(revenue: number): number {
	return Math.max(4, (revenue / maxClientRevenue.value) * 100);
}

async function loadIntelligence() {
	if (!selectedOrg.value) return;
	const orgId = selectedOrg.value;
	const today = new Date();
	const ninetyAgo = new Date(today.getTime() - 90 * 86_400_000);
	const thirtyAgo = new Date(today.getTime() - 30 * 86_400_000);
	const sixtyAgo = new Date(today.getTime() - 60 * 86_400_000);
	const yearAgo = new Date(today.getTime() - 365 * 86_400_000);

	const contactItems = useDirectusItems('contacts');
	const invoiceItems = useDirectusItems('invoices');

	try {
		const [contactsRes, clientsRes, leadStats, growthRows, partners, paidInvoices, allClientsForActive] = await Promise.all([
			getContacts({ limit: 1, page: 1 }),
			getClients({ limit: 1, page: 1 }),
			getLeadStats(),
			contactItems.list({
				filter: {
					_and: [
						{ organizations: { organizations_id: { _eq: orgId } } },
						{ date_created: { _gte: ninetyAgo.toISOString() } },
					],
				},
				fields: ['id', 'date_created'],
				sort: ['date_created'],
				limit: 1000,
			}),
			contactItems.list({
				filter: {
					_and: [
						{ organizations: { organizations_id: { _eq: orgId } } },
						{ category: { _eq: 'partner' } },
					],
				},
				fields: ['id'],
				limit: 200,
			}),
			invoiceItems.list({
				filter: {
					_and: [
						{ bill_to: { _eq: orgId } },
						{ status: { _eq: 'paid' } },
						{ invoice_date: { _gte: yearAgo.toISOString().slice(0, 10) } },
					],
				},
				fields: ['total_amount', 'invoice_date', 'client.id', 'client.name'],
				limit: 500,
			}),
			getClients({ limit: 200, page: 1 }),
		]);

		contactCount.value = contactsRes.total;
		clientCount.value = clientsRes.total;
		leadCount.value = leadStats.total;
		pipelineValue.value = leadStats.pipeline_value;
		partnerCount.value = (partners as any[]).length;

		// Active clients
		activeClientCount.value = (allClientsForActive.data as any[]).filter(c => c.account_state === 'active').length;

		// Contact growth — bucket by week (12 weeks ≈ 90 days)
		const weeks = 12;
		const buckets = Array.from({ length: weeks }, (_, i) => ({
			weekIdx: i,
			label: '',
			count: 0,
			cumulative: 0,
		}));
		const startMs = ninetyAgo.getTime();
		const weekMs = 7 * 86_400_000;
		for (const row of growthRows as any[]) {
			if (!row.date_created) continue;
			const ts = new Date(row.date_created).getTime();
			const idx = Math.min(weeks - 1, Math.max(0, Math.floor((ts - startMs) / weekMs)));
			if (buckets[idx]) buckets[idx].count++;
		}
		// Cumulative + labels
		let running = contactsRes.total - (growthRows as any[]).length;
		if (running < 0) running = 0;
		for (const b of buckets) {
			running += b.count;
			b.cumulative = running;
			const labelDate = new Date(startMs + b.weekIdx * weekMs);
			b.label = labelDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
		}
		contactGrowthSeries.value = buckets;
		contactsLast90.value = (growthRows as any[]).length;

		// 30d vs prior-30d delta on new contacts
		let last30 = 0, prior30 = 0;
		for (const row of growthRows as any[]) {
			if (!row.date_created) continue;
			const ts = new Date(row.date_created).getTime();
			if (ts >= thirtyAgo.getTime()) last30++;
			else if (ts >= sixtyAgo.getTime()) prior30++;
		}
		contactDelta.value = last30 - prior30;

		// Lead pipeline funnel
		funnelStages.value = (Object.keys(STAGE_LABELS) as Array<keyof typeof STAGE_LABELS>).map(key => ({
			key,
			label: STAGE_LABELS[key],
			count: (leadStats.by_stage as any)[key] || 0,
			color: STAGE_COLORS[key] || 'hsl(217, 91%, 60%)',
		}));

		// Top clients by revenue
		const revenueMap = new Map<string, { id: string; name: string; revenue: number }>();
		let yearTotal = 0;
		for (const inv of paidInvoices as any[]) {
			const amt = Number(inv.total_amount) || 0;
			yearTotal += amt;
			const c = inv.client;
			const id = typeof c === 'object' ? c?.id : c;
			const name = typeof c === 'object' ? c?.name : null;
			if (!id || !name) continue;
			const existing = revenueMap.get(id);
			if (existing) existing.revenue += amt;
			else revenueMap.set(id, { id, name, revenue: amt });
		}
		topClients.value = [...revenueMap.values()]
			.sort((a, b) => b.revenue - a.revenue)
			.slice(0, 5);
		yearRevenue.value = yearTotal;
	} catch (err) {
		console.error('[people] failed to load intelligence:', err);
	}
}

async function loadNeedsAttention() {
	if (!selectedOrg.value) return;
	try {
		const invoiceItems = useDirectusItems('invoices');
		const unpaidInvoices = await invoiceItems.list({
			filter: { status: { _in: ['pending', 'processing'] } },
			fields: ['id', 'total_amount', 'due_date', 'client.id', 'client.name'],
			limit: 50,
		});

		const clientInvoiceMap = new Map<string, any[]>();
		for (const inv of unpaidInvoices) {
			const clientId = typeof inv.client === 'object' ? inv.client?.id : inv.client;
			if (!clientId) continue;
			if (!clientInvoiceMap.has(clientId)) clientInvoiceMap.set(clientId, []);
			clientInvoiceMap.get(clientId)!.push(inv);
		}

		const items: typeof needsAttention.value = [];
		for (const [clientId, invs] of clientInvoiceMap) {
			const overdueInvs = invs.filter((inv: any) => inv.due_date && new Date(inv.due_date) < new Date());
			const clientName = typeof invs[0]?.client === 'object' ? invs[0].client?.name : 'Unknown';
			if (overdueInvs.length > 0) {
				const total = overdueInvs.reduce((s: number, inv: any) => s + (Number(inv.total_amount) || 0), 0);
				items.push({
					id: clientId,
					name: clientName || 'Unknown',
					reason: `$${total.toLocaleString()} overdue (${overdueInvs.length} invoice${overdueInvs.length > 1 ? 's' : ''})`,
					urgency: 'high',
					route: `/clients/${clientId}`,
					action: 'Follow up',
				});
			} else if (invs.length > 0) {
				const total = invs.reduce((s: number, inv: any) => s + (Number(inv.total_amount) || 0), 0);
				const soonest = invs.sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())[0];
				const daysUntil = soonest?.due_date ? Math.ceil((new Date(soonest.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 99;
				if (daysUntil <= 7) {
					items.push({
						id: clientId,
						name: clientName || 'Unknown',
						reason: `$${total.toLocaleString()} due in ${daysUntil}d`,
						urgency: 'medium',
						route: `/clients/${clientId}`,
						action: 'Review',
					});
				}
			}
		}

		// Overdue lead follow-ups
		const leadItems: typeof needsAttention.value = [];
		try {
			const openLeads = await getLeads({ limit: 200 } as any) as any[];
			const now = Date.now();
			for (const lead of openLeads) {
				if (!lead?.next_follow_up) continue;
				if (lead.is_junk) continue;
				if (lead.status === 'archived') continue;
				if (lead.stage === 'won' || lead.stage === 'lost') continue;
				const dueTs = new Date(lead.next_follow_up).getTime();
				if (!Number.isFinite(dueTs) || dueTs >= now) continue;
				const daysOverdue = Math.floor((now - dueTs) / (1000 * 60 * 60 * 24));
				const rc = lead.related_contact;
				const contactName = rc && typeof rc === 'object'
					? [rc.first_name, rc.last_name].filter(Boolean).join(' ') || rc.email || rc.company
					: null;
				const leadLabel = contactName || lead.project_type || `Lead #${lead.id}`;
				leadItems.push({
					id: String(lead.id),
					name: leadLabel,
					reason: `Follow-up ${daysOverdue === 0 ? 'due today' : `overdue ${daysOverdue}d`}${lead.stage ? ` · ${lead.stage}` : ''}`,
					urgency: daysOverdue >= 7 ? 'high' : 'medium',
					route: `/leads/${lead.id}`,
					action: 'Reach out',
				});
			}
			leadItems.sort((a, b) => (a.urgency === 'high' ? -1 : 1) - (b.urgency === 'high' ? -1 : 1));
		} catch { /* lead attention is non-critical */ }

		const invoiceSorted = items.sort((a, b) => (a.urgency === 'high' ? -1 : 1) - (b.urgency === 'high' ? -1 : 1));
		const blended = [...invoiceSorted.slice(0, 3), ...leadItems.slice(0, 2)];
		if (blended.length < 5) {
			const extras = [...invoiceSorted.slice(3), ...leadItems.slice(2)];
			while (blended.length < 5 && extras.length) blended.push(extras.shift()!);
		}
		needsAttention.value = blended.sort((a, b) => (a.urgency === 'high' ? -1 : 1) - (b.urgency === 'high' ? -1 : 1));
	} catch { /* counts are non-critical */ }
}

async function loadNetworkCount() {
	try {
		const cdResult = await fetchCdContacts({ page: 1 });
		networkCount.value = cdResult?.length || 0;
	} catch { /* counts are non-critical */ }
}

onMounted(async () => {
	await Promise.all([loadIntelligence(), loadNeedsAttention(), loadNetworkCount()]);
	dataLoaded.value = true;
});

function getInitials(name: string): string {
	return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

const doSearch = useDebounceFn(async () => {
	if (!search.value.trim()) {
		searchResults.value = [];
		return;
	}

	searchLoading.value = true;
	const results: typeof searchResults.value = [];

	try {
		const [contacts, clients, leads] = await Promise.all([
			getContacts({ search: search.value, limit: 10, page: 1 }),
			getClients({ search: search.value, limit: 10, page: 1 }),
			getLeads({ search: search.value, limit: 10 } as any) as Promise<any[]>,
		]);

		for (const c of contacts.data) {
			const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || 'Unknown';
			results.push({
				id: c.id,
				name,
				detail: [c.company, c.email].filter(Boolean).join(' · '),
				initials: getInitials(name),
				source: 'contacts',
				route: `/contacts/${c.id}`,
			});
		}

		for (const c of clients.data as any[]) {
			const name = c.name || 'Unnamed Client';
			results.push({
				id: c.id,
				name,
				detail: [c.industry, c.status].filter(Boolean).join(' · '),
				initials: getInitials(name),
				source: 'clients',
				route: `/clients/${c.id}`,
			});
		}

		for (const lead of leads as any[]) {
			const rc = lead?.related_contact;
			const contactName = rc && typeof rc === 'object'
				? [rc.first_name, rc.last_name].filter(Boolean).join(' ') || rc.email
				: null;
			const name = contactName || lead.project_type || `Lead #${lead.id}`;
			const detail = [lead.project_type, lead.stage, rc && typeof rc === 'object' ? rc.company : null]
				.filter(Boolean)
				.join(' · ');
			results.push({
				id: String(lead.id),
				name,
				detail,
				initials: getInitials(name),
				source: 'leads',
				route: `/leads/${lead.id}`,
			});
		}
	} catch { /* search errors are non-critical */ }

	searchResults.value = results;
	searchLoading.value = false;
}, 300);

watch(search, doSearch);
</script>
