<template>
	<div class="w-full px-4 py-6 min-h-[50vh] flex items-start justify-center">
		<div class="w-full max-w-3xl space-y-6">
			<!-- Stats Cards -->
			<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
				<div class="ios-card p-4 space-y-1">
					<p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Hours</p>
					<p class="text-2xl font-semibold text-foreground tabular-nums">{{ formatHours(timeStats.totalMinutes) }}</p>
					<p class="text-xs text-muted-foreground">{{ timeStats.entryCount }} entries</p>
				</div>
				<div class="ios-card p-4 space-y-1">
					<p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Billable Hours</p>
					<p class="text-2xl font-semibold text-foreground tabular-nums">{{ formatHours(timeStats.billableMinutes) }}</p>
				</div>
				<div class="ios-card p-4 space-y-1">
					<p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Unbilled</p>
					<p class="text-2xl font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
						${{ formatCurrency(timeStats.unbilledAmount) }}
					</p>
				</div>
				<div class="ios-card p-4 space-y-1">
					<p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Billed</p>
					<p class="text-2xl font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
						${{ formatCurrency(timeStats.billedAmount) }}
					</p>
				</div>
			</div>

			<!-- Filters -->
			<div class="flex flex-wrap items-center gap-1.5">
				<button
					v-for="preset in periodPresets"
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

			<!-- Loading -->
			<div v-if="loading" class="flex items-center justify-center py-16">
				<Icon name="lucide:loader-2" class="w-6 h-6 text-muted-foreground animate-spin" />
			</div>

			<!-- Empty -->
			<div v-else-if="!entries.length" class="flex flex-col items-center justify-center py-16 text-center">
				<div class="h-12 w-12 rounded-full bg-muted/60 flex items-center justify-center mb-4">
					<Icon name="lucide:clock" class="h-6 w-6 text-muted-foreground/60" />
				</div>
				<p class="text-sm text-muted-foreground">No time entries for this project</p>
				<p class="text-xs text-muted-foreground/60 mt-1">Time entries linked to this project will appear here.</p>
			</div>

			<!-- Entries grouped by date -->
			<template v-else>
				<div v-for="group in groupedEntries" :key="group.date" class="mb-4">
					<div class="flex items-center justify-between mb-2 px-1">
						<h4 class="text-xs font-medium text-muted-foreground">{{ group.label }}</h4>
						<span class="text-xs text-muted-foreground">{{ formatHours(group.totalMinutes) }}</span>
					</div>
					<div class="space-y-2">
						<TimeTrackerEntryCard
							v-for="entry in group.entries"
							:key="entry.id"
							:entry="entry"
							show-user
							@edit="handleEdit"
							@delete="handleDelete"
						/>
					</div>
				</div>
			</template>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { TimeEntry } from '~~/types/directus';
import {
	format,
	subDays,
	subMonths,
	parseISO,
	isToday as dateFnsIsToday,
} from 'date-fns';
import type { ProjectTimeStats } from '~/composables/useTimeTracker';

const props = defineProps<{
	projectId: string;
	clientId?: string;
}>();

const {
	getTimeEntries,
	getProjectTimeStats,
	deleteTimeEntry,
	formatDuration,
} = useTimeTracker();

const loading = ref(true);
const entries = ref<TimeEntry[]>([]);
const timeStats = ref<ProjectTimeStats>({
	totalMinutes: 0,
	billableMinutes: 0,
	unbilledAmount: 0,
	billedAmount: 0,
	entryCount: 0,
});

const dateFrom = ref('');
const dateTo = ref(format(new Date(), 'yyyy-MM-dd'));
const activePreset = ref<string | null>('All Time');

const periodPresets = [
	{ label: 'All Time', getValue: () => ({ from: '', to: format(new Date(), 'yyyy-MM-dd') }) },
	{ label: '30 days', getValue: () => ({ from: format(subDays(new Date(), 30), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') }) },
	{ label: '3 months', getValue: () => ({ from: format(subMonths(new Date(), 3), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') }) },
	{ label: '6 months', getValue: () => ({ from: format(subMonths(new Date(), 6), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') }) },
];

function applyPreset(preset: (typeof periodPresets)[0]) {
	const range = preset.getValue();
	dateFrom.value = range.from;
	dateTo.value = range.to;
	activePreset.value = preset.label;
	fetchData();
}

// ── Grouped entries ───────────────────────────────────────
interface DateGroup {
	date: string;
	label: string;
	totalMinutes: number;
	entries: TimeEntry[];
}

const groupedEntries = computed<DateGroup[]>(() => {
	const groups = new Map<string, TimeEntry[]>();

	for (const entry of entries.value) {
		const dateKey = entry.date || format(new Date(entry.start_time), 'yyyy-MM-dd');
		if (!groups.has(dateKey)) groups.set(dateKey, []);
		groups.get(dateKey)!.push(entry);
	}

	const result: DateGroup[] = [];
	for (const [dateKey, dateEntries] of groups) {
		const parsed = parseISO(dateKey);
		const isEntryToday = dateFnsIsToday(parsed);
		const dayName = isEntryToday ? 'Today' : format(parsed, 'EEEE');
		const dateLabel = format(parsed, 'MMM d, yyyy');
		const totalMinutes = dateEntries.reduce((sum, e) => sum + (e.duration_minutes || 0), 0);

		result.push({
			date: dateKey,
			label: `${dayName}, ${dateLabel}`,
			totalMinutes,
			entries: dateEntries,
		});
	}

	return result.sort((a, b) => b.date.localeCompare(a.date));
});

// ── Fetch ──────────────────────────────────────────────────
async function fetchData() {
	loading.value = true;
	try {
		const [statsResult, entriesResult] = await Promise.all([
			getProjectTimeStats(props.projectId),
			getTimeEntries({
				projectId: props.projectId,
				status: 'completed',
				dateFrom: dateFrom.value || undefined,
				dateTo: dateTo.value || undefined,
				teamView: true,
				sort: ['-date', '-start_time'],
				limit: 500,
			}),
		]);

		timeStats.value = statsResult;
		entries.value = entriesResult.data;
	} catch (err) {
		console.error('Failed to fetch project time data:', err);
	} finally {
		loading.value = false;
	}
}

function handleEdit(entry: TimeEntry) {
	// TODO: open edit modal
}

async function handleDelete(entry: TimeEntry) {
	if (!confirm('Delete this time entry?')) return;
	try {
		await deleteTimeEntry(entry.id);
		await fetchData();
	} catch (err) {
		console.error('Failed to delete time entry:', err);
	}
}

// ── Helpers ────────────────────────────────────────────────
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

// ── Lifecycle ──────────────────────────────────────────────
onMounted(fetchData);
</script>
