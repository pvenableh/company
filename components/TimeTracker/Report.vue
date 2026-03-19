<template>
	<div class="space-y-6">
		<!-- Date Range Selector -->
		<div class="ios-card rounded-2xl border border-border bg-card p-5">
			<div class="flex flex-col sm:flex-row items-start sm:items-center gap-3">
				<!-- Presets -->
				<div class="flex flex-wrap gap-1.5">
					<button
						v-for="preset in presets"
						:key="preset.label"
						class="text-xs px-2.5 py-1 rounded-lg transition-colors"
						:class="
							activePreset === preset.label
								? 'bg-primary text-primary-foreground'
								: 'bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted'
						"
						@click="applyPreset(preset)"
					>
						{{ preset.label }}
					</button>
				</div>

				<!-- Custom range -->
				<div class="flex items-center gap-2 ml-auto">
					<input
						v-model="dateFrom"
						type="date"
						class="rounded-md border bg-background px-2.5 py-1 text-xs"
						@change="activePreset = null; fetchReport()"
					/>
					<span class="text-xs text-muted-foreground">→</span>
					<input
						v-model="dateTo"
						type="date"
						class="rounded-md border bg-background px-2.5 py-1 text-xs"
						@change="activePreset = null; fetchReport()"
					/>
				</div>
			</div>
		</div>

		<!-- Loading -->
		<div v-if="loading" class="flex items-center justify-center py-16">
			<Icon name="lucide:loader-2" class="w-6 h-6 text-muted-foreground animate-spin" />
		</div>

		<template v-else>
			<!-- Summary Stats -->
			<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
				<div class="ios-card rounded-2xl border border-border bg-card p-4 space-y-1">
					<p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Hours</p>
					<p class="text-2xl font-semibold text-foreground tabular-nums">{{ formatHours(totalMinutes) }}</p>
					<p class="text-xs text-muted-foreground">{{ entries.length }} entries</p>
				</div>
				<div class="ios-card rounded-2xl border border-border bg-card p-4 space-y-1">
					<p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Billable Hours</p>
					<p class="text-2xl font-semibold text-foreground tabular-nums">{{ formatHours(billableMinutes) }}</p>
					<p class="text-xs text-muted-foreground">
						{{ billableEntries.length }} billable entries
					</p>
				</div>
				<div class="ios-card rounded-2xl border border-border bg-card p-4 space-y-1">
					<p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Revenue</p>
					<p class="text-2xl font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
						${{ formatCurrency(totalRevenue) }}
					</p>
					<p class="text-xs text-muted-foreground">
						{{ unbilledEntries.length }} unbilled
					</p>
				</div>
				<div class="ios-card rounded-2xl border border-border bg-card p-4 space-y-1">
					<p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Avg / Day</p>
					<p class="text-2xl font-semibold text-foreground tabular-nums">{{ formatHours(avgMinutesPerDay) }}</p>
					<p class="text-xs text-muted-foreground">
						{{ uniqueDays }} {{ uniqueDays === 1 ? 'day' : 'days' }} tracked
					</p>
				</div>
			</div>

			<!-- Daily Trend Chart -->
			<div class="ios-card rounded-2xl border border-border bg-card p-5">
				<h3 class="font-medium text-sm flex items-center gap-2 mb-4">
					<Icon name="lucide:bar-chart-3" class="w-4 h-4 text-muted-foreground" />
					Daily Hours
				</h3>

				<div v-if="dailyData.length" class="h-48">
					<ChartContainer :config="chartConfig" class="h-full">
						<VisXYContainer :data="dailyData" :padding="{ top: 10 }">
							<VisStackedBar
								:x="(d: any) => d.index"
								:y="[(d: any) => d.billable, (d: any) => d.nonBillable]"
								:color="['var(--color-billable)', 'var(--color-nonBillable)']"
								:bar-padding="0.35"
								:rounded-corners="4"
							/>
							<VisAxis type="x" :tick-format="formatDayTick" :grid-line="false" :num-ticks="Math.min(dailyData.length, 14)" />
							<VisAxis type="y" :tick-format="(v: number) => v + 'h'" :grid-line="true" />
							<ChartCrosshair
								:template="crosshairTemplate"
								:color="['var(--color-billable)', 'var(--color-nonBillable)']"
							/>
						</VisXYContainer>
					</ChartContainer>
				</div>
				<div v-else class="h-48 flex items-center justify-center text-sm text-muted-foreground">
					No data for this period
				</div>

				<div class="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
					<span class="flex items-center gap-1.5">
						<span class="w-3 h-0.5 rounded-full bg-emerald-500" />
						Billable
					</span>
					<span class="flex items-center gap-1.5">
						<span class="w-3 h-0.5 rounded-full bg-blue-400" />
						Non-billable
					</span>
				</div>
			</div>

			<!-- Breakdowns: Client + Project -->
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<!-- By Client -->
				<div class="ios-card rounded-2xl border border-border bg-card p-5">
					<h3 class="font-medium text-sm flex items-center gap-2 mb-4">
						<Icon name="lucide:building-2" class="w-4 h-4 text-muted-foreground" />
						Hours by Client
					</h3>

					<div v-if="clientBreakdown.length" class="space-y-3">
						<div
							v-for="item in clientBreakdown.slice(0, 10)"
							:key="item.name"
							class="flex items-center gap-3"
						>
							<div class="flex-1 min-w-0">
								<div class="flex items-center justify-between mb-1">
									<span class="text-sm font-medium truncate">{{ item.name }}</span>
									<span class="text-sm font-semibold ml-2 tabular-nums">{{ formatDuration(item.totalMinutes) }}</span>
								</div>
								<div class="w-full h-1.5 bg-muted rounded-full overflow-hidden">
									<div
										class="h-full rounded-full transition-all bg-primary"
										:style="{ width: maxClientMinutes > 0 ? `${(item.totalMinutes / maxClientMinutes) * 100}%` : '0%' }"
									/>
								</div>
								<div class="flex justify-between mt-0.5 text-[10px] text-muted-foreground">
									<span>{{ item.count }} {{ item.count === 1 ? 'entry' : 'entries' }}</span>
									<span v-if="item.revenue > 0" class="text-emerald-500">${{ formatCurrency(item.revenue) }}</span>
								</div>
							</div>
						</div>
					</div>
					<div v-else class="py-8 text-center text-sm text-muted-foreground">
						No client data
					</div>
				</div>

				<!-- By Project -->
				<div class="ios-card rounded-2xl border border-border bg-card p-5">
					<h3 class="font-medium text-sm flex items-center gap-2 mb-4">
						<Icon name="lucide:folder" class="w-4 h-4 text-muted-foreground" />
						Hours by Project
					</h3>

					<div v-if="projectBreakdown.length" class="space-y-3">
						<div
							v-for="item in projectBreakdown.slice(0, 10)"
							:key="item.name"
							class="flex items-center gap-3"
						>
							<div class="flex-1 min-w-0">
								<div class="flex items-center justify-between mb-1">
									<span class="text-sm font-medium truncate">{{ item.name }}</span>
									<span class="text-sm font-semibold ml-2 tabular-nums">{{ formatDuration(item.totalMinutes) }}</span>
								</div>
								<div class="w-full h-1.5 bg-muted rounded-full overflow-hidden">
									<div
										class="h-full rounded-full transition-all bg-blue-500"
										:style="{ width: maxProjectMinutes > 0 ? `${(item.totalMinutes / maxProjectMinutes) * 100}%` : '0%' }"
									/>
								</div>
								<div class="flex justify-between mt-0.5 text-[10px] text-muted-foreground">
									<span>{{ item.count }} {{ item.count === 1 ? 'entry' : 'entries' }}{{ item.clientName ? ' · ' + item.clientName : '' }}</span>
									<span v-if="item.revenue > 0" class="text-emerald-500">${{ formatCurrency(item.revenue) }}</span>
								</div>
							</div>
						</div>
					</div>
					<div v-else class="py-8 text-center text-sm text-muted-foreground">
						No project data
					</div>
				</div>
			</div>
		</template>
	</div>
</template>

<script setup lang="ts">
import type { TimeEntry } from '~/types/directus';
import type { ChartConfig } from '~/components/ui/chart';
import { ChartContainer, ChartCrosshair, ChartTooltipContent, componentToString } from '~/components/ui/chart';
import { VisXYContainer, VisStackedBar, VisAxis } from '@unovis/vue';
import { format, subDays, subMonths, eachDayOfInterval, parseISO } from 'date-fns';

const { getTimeEntries, formatDuration } = useTimeTracker();
const { selectedClient } = useClients();

// ── Date range state ────────────────────────────────────────
const dateFrom = ref(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
const dateTo = ref(format(new Date(), 'yyyy-MM-dd'));
const activePreset = ref<string | null>('30 days');

const presets = [
	{ label: '7 days', getValue: () => ({ from: subDays(new Date(), 7), to: new Date() }) },
	{ label: '14 days', getValue: () => ({ from: subDays(new Date(), 14), to: new Date() }) },
	{ label: '30 days', getValue: () => ({ from: subDays(new Date(), 30), to: new Date() }) },
	{ label: '3 months', getValue: () => ({ from: subMonths(new Date(), 3), to: new Date() }) },
	{ label: '6 months', getValue: () => ({ from: subMonths(new Date(), 6), to: new Date() }) },
];

function applyPreset(preset: (typeof presets)[0]) {
	const range = preset.getValue();
	dateFrom.value = format(range.from, 'yyyy-MM-dd');
	dateTo.value = format(range.to, 'yyyy-MM-dd');
	activePreset.value = preset.label;
	fetchReport();
}

// ── Data ────────────────────────────────────────────────────
const entries = ref<TimeEntry[]>([]);
const loading = ref(true);

async function fetchReport() {
	loading.value = true;
	try {
		const result = await getTimeEntries({
			dateFrom: dateFrom.value,
			dateTo: dateTo.value,
			status: 'completed',
			sort: ['-date', '-start_time'],
			limit: 2000,
		});
		entries.value = result.data;
	} catch (err) {
		console.error('Failed to fetch report data:', err);
	} finally {
		loading.value = false;
	}
}

// ── Chart config ────────────────────────────────────────────
const chartConfig: ChartConfig = {
	billable: { label: 'Billable', color: 'hsl(142, 71%, 45%)' },
	nonBillable: { label: 'Non-billable', color: 'hsl(217, 91%, 70%)' },
};

const crosshairTemplate = componentToString(chartConfig, ChartTooltipContent, { hideLabel: true });

// ── Computed: Summary stats ─────────────────────────────────
const totalMinutes = computed(() =>
	entries.value.reduce((sum, e) => sum + (e.duration_minutes || 0), 0),
);

const billableEntries = computed(() => entries.value.filter((e) => e.billable));
const unbilledEntries = computed(() => entries.value.filter((e) => e.billable && !e.billed));

const billableMinutes = computed(() =>
	billableEntries.value.reduce((sum, e) => sum + (e.duration_minutes || 0), 0),
);

const totalRevenue = computed(() =>
	billableEntries.value.reduce((sum, e) => {
		const hours = (e.duration_minutes || 0) / 60;
		return sum + hours * (e.hourly_rate || 0);
	}, 0),
);

const uniqueDays = computed(() => {
	const days = new Set(entries.value.map((e) => e.date).filter(Boolean));
	return days.size;
});

const avgMinutesPerDay = computed(() => {
	if (uniqueDays.value === 0) return 0;
	return Math.round(totalMinutes.value / uniqueDays.value);
});

// ── Computed: Daily chart data ──────────────────────────────
const dailyData = computed(() => {
	if (!dateFrom.value || !dateTo.value) return [];

	const from = parseISO(dateFrom.value);
	const to = parseISO(dateTo.value);
	const allDays = eachDayOfInterval({ start: from, end: to });

	// Build a map of day -> { billable, nonBillable }
	const dayMap = new Map<string, { billable: number; nonBillable: number }>();

	for (const entry of entries.value) {
		const key = entry.date || '';
		if (!key) continue;
		const existing = dayMap.get(key) || { billable: 0, nonBillable: 0 };
		const hours = (entry.duration_minutes || 0) / 60;
		if (entry.billable) {
			existing.billable += hours;
		} else {
			existing.nonBillable += hours;
		}
		dayMap.set(key, existing);
	}

	// Limit to max ~60 data points to keep chart readable
	const step = Math.max(1, Math.floor(allDays.length / 60));
	const filteredDays = allDays.filter((_, i) => i % step === 0 || i === allDays.length - 1);

	return filteredDays.map((day, index) => {
		const key = format(day, 'yyyy-MM-dd');
		const data = dayMap.get(key) || { billable: 0, nonBillable: 0 };
		return {
			index,
			date: day,
			label: key,
			billable: Math.round(data.billable * 100) / 100,
			nonBillable: Math.round(data.nonBillable * 100) / 100,
		};
	});
});

function formatDayTick(i: number): string {
	const d = dailyData.value[i];
	if (!d) return '';
	return format(d.date, 'MMM d');
}

// ── Computed: Client breakdown ──────────────────────────────
interface BreakdownItem {
	name: string;
	totalMinutes: number;
	count: number;
	revenue: number;
	clientName?: string;
}

const clientBreakdown = computed<BreakdownItem[]>(() => {
	const map = new Map<string, BreakdownItem>();

	for (const entry of entries.value) {
		const client = entry.client;
		const name = client && typeof client === 'object' && 'name' in client
			? (client as any).name || 'Unknown'
			: 'No Client';

		const existing = map.get(name) || { name, totalMinutes: 0, count: 0, revenue: 0 };
		existing.totalMinutes += entry.duration_minutes || 0;
		existing.count++;
		if (entry.billable) {
			const hours = (entry.duration_minutes || 0) / 60;
			existing.revenue += hours * (entry.hourly_rate || 0);
		}
		map.set(name, existing);
	}

	return Array.from(map.values()).sort((a, b) => b.totalMinutes - a.totalMinutes);
});

const maxClientMinutes = computed(() => {
	if (!clientBreakdown.value.length) return 0;
	return clientBreakdown.value[0].totalMinutes;
});

// ── Computed: Project breakdown ─────────────────────────────
const projectBreakdown = computed<BreakdownItem[]>(() => {
	const map = new Map<string, BreakdownItem>();

	for (const entry of entries.value) {
		const project = entry.project;
		const name = project && typeof project === 'object' && 'title' in project
			? (project as any).title || 'Unknown'
			: 'No Project';

		const clientName = entry.client && typeof entry.client === 'object' && 'name' in entry.client
			? (entry.client as any).name
			: undefined;

		const key = name;
		const existing = map.get(key) || { name, totalMinutes: 0, count: 0, revenue: 0, clientName };
		existing.totalMinutes += entry.duration_minutes || 0;
		existing.count++;
		if (entry.billable) {
			const hours = (entry.duration_minutes || 0) / 60;
			existing.revenue += hours * (entry.hourly_rate || 0);
		}
		map.set(key, existing);
	}

	return Array.from(map.values()).sort((a, b) => b.totalMinutes - a.totalMinutes);
});

const maxProjectMinutes = computed(() => {
	if (!projectBreakdown.value.length) return 0;
	return projectBreakdown.value[0].totalMinutes;
});

// ── Formatting helpers ──────────────────────────────────────
function formatHours(minutes: number): string {
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	if (h === 0) return `${m}m`;
	return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatCurrency(value: number): string {
	return new Intl.NumberFormat('en-US', {
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(value);
}

// ── Lifecycle ───────────────────────────────────────────────
onMounted(fetchReport);

watch(() => selectedClient.value, fetchReport);
</script>
