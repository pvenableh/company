<template>
	<Sheet :open="open" @update:open="(v: boolean) => emit('update:open', v)">
		<SheetContent side="right" class="w-full sm:max-w-md p-0 gap-0 flex flex-col overflow-hidden">
			<!-- Header -->
			<SheetHeader class="px-5 pt-5 pb-4 border-b border-border/50 text-left space-y-0 shrink-0">
				<div class="flex items-center gap-3">
					<div class="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center text-base font-semibold text-primary shrink-0">
						{{ member?.name?.charAt(0)?.toUpperCase() || '?' }}
					</div>
					<div class="min-w-0">
						<SheetTitle class="text-base font-semibold truncate">{{ member?.name || 'Member' }}</SheetTitle>
						<SheetDescription class="text-xs text-muted-foreground truncate normal-case">
							AI usage · {{ periodLabel }}
						</SheetDescription>
					</div>
				</div>
			</SheetHeader>

			<!-- Body -->
			<div class="flex-1 overflow-y-auto px-5 py-4">
				<!-- First load skeleton -->
				<div v-if="loading && !stats" class="space-y-4">
					<div class="grid grid-cols-2 gap-3">
						<div v-for="i in 4" :key="i" class="ios-card p-3 animate-pulse">
							<div class="h-2.5 bg-muted/40 rounded w-16 mb-2" />
							<div class="h-6 bg-muted/40 rounded w-12" />
						</div>
					</div>
					<div class="h-40 ios-card animate-pulse" />
				</div>

				<!-- Content — kept mounted during refetch, dimmed to avoid the jump -->
				<div
					v-else-if="stats"
					class="space-y-5 transition-opacity duration-300"
					:class="{ 'opacity-50': loading }"
				>
					<!-- Stat tiles -->
					<div class="grid grid-cols-2 gap-3">
						<div class="ios-card p-3">
							<span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Requests</span>
							<p class="text-xl font-bold text-foreground">{{ formatNumber(stats.totalRequests) }}</p>
						</div>
						<div class="ios-card p-3">
							<span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tokens</span>
							<p class="text-xl font-bold text-foreground">{{ formatNumber(stats.totalTokens) }}</p>
							<p class="text-[10px] text-muted-foreground mt-0.5">{{ formatNumber(stats.totalInput) }} in / {{ formatNumber(stats.totalOutput) }} out</p>
						</div>
						<div class="ios-card p-3">
							<span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Est. Cost</span>
							<p class="text-xl font-bold text-foreground">${{ (stats.totalCost || 0).toFixed(2) }}</p>
						</div>
						<div class="ios-card p-3">
							<span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Active Days</span>
							<p class="text-xl font-bold text-foreground">{{ stats.daily?.length || 0 }}</p>
							<p v-if="lastActive" class="text-[10px] text-muted-foreground mt-0.5">last {{ lastActive }}</p>
						</div>
					</div>

					<!-- Mini usage chart -->
					<div v-if="dailyChartData.length > 1">
						<h4 class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Usage Over Time</h4>
						<ClientOnly>
							<div class="h-40">
								<ChartContainer :config="lineChartConfig" class="aspect-auto h-full w-full">
									<VisXYContainer :data="dailyChartData" :padding="{ top: 8 }" :y-domain="[0, undefined]">
										<VisLine
											:x="(d: any) => d.index"
											:y="[(d: any) => d.input, (d: any) => d.output]"
											:color="[lineChartConfig.input.color, lineChartConfig.output.color]"
											:curve-type="CurveType.MonotoneX"
										/>
										<VisAxis type="x" :x="(d: any) => d.index" :tick-values="tickValues" :tick-format="(i: number) => dailyChartData[Math.round(i)]?.label || ''" :grid-line="false" :tick-line="false" :domain-line="false" />
										<VisAxis type="y" :grid-line="true" :tick-line="false" :domain-line="false" :num-ticks="4" />
									</VisXYContainer>
								</ChartContainer>
							</div>
							<div class="flex items-center justify-center gap-5 mt-2 text-[11px] text-muted-foreground">
								<span class="flex items-center gap-1.5"><span class="w-3 h-0.5 rounded-full bg-blue-500" /> Input</span>
								<span class="flex items-center gap-1.5"><span class="w-3 h-0.5 rounded-full bg-purple-500" /> Output</span>
							</div>
						</ClientOnly>
					</div>

					<!-- By feature -->
					<div v-if="endpoints.length">
						<h4 class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">By Feature</h4>
						<div class="space-y-2.5">
							<div v-for="ep in endpoints" :key="ep.endpoint" class="flex items-center gap-3">
								<div class="flex-1 min-w-0">
									<div class="flex items-center justify-between mb-1">
										<span class="text-xs font-medium text-foreground truncate">{{ ep.label }}</span>
										<span class="text-[11px] text-muted-foreground ml-2">{{ formatNumber(ep.totalTokens) }}</span>
									</div>
									<div class="h-1.5 rounded-full bg-muted/30 overflow-hidden">
										<div class="h-full rounded-full bg-primary/60" :style="{ width: `${maxEndpointTokens ? (ep.totalTokens / maxEndpointTokens) * 100 : 0}%` }" />
									</div>
								</div>
								<span class="text-[11px] font-medium text-muted-foreground w-8 text-right">{{ ep.requests }}</span>
							</div>
						</div>
					</div>

					<!-- Recent activity -->
					<div v-if="recent.length">
						<h4 class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Recent Activity</h4>
						<div class="space-y-1.5">
							<div v-for="item in recent" :key="item.id" class="flex items-center gap-3 py-1.5 border-b border-border/30 last:border-0">
								<span class="text-xs text-foreground flex-1 min-w-0 truncate">{{ item.endpointLabel }}</span>
								<span class="text-[11px] font-medium text-foreground shrink-0">{{ formatNumber(item.totalTokens) }}</span>
								<span class="text-[10px] text-muted-foreground shrink-0 w-14 text-right">{{ formatTimeAgo(item.date) }}</span>
							</div>
						</div>
					</div>

					<!-- Empty -->
					<p v-if="!stats.totalRequests" class="text-sm text-muted-foreground text-center py-8">
						No AI usage for this member in the selected period.
					</p>
				</div>
			</div>
		</SheetContent>
	</Sheet>
</template>

<script setup lang="ts">
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '~/components/ui/sheet';
import { ChartContainer } from '~/components/ui/chart';
import { VisXYContainer, VisLine, VisAxis } from '@unovis/vue';
import { CurveType } from '@unovis/ts';

interface Member { id: string; name: string; avatar?: string | null }

const props = defineProps<{
	open: boolean;
	organizationId: string | null;
	period: string;
	member: Member | null;
}>();

const emit = defineEmits<{ 'update:open': [boolean] }>();

const loading = ref(false);
const stats = ref<any>(null);
const endpoints = ref<any[]>([]);
const recent = ref<any[]>([]);

const lineChartConfig = {
	input: { label: 'Input Tokens', color: 'rgba(59, 130, 246, 0.8)' },
	output: { label: 'Output Tokens', color: 'rgba(168, 85, 247, 0.8)' },
};

const periodLabel = computed(() => ({ day: 'last 24h', week: 'last 7 days', month: 'last 30 days', all: 'all time' } as Record<string, string>)[props.period] || props.period);

const dailyChartData = computed(() => {
	if (!stats.value?.daily) return [] as any[];
	return stats.value.daily.map((d: any, i: number) => {
		const [y, m, day] = String(d.date).split('-').map(Number);
		return {
			index: i,
			label: new Date(y, (m || 1) - 1, day || 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
			input: d.input,
			output: d.output,
		};
	});
});
const tickValues = computed(() => dailyChartData.value.map((d) => d.index));
const maxEndpointTokens = computed(() => (endpoints.value.length ? Math.max(...endpoints.value.map((e: any) => e.totalTokens)) : 0));
const lastActive = computed(() => (recent.value[0]?.date ? formatTimeAgo(recent.value[0].date) : ''));

function formatNumber(n: number): string {
	if (!n) return '0';
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return String(n);
}
function formatTimeAgo(dateStr: string): string {
	const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
	if (seconds < 60) return 'just now';
	const m = Math.floor(seconds / 60);
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ago`;
	return `${Math.floor(h / 24)}d ago`;
}

async function load() {
	if (!props.member?.id || !props.organizationId) return;
	loading.value = true;
	const qs = new URLSearchParams({ organizationId: props.organizationId, period: props.period, userId: props.member.id }).toString();
	try {
		const [s, e, r] = await Promise.all([
			$fetch<any>(`/api/ai/usage/stats?${qs}`),
			$fetch<any>(`/api/ai/usage/by-endpoint?${qs}`),
			$fetch<any>(`/api/ai/usage/recent?${qs}&limit=15`),
		]);
		stats.value = s;
		endpoints.value = e?.endpoints || [];
		recent.value = r?.activity || [];
	} catch (err) {
		console.error('[AIUsageMemberSheet] load failed:', err);
	} finally {
		loading.value = false;
	}
}

// New member → clear stale data so the skeleton shows instead of the prior
// member's numbers flashing through.
watch(() => props.member?.id, () => {
	stats.value = null;
	endpoints.value = [];
	recent.value = [];
});

// Load whenever the sheet is open and its inputs change (open, member, period).
watch(
	() => [props.open, props.member?.id, props.period] as const,
	() => { if (props.open) load(); },
	{ immediate: true },
);
</script>
