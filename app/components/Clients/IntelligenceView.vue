<template>
	<div>
		<!-- KPI strip -->
		<div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
			<div class="ios-card p-4 flex flex-col gap-2">
				<div class="flex items-center justify-between">
					<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Velocity</p>
					<Icon name="lucide:zap" class="w-3.5 h-3.5 text-muted-foreground" />
				</div>
				<div class="flex items-baseline gap-1">
					<p class="text-2xl font-bold">{{ data?.pipelineVelocity?.avgDaysToWin ?? '—' }}</p>
					<span class="text-[10px] text-muted-foreground">avg days to win</span>
				</div>
				<p class="text-[11px] text-muted-foreground">
					<span v-if="data?.pipelineVelocity?.medianDaysToWin">median {{ data.pipelineVelocity.medianDaysToWin }}d ·</span>
					{{ data?.pipelineVelocity?.wonLeadsAnalyzed || 0 }} wins
				</p>
			</div>

			<div class="ios-card p-4 flex flex-col gap-2">
				<div class="flex items-center justify-between">
					<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Lead Flow</p>
					<Icon name="lucide:trending-up" class="w-3.5 h-3.5 text-muted-foreground" />
				</div>
				<div class="flex items-baseline gap-2">
					<p class="text-2xl font-bold">{{ data?.leadTrend?.last30 ?? 0 }}</p>
					<span class="text-[10px] font-medium" :class="deltaColor(data?.leadTrend?.delta)">
						{{ formatDelta(data?.leadTrend?.delta || 0) }}
					</span>
				</div>
				<p class="text-[11px] text-muted-foreground">vs prior 30d</p>
			</div>

			<div class="ios-card p-4 flex flex-col gap-2">
				<div class="flex items-center justify-between">
					<p class="text-[10px] uppercase tracking-wider text-muted-foreground">No-Show</p>
					<Icon name="lucide:calendar-x" class="w-3.5 h-3.5 text-muted-foreground" />
				</div>
				<div class="flex items-baseline gap-2">
					<p class="text-2xl font-bold">
						{{ data?.bookings?.noShowRate ?? '—' }}<span v-if="data?.bookings?.noShowRate != null" class="text-lg">%</span>
					</p>
				</div>
				<p class="text-[11px] text-muted-foreground">
					{{ data?.bookings?.canceled || 0 }} canceled · {{ data?.bookings?.completed || 0 }} held
				</p>
			</div>

			<div class="ios-card p-4 flex flex-col gap-2">
				<div class="flex items-center justify-between">
					<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Cold Contacts</p>
					<Icon name="lucide:snowflake" class="w-3.5 h-3.5 text-muted-foreground" />
				</div>
				<div class="flex items-baseline gap-2">
					<p class="text-2xl font-bold">{{ data?.coldContacts?.length ?? 0 }}</p>
					<span class="text-[10px] text-muted-foreground">need outreach</span>
				</div>
				<p class="text-[11px] text-muted-foreground">30+ days since contact</p>
			</div>
		</div>

		<!-- Loading shell -->
		<div v-if="loading && !data" class="flex flex-col items-center justify-center py-24 gap-3">
			<Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
			<p class="text-sm text-muted-foreground">Computing intelligence…</p>
		</div>

		<template v-else-if="data">
			<!-- Row 1: Conversion by Source + Pipeline Stage Aging -->
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
				<!-- Conversion by Source -->
				<div class="ios-card p-5">
					<div class="flex items-center justify-between mb-3">
						<h3 class="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Conversion by Source</h3>
						<span class="text-[10px] text-muted-foreground">last 12 mo</span>
					</div>
					<div v-if="data.conversionBySource?.length" class="space-y-2.5">
						<div v-for="row in data.conversionBySource" :key="row.source" class="group">
							<div class="flex items-center gap-2 mb-1">
								<span class="text-[11px] font-medium capitalize w-24 shrink-0 truncate">{{ row.source }}</span>
								<div class="flex-1 relative h-5 bg-muted/30 rounded-md overflow-hidden">
									<div
										class="absolute inset-y-0 left-0 rounded-md bg-success/70 transition-all"
										:style="{ width: sourceBarWidth(row.converted) + '%' }"
									/>
									<div
										class="absolute inset-y-0 rounded-md bg-muted/40"
										:style="{ left: sourceBarWidth(row.converted) + '%', width: sourceBarWidth(row.total - row.converted) + '%' }"
									/>
									<span class="absolute inset-y-0 left-2 flex items-center text-[10px] font-medium text-foreground/90 z-10">
										{{ row.converted }}/{{ row.total }}
									</span>
								</div>
								<span class="text-[11px] font-semibold w-10 text-right">{{ row.conversionRate }}%</span>
							</div>
							<div v-if="row.wonValue > 0 || row.pipelineValue > 0" class="ml-26 flex items-center gap-3 text-[10px] text-muted-foreground">
								<span v-if="row.wonValue > 0" class="text-success/90">${{ formatNumber(row.wonValue) }} won</span>
								<span v-if="row.pipelineValue > 0">${{ formatNumber(row.pipelineValue) }} open</span>
							</div>
						</div>
					</div>
					<div v-else class="py-8 text-center text-[11px] text-muted-foreground">
						No lead data yet. <NuxtLink to="/leads?new=true" class="text-primary hover:underline">Add a lead →</NuxtLink>
					</div>
				</div>

				<!-- Pipeline Stage Aging -->
				<div class="ios-card p-5">
					<div class="flex items-center justify-between mb-3">
						<h3 class="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Pipeline Stage Aging</h3>
						<NuxtLink to="/apps/clients?view=leads" class="text-[10px] text-primary hover:underline">View pipeline →</NuxtLink>
					</div>
					<div v-if="stageRows.length" class="space-y-2.5">
						<div v-for="row in stageRows" :key="row.stage" class="flex items-center gap-3">
							<span class="text-[11px] font-medium w-24 shrink-0 capitalize">{{ stageLabel(row.stage) }}</span>
							<div class="flex-1 flex items-center gap-2">
								<span class="text-[10px] text-muted-foreground tabular-nums w-8">{{ row.count }}</span>
								<div class="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
									<div
										class="h-full rounded-full transition-all"
										:class="agingBarColor(row.avgDays)"
										:style="{ width: stageAgeBarWidth(row.avgDays) + '%' }"
									/>
								</div>
								<span class="text-[11px] tabular-nums w-14 text-right" :class="agingTextColor(row.avgDays)">
									{{ row.avgDays }}d avg
								</span>
							</div>
						</div>
					</div>
					<div v-else class="py-8 text-center text-[11px] text-muted-foreground">
						No active pipeline. Stages will populate as leads move through.
					</div>
				</div>
			</div>

			<!-- Row 2: Partner ROI + Booking Health -->
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
				<!-- Partner ROI -->
				<div class="ios-card p-5">
					<div class="flex items-center justify-between mb-3">
						<h3 class="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Partner ROI</h3>
						<span class="text-[10px] text-muted-foreground">last 6 mo revenue</span>
					</div>
					<div v-if="data.partnerROI?.length" class="space-y-2">
						<NuxtLink
							v-for="partner in data.partnerROI"
							:key="partner.contactId"
							:to="`/contacts/${partner.contactId}`"
							class="flex items-center gap-3 py-2 px-2 -mx-2 rounded-md hover:bg-muted/30 transition-colors"
						>
							<span class="w-2 h-2 rounded-full bg-violet-500 shrink-0" />
							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-2">
									<p class="text-sm font-medium truncate">{{ partner.name }}</p>
									<span v-if="partner.company" class="text-[10px] text-muted-foreground truncate">· {{ partner.company }}</span>
								</div>
								<p class="text-[11px] text-muted-foreground">
									{{ partner.clientsIntroduced.length }} client{{ partner.clientsIntroduced.length === 1 ? '' : 's' }}
									<span v-if="partner.referralLeadCount > 0">· {{ partner.referralLeadCount }} referral{{ partner.referralLeadCount === 1 ? '' : 's' }}</span>
								</p>
							</div>
							<div class="text-right shrink-0">
								<p class="text-[11px] font-semibold text-success/90">${{ formatNumber(partner.totalRevenue) }}</p>
								<p class="text-[10px] text-muted-foreground capitalize">{{ partnerRoleLabel(partner.role) }}</p>
							</div>
						</NuxtLink>
					</div>
					<div v-else class="py-8 text-center text-[11px] text-muted-foreground">
						No partner connections yet. <NuxtLink to="/apps/clients?view=contacts" class="text-primary hover:underline">Find a contact to link →</NuxtLink>
					</div>
				</div>

				<!-- Booking Health: Top event types -->
				<div class="ios-card p-5">
					<div class="flex items-center justify-between mb-3">
						<h3 class="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Top Event Types</h3>
						<NuxtLink to="/scheduler/settings" class="text-[10px] text-primary hover:underline">Manage →</NuxtLink>
					</div>
					<div v-if="data.bookings?.topEventTypes?.length" class="space-y-2.5">
						<div v-for="et in data.bookings.topEventTypes" :key="et.id" class="flex items-center gap-3">
							<span class="w-3 h-3 rounded-sm shrink-0" :style="{ background: et.color || 'hsl(217, 91%, 60%)' }" />
							<span class="text-sm font-medium truncate flex-1">{{ et.name }}</span>
							<div class="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden max-w-[120px]">
								<div
									class="h-full rounded-full"
									:style="{
										width: eventTypeBarWidth(et.count) + '%',
										background: et.color || 'hsl(217, 91%, 60%)',
									}"
								/>
							</div>
							<span class="text-[11px] font-semibold tabular-nums w-10 text-right">{{ et.count }}</span>
						</div>
					</div>
					<div v-else class="py-8 text-center text-[11px] text-muted-foreground">
						No bookings in last 90 days. <NuxtLink to="/scheduler/settings" class="text-primary hover:underline">Set up event types →</NuxtLink>
					</div>
				</div>
			</div>

			<!-- Cold Contacts -->
			<div v-if="data.coldContacts?.length" class="ios-card p-5">
				<div class="flex items-center justify-between mb-3">
					<h3 class="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
						Cold Contacts
						<span class="text-warning ml-1">({{ data.coldContacts.length }})</span>
					</h3>
					<span class="text-[10px] text-muted-foreground">30+ days since touch</span>
				</div>
				<div class="space-y-0.5">
					<NuxtLink
						v-for="c in data.coldContacts"
						:key="c.id"
						:to="`/contacts/${c.id}`"
						class="flex items-center gap-3 py-2 px-2 -mx-2 rounded-md hover:bg-muted/30 transition-colors group"
					>
						<span
							class="w-2 h-2 rounded-full shrink-0"
							:class="c.daysSinceContact >= 90 ? 'bg-destructive' : 'bg-warning'"
						/>
						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-2">
								<p class="text-sm font-medium truncate">{{ c.name }}</p>
								<span v-if="c.company" class="text-[10px] text-muted-foreground truncate">· {{ c.company }}</span>
								<span class="text-[10px] text-muted-foreground capitalize">· {{ c.category }}</span>
							</div>
							<p class="text-[11px] text-muted-foreground">{{ c.lastChannel }}</p>
						</div>
						<span class="text-[11px] font-medium shrink-0" :class="c.daysSinceContact >= 90 ? 'text-destructive' : 'text-warning'">
							{{ c.daysSinceContact }}d
						</span>
						<Icon name="lucide:chevron-right" class="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
					</NuxtLink>
				</div>
			</div>
		</template>
	</div>
</template>

<script setup lang="ts">
type StageRow = { stage: string; count: number; avgDays: number };

const props = defineProps<{
	data: any;
	loading: boolean;
}>();

const STAGE_ORDER = ['new', 'contacted', 'qualified', 'proposal_sent', 'negotiating'];

const stageRows = computed<StageRow[]>(() => {
	const map = props.data?.pipelineVelocity?.stageAvgAge || {};
	const rows: StageRow[] = [];
	for (const stage of STAGE_ORDER) {
		if (map[stage]) rows.push({ stage, count: map[stage].count, avgDays: map[stage].avgDays });
	}
	for (const [stage, val] of Object.entries(map)) {
		if (!STAGE_ORDER.includes(stage)) {
			rows.push({ stage, count: (val as any).count, avgDays: (val as any).avgDays });
		}
	}
	return rows;
});

const maxStageAge = computed(() => Math.max(14, ...stageRows.value.map((r) => r.avgDays)));
function stageAgeBarWidth(days: number): number {
	return Math.max(4, Math.min(100, (days / maxStageAge.value) * 100));
}
function agingBarColor(days: number): string {
	if (days >= 60) return 'bg-destructive/70';
	if (days >= 30) return 'bg-warning/70';
	return 'bg-success/70';
}
function agingTextColor(days: number): string {
	if (days >= 60) return 'text-destructive';
	if (days >= 30) return 'text-warning';
	return 'text-muted-foreground';
}

function stageLabel(stage: string): string {
	return stage.replace(/_/g, ' ');
}

const maxSourceCount = computed(() => Math.max(1, ...(props.data?.conversionBySource || []).map((r: any) => r.total)));
function sourceBarWidth(n: number): number {
	return Math.max(0, (n / maxSourceCount.value) * 100);
}

const maxEventTypeCount = computed(() => Math.max(1, ...(props.data?.bookings?.topEventTypes || []).map((r: any) => r.count)));
function eventTypeBarWidth(n: number): number {
	return Math.max(4, (n / maxEventTypeCount.value) * 100);
}

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

function deltaColor(n: number | undefined): string {
	if (!n) return 'text-muted-foreground';
	if (n > 0) return 'text-success';
	if (n < 0) return 'text-destructive';
	return 'text-muted-foreground';
}

const ROLE_LABELS: Record<string, string> = {
	referral_partner: 'Referral',
	vendor: 'Vendor',
	board: 'Board',
	consultant: 'Consultant',
	investor: 'Investor',
	other: 'Other',
};
function partnerRoleLabel(role: string): string {
	return ROLE_LABELS[role] || role;
}
</script>
