<template>
	<div class="space-y-6">
		<!-- Client context -->
		<p v-if="clientLabel" class="text-xs text-muted-foreground">
			Viewing entries for <span class="font-medium text-foreground">{{ clientLabel }}</span>
		</p>

		<!-- Filters -->
		<div class="ios-card rounded-2xl border border-border bg-card p-5">
			<div class="flex flex-col sm:flex-row items-start sm:items-center gap-3">
				<!-- Period presets -->
				<div class="flex flex-wrap gap-1.5">
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

				<!-- Filters row -->
				<div class="flex items-center gap-2 ml-auto flex-wrap">
					<!-- User filter -->
					<select
						v-model="selectedUserId"
						class="rounded-md border bg-background px-2.5 py-1 text-xs min-w-[140px]"
						@change="fetchTeamData()"
					>
						<option value="">All Members</option>
						<option v-for="m in orgMembers" :key="m.id" :value="m.id">
							{{ m.label }}
						</option>
					</select>

					<!-- Custom date range -->
					<input
						v-model="dateFrom"
						type="date"
						class="rounded-md border bg-background px-2.5 py-1 text-xs"
						@change="activePreset = null; fetchTeamData()"
					/>
					<span class="text-xs text-muted-foreground">→</span>
					<input
						v-model="dateTo"
						type="date"
						class="rounded-md border bg-background px-2.5 py-1 text-xs"
						@change="activePreset = null; fetchTeamData()"
					/>
				</div>
			</div>
		</div>

		<!-- Loading -->
		<div v-if="loading" class="flex items-center justify-center min-h-[400px]">
			<Icon name="lucide:loader-2" class="w-6 h-6 text-muted-foreground animate-spin" />
		</div>

		<template v-else>
			<!-- Summary Cards -->
			<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
				<div class="ios-card rounded-2xl border border-border bg-card p-4 space-y-1">
					<p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Team Hours</p>
					<p class="text-2xl font-semibold text-foreground tabular-nums">{{ formatHours(summaryTotalMinutes) }}</p>
					<p class="text-xs text-muted-foreground">{{ totalEntryCount }} entries</p>
				</div>
				<div class="ios-card rounded-2xl border border-border bg-card p-4 space-y-1">
					<p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Billable Hours</p>
					<p class="text-2xl font-semibold text-foreground tabular-nums">{{ formatHours(summaryBillableMinutes) }}</p>
					<p class="text-xs text-muted-foreground">
						{{ billablePercent }}% billable
					</p>
				</div>
				<div class="ios-card rounded-2xl border border-border bg-card p-4 space-y-1">
					<p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Revenue</p>
					<p class="text-2xl font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
						${{ formatCurrency(summaryTotalRevenue) }}
					</p>
				</div>
				<div class="ios-card rounded-2xl border border-border bg-card p-4 space-y-1">
					<p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active Members</p>
					<p class="text-2xl font-semibold text-foreground tabular-nums">{{ teamSummary.length }}</p>
					<p class="text-xs text-muted-foreground">of {{ orgMembers.length }} total</p>
				</div>
			</div>

			<!-- Per-User Summary -->
			<div v-if="teamSummary.length" class="ios-card rounded-2xl border border-border bg-card p-5">
				<h3 class="font-medium text-sm flex items-center gap-2 mb-4">
					<Icon name="lucide:users" class="w-4 h-4 text-muted-foreground" />
					Hours by Team Member
				</h3>
				<div class="space-y-3">
					<div
						v-for="member in teamSummary"
						:key="member.userId"
						class="flex items-center gap-3"
					>
						<div class="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden">
							<NuxtImg v-if="member.userAvatar" :src="member.userAvatar" :alt="member.userName" class="w-full h-full object-cover" />
							<Icon v-else name="lucide:user" class="w-3.5 h-3.5 text-muted-foreground" />
						</div>
						<div class="flex-1 min-w-0">
							<div class="flex items-center justify-between mb-1">
								<span class="text-sm font-medium truncate">{{ member.userName }}</span>
								<span class="text-sm font-semibold ml-2 tabular-nums">{{ formatHours(member.totalMinutes) }}</span>
							</div>
							<div class="w-full h-1.5 bg-muted rounded-full overflow-hidden">
								<div class="flex h-full rounded-full overflow-hidden">
									<div
										class="h-full bg-emerald-500 transition-all"
										:style="{ width: maxMemberMinutes > 0 ? `${(member.billableMinutes / maxMemberMinutes) * 100}%` : '0%' }"
									/>
									<div
										class="h-full bg-blue-400 transition-all"
										:style="{ width: maxMemberMinutes > 0 ? `${((member.totalMinutes - member.billableMinutes) / maxMemberMinutes) * 100}%` : '0%' }"
									/>
								</div>
							</div>
							<div class="flex justify-between mt-0.5 text-[10px] text-muted-foreground">
								<span>{{ member.entryCount }} entries · {{ Math.round((member.billableMinutes / Math.max(member.totalMinutes, 1)) * 100) }}% billable</span>
								<span v-if="member.totalRevenue > 0" class="text-emerald-500">${{ formatCurrency(member.totalRevenue) }}</span>
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Entries List with Selection -->
			<div class="ios-card rounded-2xl border border-border bg-card p-5">
				<div class="flex items-center justify-between mb-4">
					<h3 class="font-medium text-sm flex items-center gap-2">
						<Icon name="lucide:list" class="w-4 h-4 text-muted-foreground" />
						Entries
						<span class="text-xs text-muted-foreground ml-1">({{ allEntries.length }})</span>
					</h3>
					<div class="flex items-center gap-2">
						<Button
							v-if="unbilledBillableEntries.length > 0"
							variant="ghost"
							size="sm"
							class="text-xs"
							@click="selectAllUnbilled"
						>
							Select All Unbilled
						</Button>
						<Button
							v-if="selectedIds.size > 0"
							variant="ghost"
							size="sm"
							class="text-xs"
							@click="selectedIds.clear()"
						>
							Clear ({{ selectedIds.size }})
						</Button>
					</div>
				</div>

				<div v-if="!allEntries.length" class="py-8 text-center text-sm text-muted-foreground">
					No entries for this period
				</div>

				<div v-else>
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
								selectable
								:selected="selectedIds.has(entry.id)"
								@select="toggleSelection"
								@edit="openEditModal"
								@delete="handleDelete"
							/>
						</div>
					</div>
				</div>
			</div>

			<!-- Selection Action Bar -->
			<Teleport to="body">
				<Transition name="slide-up">
					<div
						v-if="selectedIds.size > 0"
						class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-card border border-border shadow-xl rounded-2xl px-5 py-3"
					>
						<span class="text-sm font-medium">{{ selectedIds.size }} entries selected</span>
						<span class="text-xs text-muted-foreground">{{ formatHours(selectedTotalMinutes) }} · ${{ formatCurrency(selectedRevenue) }}</span>
						<Button size="sm" @click="showInvoiceModal = true">
							<Icon name="lucide:file-text" class="w-4 h-4 mr-1" />
							Generate Invoice
						</Button>
						<Button variant="ghost" size="sm" @click="selectedIds.clear()">
							<Icon name="lucide:x" class="w-4 h-4" />
						</Button>
					</div>
				</Transition>
			</Teleport>

			<!-- Invoice Generation Modal -->
			<Teleport to="body">
				<TimeTrackerInvoiceFromTimeModal
					v-if="showInvoiceModal"
					:entries="selectedEntries"
					@close="showInvoiceModal = false"
					@created="handleInvoiceCreated"
				/>
			</Teleport>

			<!-- Edit Entry Modal -->
			<Teleport to="body">
				<div
					v-if="showEditModal"
					class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
					@click.self="closeEditModal"
				>
					<div class="ios-card shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto p-6">
						<h2 class="font-semibold mb-4">Edit Entry</h2>
						<TimeTrackerEntryForm
							:show="showEditModal"
							:entry="editingEntry"
							@save="handleEditSave"
							@cancel="closeEditModal"
						/>
					</div>
				</div>
			</Teleport>
		</template>
	</div>
</template>

<script setup lang="ts">
import type { TimeEntry } from '~~/shared/directus';
import { Button } from '~/components/ui/button';
import {
	format,
	subDays,
	subMonths,
	startOfWeek,
	endOfWeek,
	startOfMonth,
	endOfMonth,
	parseISO,
	isToday as dateFnsIsToday,
} from 'date-fns';
import type { TeamMemberSummary } from '~/composables/useTimeTracker';

const { getTimeEntries, getOrgMembers, getTeamSummary, deleteTimeEntry, formatDuration } = useTimeTracker();
const { selectedClient, currentClient } = useClients();

const clientLabel = computed(() => {
	if (!currentClient.value || currentClient.value.id === 'org') return null;
	return currentClient.value.name || null;
});

// ── Date range ─────────────────────────────────────────────
const dateFrom = ref('');
const dateTo = ref(format(new Date(), 'yyyy-MM-dd'));
const activePreset = ref<string | null>('All Time');
const selectedUserId = ref('');

const periodPresets = [
	{ label: 'All Time', getValue: () => ({ from: '', to: format(new Date(), 'yyyy-MM-dd') }) },
	{ label: 'Today', getValue: () => ({ from: format(new Date(), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') }) },
	{ label: 'This Week', getValue: () => ({ from: format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'), to: format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd') }) },
	{ label: 'This Month', getValue: () => ({ from: format(startOfMonth(new Date()), 'yyyy-MM-dd'), to: format(endOfMonth(new Date()), 'yyyy-MM-dd') }) },
	{ label: '30 days', getValue: () => ({ from: format(subDays(new Date(), 30), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') }) },
	{ label: '3 months', getValue: () => ({ from: format(subMonths(new Date(), 3), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') }) },
	{ label: '6 months', getValue: () => ({ from: format(subMonths(new Date(), 6), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') }) },
];

function applyPreset(preset: (typeof periodPresets)[0]) {
	const range = preset.getValue();
	dateFrom.value = range.from;
	dateTo.value = range.to;
	activePreset.value = preset.label;
	fetchTeamData();
}

// ── Data ───────────────────────────────────────────────────
const orgMembers = ref<any[]>([]);
const teamSummary = ref<TeamMemberSummary[]>([]);
const allEntries = ref<TimeEntry[]>([]);
const loading = ref(true);
const showInvoiceModal = ref(false);
const showEditModal = ref(false);
const editingEntry = ref<TimeEntry | null>(null);

// ── Selection ──────────────────────────────────────────────
const selectedIds = reactive(new Set<string | number>());

function toggleSelection(entry: TimeEntry) {
	if (selectedIds.has(entry.id)) {
		selectedIds.delete(entry.id);
	} else {
		selectedIds.add(entry.id);
	}
}

const unbilledBillableEntries = computed(() =>
	allEntries.value.filter(e => e.billable && !e.billed),
);

function selectAllUnbilled() {
	for (const e of unbilledBillableEntries.value) {
		selectedIds.add(e.id);
	}
}

const selectedEntries = computed(() =>
	allEntries.value.filter(e => selectedIds.has(e.id)),
);

const selectedTotalMinutes = computed(() =>
	selectedEntries.value.reduce((sum, e) => sum + (e.duration_minutes || 0), 0),
);

const selectedRevenue = computed(() =>
	selectedEntries.value.reduce((sum, e) => {
		if (!e.billable) return sum;
		const hours = (e.duration_minutes || 0) / 60;
		return sum + hours * (e.hourly_rate || 0);
	}, 0),
);

// ── Computed summaries ────────────────────────────────────
const summaryTotalMinutes = computed(() =>
	teamSummary.value.reduce((sum, m) => sum + m.totalMinutes, 0),
);
const summaryBillableMinutes = computed(() =>
	teamSummary.value.reduce((sum, m) => sum + m.billableMinutes, 0),
);
const summaryTotalRevenue = computed(() =>
	teamSummary.value.reduce((sum, m) => sum + m.totalRevenue, 0),
);
const totalEntryCount = computed(() =>
	teamSummary.value.reduce((sum, m) => sum + m.entryCount, 0),
);
const billablePercent = computed(() => {
	if (summaryTotalMinutes.value === 0) return 0;
	return Math.round((summaryBillableMinutes.value / summaryTotalMinutes.value) * 100);
});
const maxMemberMinutes = computed(() => {
	if (!teamSummary.value.length) return 0;
	return teamSummary.value[0].totalMinutes;
});

// ── Grouped entries ───────────────────────────────────────
interface DateGroup {
	date: string;
	label: string;
	totalMinutes: number;
	entries: TimeEntry[];
}

const groupedEntries = computed<DateGroup[]>(() => {
	const groups = new Map<string, TimeEntry[]>();

	for (const entry of allEntries.value) {
		const dateKey = entry.date || format(new Date(entry.start_time), 'yyyy-MM-dd');
		if (!groups.has(dateKey)) groups.set(dateKey, []);
		groups.get(dateKey)!.push(entry);
	}

	const result: DateGroup[] = [];
	for (const [dateKey, entries] of groups) {
		const parsed = parseISO(dateKey);
		const isEntryToday = dateFnsIsToday(parsed);
		const dayName = isEntryToday ? 'Today' : format(parsed, 'EEEE');
		const dateLabel = format(parsed, 'MMM d, yyyy');
		const totalMinutes = entries.reduce((sum, e) => sum + (e.duration_minutes || 0), 0);

		result.push({
			date: dateKey,
			label: `${dayName}, ${dateLabel}`,
			totalMinutes,
			entries,
		});
	}

	return result.sort((a, b) => b.date.localeCompare(a.date));
});

// ── Edit / Delete ─────────────────────────────────────────
function openEditModal(entry: TimeEntry) {
	editingEntry.value = entry;
	showEditModal.value = true;
}

function closeEditModal() {
	showEditModal.value = false;
	editingEntry.value = null;
}

async function handleEditSave() {
	closeEditModal();
	await fetchTeamData();
}

async function handleDelete(entry: TimeEntry) {
	if (!confirm('Delete this time entry?')) return;
	try {
		await deleteTimeEntry(entry.id);
		await fetchTeamData();
	} catch (err) {
		console.error('Failed to delete time entry:', err);
	}
}

// ── Fetch ──────────────────────────────────────────────────
async function fetchTeamData() {
	loading.value = true;
	try {
		const [members, summary, entriesResult] = await Promise.all([
			getOrgMembers(),
			getTeamSummary({
				dateFrom: dateFrom.value,
				dateTo: dateTo.value,
			}),
			getTimeEntries({
				dateFrom: dateFrom.value,
				dateTo: dateTo.value,
				status: 'completed',
				teamView: true,
				userId: selectedUserId.value || undefined,
				sort: ['-date', '-start_time'],
				limit: 500,
			}),
		]);

		orgMembers.value = members;
		teamSummary.value = selectedUserId.value
			? summary.filter(s => s.userId === selectedUserId.value)
			: summary;
		allEntries.value = entriesResult.data;
	} catch (err) {
		console.error('Failed to fetch team data:', err);
	} finally {
		loading.value = false;
	}
}

async function handleInvoiceCreated() {
	showInvoiceModal.value = false;
	selectedIds.clear();
	await fetchTeamData();
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
onMounted(fetchTeamData);

watch(() => selectedClient.value, fetchTeamData);
</script>

<style scoped>
.slide-up-enter-active,
.slide-up-leave-active {
	transition: all 0.3s ease;
}
.slide-up-enter-from,
.slide-up-leave-to {
	opacity: 0;
	transform: translate(-50%, 20px);
}
</style>
