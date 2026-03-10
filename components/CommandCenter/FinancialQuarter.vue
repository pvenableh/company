<script setup lang="ts">
const invoiceItems = useDirectusItems('invoices');
const { selectedOrg } = useOrganization();

const isLoading = ref(true);
const currentYear = new Date().getFullYear();
const selectedYear = ref(currentYear);

interface QuarterData {
	label: string;
	goal: number;
	actual: number;
	paid: number;
	pending: number;
	invoiceCount: number;
	paidCount: number;
}

const quarters = ref<QuarterData[]>([]);
const yearlyGoal = ref(0);
const editingGoals = ref(false);
const goalInputs = ref<number[]>([0, 0, 0, 0]);

// Quarter date ranges
const getQuarterRange = (q: number, year: number) => {
	const starts = [`${year}-01-01`, `${year}-04-01`, `${year}-07-01`, `${year}-10-01`];
	const ends = [`${year}-03-31`, `${year}-06-30`, `${year}-09-30`, `${year}-12-31`];
	return { start: starts[q], end: ends[q] };
};

// Load and analyze invoice data
const loadFinancials = async () => {
	isLoading.value = true;

	try {
		const filter: any = {
			_and: [
				{ invoice_date: { _gte: `${selectedYear.value}-01-01` } },
				{ invoice_date: { _lte: `${selectedYear.value}-12-31` } },
			],
		};

		if (selectedOrg.value) {
			filter._and.push({ bill_to: { _eq: selectedOrg.value } });
		}

		const invoices = await invoiceItems.list({
			fields: ['id', 'status', 'invoice_date', 'due_date', 'total_amount', 'bill_to.name'],
			filter,
			sort: ['invoice_date'],
			limit: 500,
		});

		// Process by quarter
		const qData: QuarterData[] = [];
		const labels = ['Q1', 'Q2', 'Q3', 'Q4'];

		for (let q = 0; q < 4; q++) {
			const { start, end } = getQuarterRange(q, selectedYear.value);
			const startDate = new Date(start);
			const endDate = new Date(end);

			const quarterInvoices = invoices.filter((inv: any) => {
				const d = new Date(inv.invoice_date);
				return d >= startDate && d <= endDate;
			});

			const total = quarterInvoices.reduce((sum: number, inv: any) => sum + (Number(inv.total_amount) || 0), 0);
			const paidInvoices = quarterInvoices.filter((inv: any) => inv.status === 'paid');
			const paidTotal = paidInvoices.reduce((sum: number, inv: any) => sum + (Number(inv.total_amount) || 0), 0);
			const pendingTotal = total - paidTotal;

			qData.push({
				label: labels[q],
				goal: goalInputs.value[q] || 0,
				actual: total,
				paid: paidTotal,
				pending: pendingTotal,
				invoiceCount: quarterInvoices.length,
				paidCount: paidInvoices.length,
			});
		}

		quarters.value = qData;
		yearlyGoal.value = goalInputs.value.reduce((sum, g) => sum + g, 0);
	} catch (e) {
		console.warn('[Financials] Could not load data:', e);
	} finally {
		isLoading.value = false;
	}
};

const yearlyActual = computed(() => quarters.value.reduce((sum, q) => sum + q.actual, 0));
const yearlyPaid = computed(() => quarters.value.reduce((sum, q) => sum + q.paid, 0));
const yearlyPending = computed(() => quarters.value.reduce((sum, q) => sum + q.pending, 0));

const formatCurrency = (val: number) => {
	return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(val);
};

const getProgressPercent = (actual: number, goal: number) => {
	if (!goal) return 0;
	return Math.min(Math.round((actual / goal) * 100), 100);
};

const getProgressColor = (actual: number, goal: number) => {
	const pct = getProgressPercent(actual, goal);
	if (pct >= 100) return 'bg-green-500';
	if (pct >= 75) return 'bg-blue-500';
	if (pct >= 50) return 'bg-amber-500';
	return 'bg-red-500';
};

const saveGoals = () => {
	editingGoals.value = false;
	// Persist goals to localStorage
	if (import.meta.client) {
		localStorage.setItem(`financial-goals-${selectedYear.value}`, JSON.stringify(goalInputs.value));
	}
	loadFinancials();
};

const loadSavedGoals = () => {
	if (import.meta.client) {
		const saved = localStorage.getItem(`financial-goals-${selectedYear.value}`);
		if (saved) {
			goalInputs.value = JSON.parse(saved);
		} else {
			goalInputs.value = [0, 0, 0, 0];
		}
	}
};

watch(selectedYear, () => {
	loadSavedGoals();
	loadFinancials();
});

watch(selectedOrg, () => {
	loadFinancials();
});

onMounted(() => {
	loadSavedGoals();
	loadFinancials();
});
</script>

<template>
	<div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
		<!-- Header -->
		<div class="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700">
			<div class="flex items-center gap-2">
				<UIcon name="i-heroicons-chart-bar" class="w-5 h-5 text-green-500" />
				<h3 class="text-sm font-semibold uppercase tracking-wide">Financial Analysis</h3>
			</div>
			<div class="flex items-center gap-2">
				<button
					@click="editingGoals = !editingGoals"
					class="text-xs text-primary hover:underline"
				>
					{{ editingGoals ? 'Cancel' : 'Set Goals' }}
				</button>
				<select
					v-model="selectedYear"
					class="text-xs border border-gray-200 dark:border-gray-600 rounded-md px-2 py-1 bg-transparent dark:text-white focus:outline-none focus:ring-1 focus:ring-primary"
				>
					<option :value="currentYear - 1">{{ currentYear - 1 }}</option>
					<option :value="currentYear">{{ currentYear }}</option>
					<option :value="currentYear + 1">{{ currentYear + 1 }}</option>
				</select>
			</div>
		</div>

		<!-- Goal Editor -->
		<div v-if="editingGoals" class="p-4 bg-blue-50/50 dark:bg-blue-900/10 border-b border-gray-100 dark:border-gray-700">
			<p class="text-xs text-gray-500 mb-3">Set quarterly revenue goals:</p>
			<div class="grid grid-cols-4 gap-3">
				<div v-for="(_, idx) in goalInputs" :key="idx">
					<label class="text-[10px] uppercase font-bold text-gray-500 block mb-1">Q{{ idx + 1 }}</label>
					<input
						v-model.number="goalInputs[idx]"
						type="number"
						min="0"
						step="1000"
						class="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-md px-2 py-1 bg-transparent dark:text-white focus:outline-none focus:ring-1 focus:ring-primary"
						placeholder="0"
					/>
				</div>
			</div>
			<button
				@click="saveGoals"
				class="mt-3 text-xs bg-primary text-white px-4 py-1.5 rounded-md hover:bg-primary/90 transition-colors"
			>
				Save Goals
			</button>
		</div>

		<div v-if="isLoading" class="p-8 flex items-center justify-center">
			<UIcon name="i-heroicons-arrow-path" class="w-5 h-5 animate-spin text-gray-400" />
		</div>

		<div v-else class="p-4">
			<!-- Yearly Summary -->
			<div class="grid grid-cols-3 gap-4 mb-6 text-center">
				<div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
					<p class="text-lg font-bold text-gray-900 dark:text-white">{{ formatCurrency(yearlyActual) }}</p>
					<p class="text-[10px] uppercase tracking-wide text-gray-500">Total Billed</p>
				</div>
				<div class="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
					<p class="text-lg font-bold text-green-600">{{ formatCurrency(yearlyPaid) }}</p>
					<p class="text-[10px] uppercase tracking-wide text-gray-500">Collected</p>
				</div>
				<div class="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
					<p class="text-lg font-bold text-amber-600">{{ formatCurrency(yearlyPending) }}</p>
					<p class="text-[10px] uppercase tracking-wide text-gray-500">Outstanding</p>
				</div>
			</div>

			<!-- Quarter Breakdown -->
			<div class="space-y-4">
				<div
					v-for="q in quarters"
					:key="q.label"
					class="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3"
				>
					<div class="flex items-center justify-between mb-2">
						<div class="flex items-center gap-2">
							<span class="text-sm font-bold text-gray-700 dark:text-gray-300">{{ q.label }}</span>
							<span class="text-[10px] text-gray-400">{{ q.invoiceCount }} invoices</span>
						</div>
						<div class="text-right">
							<p class="text-sm font-bold text-gray-900 dark:text-white">{{ formatCurrency(q.actual) }}</p>
							<p v-if="q.goal" class="text-[10px] text-gray-400">
								Goal: {{ formatCurrency(q.goal) }}
							</p>
						</div>
					</div>

					<!-- Progress bar -->
					<div v-if="q.goal" class="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2 mb-2">
						<div
							:class="getProgressColor(q.paid, q.goal)"
							class="h-2 rounded-full transition-all duration-500"
							:style="{ width: getProgressPercent(q.paid, q.goal) + '%' }"
						/>
					</div>

					<!-- Paid vs Pending breakdown -->
					<div class="flex items-center gap-4 text-[10px]">
						<div class="flex items-center gap-1">
							<span class="w-2 h-2 rounded-full bg-green-500"></span>
							<span class="text-gray-500">Paid: {{ formatCurrency(q.paid) }} ({{ q.paidCount }})</span>
						</div>
						<div class="flex items-center gap-1">
							<span class="w-2 h-2 rounded-full bg-amber-500"></span>
							<span class="text-gray-500">Pending: {{ formatCurrency(q.pending) }}</span>
						</div>
						<div v-if="q.goal" class="ml-auto">
							<span
								:class="q.paid >= q.goal ? 'text-green-500' : 'text-gray-400'"
								class="font-bold"
							>
								{{ getProgressPercent(q.paid, q.goal) }}%
							</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>
