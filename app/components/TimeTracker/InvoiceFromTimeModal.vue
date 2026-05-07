<template>
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
		@click.self="emit('close')"
	>
		<div class="ios-card shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto p-6 space-y-5">
			<div class="flex items-center justify-between">
				<h2 class="font-semibold text-lg">Generate Invoice from Time Entries</h2>
				<Button variant="ghost" size="icon-sm" @click="emit('close')">
					<Icon name="lucide:x" class="w-4 h-4" />
				</Button>
			</div>

			<!-- Multi-client warning -->
			<div
				v-if="multipleClients"
				class="rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-3 py-2.5 text-xs text-amber-800 dark:text-amber-300"
			>
				<div class="flex items-start gap-2">
					<Icon name="lucide:triangle-alert" class="w-4 h-4 mt-0.5 shrink-0" />
					<div>
						Selected entries span <span class="font-semibold">{{ uniqueClientNames.length }} different clients</span>.
						Pick entries from a single client and try again.
					</div>
				</div>
			</div>

			<!-- Summary -->
			<div class="grid grid-cols-3 gap-3">
				<div class="rounded-xl bg-muted/50 p-3 text-center">
					<p class="text-xs text-muted-foreground">Entries</p>
					<p class="text-lg font-semibold">{{ entries.length }}</p>
				</div>
				<div class="rounded-xl bg-muted/50 p-3 text-center">
					<p class="text-xs text-muted-foreground">Hours</p>
					<p class="text-lg font-semibold">{{ totalHours }}</p>
				</div>
				<div class="rounded-xl bg-muted/50 p-3 text-center">
					<p class="text-xs text-muted-foreground">Estimated Total</p>
					<p class="text-lg font-semibold text-emerald-600">${{ formatCurrency(estimatedTotal) }}</p>
				</div>
			</div>

			<!-- Grouping toggle -->
			<div>
				<h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Group time by</h3>
				<div class="inline-flex items-center gap-1 rounded-xl bg-muted/50 p-1 border border-border">
					<button
						v-for="opt in groupingOptions"
						:key="opt.value"
						class="px-3 py-1.5 rounded-lg text-[11px] uppercase tracking-wider font-medium transition-colors"
						:class="grouping === opt.value
							? 'bg-card text-foreground shadow-sm'
							: 'text-muted-foreground hover:text-foreground'"
						@click="grouping = opt.value"
					>
						{{ opt.label }}
					</button>
				</div>
				<p class="text-[10px] text-muted-foreground mt-1.5">{{ groupingHint }}</p>
			</div>

			<!-- Line Items Preview -->
			<div>
				<h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
					Line Items
					<span class="ml-1 text-muted-foreground/70 lowercase tracking-normal">({{ lineItemsPreview.length }})</span>
				</h3>
				<div class="space-y-2 max-h-44 overflow-y-auto pr-1">
					<div
						v-for="(item, idx) in lineItemsPreview"
						:key="idx"
						class="flex items-center justify-between rounded-lg bg-muted/30 p-3"
					>
						<div class="min-w-0 flex-1">
							<p class="text-sm font-medium truncate">{{ item.label }}</p>
							<p class="text-xs text-muted-foreground">{{ item.entryCount }} entries · {{ item.dateRange }}</p>
						</div>
						<div class="text-right shrink-0 ml-3">
							<p class="text-sm font-semibold tabular-nums">{{ item.hours }}h × ${{ item.rate }}</p>
							<p class="text-xs text-emerald-600">${{ formatCurrency(item.amount) }}</p>
						</div>
					</div>
				</div>
			</div>

			<!-- Invoice Fields -->
			<div class="space-y-3">
				<div>
					<label class="text-xs font-medium text-muted-foreground block mb-1">Client</label>
					<p class="text-sm font-medium">{{ clientName || 'Multiple / Unknown' }}</p>
				</div>
				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="text-xs font-medium text-muted-foreground block mb-1">Invoice Date</label>
						<input
							v-model="invoiceDate"
							type="date"
							class="w-full rounded-md border bg-background px-3 py-2 text-sm"
						/>
					</div>
					<div>
						<label class="text-xs font-medium text-muted-foreground block mb-1">Due Date</label>
						<input
							v-model="dueDate"
							type="date"
							class="w-full rounded-md border bg-background px-3 py-2 text-sm"
						/>
					</div>
				</div>
			</div>

			<!-- Actions -->
			<div class="flex justify-end gap-2 pt-2">
				<Button variant="outline" @click="emit('close')">Cancel</Button>
				<Button :disabled="submitting || !clientId || multipleClients" @click="handleSubmit">
					<Icon v-if="submitting" name="lucide:loader-2" class="w-4 h-4 mr-1 animate-spin" />
					<Icon v-else name="lucide:file-text" class="w-4 h-4 mr-1" />
					Create Invoice
				</Button>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { TimeEntry } from '~~/shared/directus';
import { Button } from '~/components/ui/button';
import { format, addDays } from 'date-fns';

const props = defineProps<{
	entries: TimeEntry[];
}>();

const emit = defineEmits<{
	close: [];
	created: [invoiceId: string];
}>();

const { generateInvoiceFromEntries, formatDuration } = useTimeTracker();
const toast = useToast();

type Grouping = 'project' | 'project_day' | 'entry';
const submitting = ref(false);
const invoiceDate = ref(format(new Date(), 'yyyy-MM-dd'));
const dueDate = ref(format(addDays(new Date(), 30), 'yyyy-MM-dd'));
const grouping = ref<Grouping>('project');

const groupingOptions: { value: Grouping; label: string }[] = [
	{ value: 'project', label: 'By project' },
	{ value: 'project_day', label: 'Project + day' },
	{ value: 'entry', label: 'One per entry' },
];

const groupingHint = computed(() => {
	if (grouping.value === 'project') return 'One line item per project. Each entry shows up as a row in the line item description.';
	if (grouping.value === 'project_day') return 'One line item per project per day — useful when daily detail matters.';
	return 'One line item per time entry — most granular, most line items.';
});

// ── Derived data ───────────────────────────────────────────
const uniqueClientNames = computed(() => {
	const set = new Map<string, string>();
	for (const e of props.entries) {
		const c = e.client as any;
		const id = typeof c === 'object' ? c?.id : c;
		const name = typeof c === 'object' ? (c?.name || id || 'Unknown') : (c || 'Unknown');
		if (id && !set.has(id)) set.set(id, String(name));
	}
	return Array.from(set.values());
});

const multipleClients = computed(() => uniqueClientNames.value.length > 1);

const clientId = computed(() => {
	const c = props.entries[0]?.client;
	if (!c) return null;
	return typeof c === 'object' ? (c as any).id : c;
});

const clientName = computed(() => {
	const c = props.entries[0]?.client;
	if (!c || typeof c !== 'object') return null;
	return (c as any).name || null;
});

const totalMinutes = computed(() =>
	props.entries.reduce((sum, e) => sum + (Number(e.duration_minutes) || 0), 0),
);

const totalHours = computed(() => {
	const h = Math.round((totalMinutes.value / 60) * 100) / 100;
	return h;
});

const estimatedTotal = computed(() =>
	props.entries.reduce((sum, e) => {
		const hours = (Number(e.duration_minutes) || 0) / 60;
		const rate = Number(e.hourly_rate) || 0;
		return sum + hours * rate;
	}, 0),
);

// ── Line items preview (matches generateInvoiceFromEntries grouping) ────
interface LineItemPreview {
	label: string;
	entryCount: number;
	hours: number;
	rate: number;
	amount: number;
	dateRange: string;
}

const lineItemsPreview = computed<LineItemPreview[]>(() => {
	const buckets = new Map<string, { label: string; entries: TimeEntry[] }>();

	for (const entry of props.entries) {
		const proj = entry.project as any;
		const projId = proj?.id || 'no-project';
		const projName = proj?.title || 'General';
		const date = (entry.date || entry.start_time || '').slice(0, 10);

		let key: string;
		let label: string;
		if (grouping.value === 'entry') {
			key = `${entry.id}`;
			label = `${projName}${date ? ` · ${date}` : ''}`;
		} else if (grouping.value === 'project_day') {
			key = `${projId}::${date}`;
			label = `${projName}${date ? ` · ${date}` : ''}`;
		} else {
			key = projId;
			label = projName;
		}

		if (!buckets.has(key)) buckets.set(key, { label, entries: [] });
		buckets.get(key)!.entries.push(entry);
	}

	const items: LineItemPreview[] = [];
	for (const [, group] of buckets) {
		const totalMins = group.entries.reduce((sum, e) => sum + (Number(e.duration_minutes) || 0), 0);
		const hours = Math.round((totalMins / 60) * 100) / 100;
		const rates = group.entries
			.map(e => Number(e.hourly_rate))
			.filter(n => Number.isFinite(n) && n > 0);
		const rate = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
		const dates = group.entries.map(e => e.date).filter(Boolean).sort() as string[];
		const dateRange = dates.length > 1
			? `${dates[0]} – ${dates[dates.length - 1]}`
			: dates[0] || '';

		items.push({
			label: group.label,
			entryCount: group.entries.length,
			hours,
			rate: Math.round(rate * 100) / 100,
			amount: Math.round(hours * rate * 100) / 100,
			dateRange,
		});
	}

	return items;
});

// ── Submit ─────────────────────────────────────────────────
async function handleSubmit() {
	if (!clientId.value || submitting.value || multipleClients.value) return;

	submitting.value = true;
	try {
		const invoice = await generateInvoiceFromEntries({
			entryIds: props.entries.map(e => e.id),
			clientId: clientId.value,
			invoiceDate: invoiceDate.value,
			dueDate: dueDate.value,
			grouping: grouping.value,
		});

		toast.add({
			title: 'Invoice Created',
			description: `Invoice ${(invoice as any).invoice_code || ''} has been created and ${props.entries.length} entries marked as billed.`,
			color: 'green',
		});

		emit('created', (invoice as any).id);
	} catch (err: any) {
		console.error('Failed to create invoice:', err);
		toast.add({
			title: 'Error',
			description: err?.message || 'Failed to create invoice',
			color: 'red',
		});
	} finally {
		submitting.value = false;
	}
}

function formatCurrency(value: number): string {
	return new Intl.NumberFormat('en-US', {
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(value);
}
</script>
