<script setup lang="ts">
const invoiceItems = useDirectusItems('invoices');
const expenseItems = useDirectusItems('expenses');
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
	expenses: number;
	net: number;
}

const quarters = ref<QuarterData[]>([]);
const yearlyGoal = ref(0);
const editingGoals = ref(false);
const goalInputs = ref<number[]>([0, 0, 0, 0]);
const showHelp = ref(false);

// Quarter date ranges
const getQuarterRange = (q: number, year: number) => {
	const starts = [`${year}-01-01`, `${year}-04-01`, `${year}-07-01`, `${year}-10-01`];
	const ends = [`${year}-03-31`, `${year}-06-30`, `${year}-09-30`, `${year}-12-31`];
	return { start: starts[q], end: ends[q] };
};

// Load and analyze invoice + expense data
const loadFinancials = async () => {
	isLoading.value = true;

	try {
		const invoiceFilter: any = {
			_and: [
				{ invoice_date: { _gte: `${selectedYear.value}-01-01` } },
				{ invoice_date: { _lte: `${selectedYear.value}-12-31` } },
			],
		};
		const expenseFilter: any = {
			_and: [
				{ date: { _gte: `${selectedYear.value}-01-01` } },
				{ date: { _lte: `${selectedYear.value}-12-31` } },
			],
		};

		if (selectedOrg.value) {
			invoiceFilter._and.push({ bill_to: { _eq: selectedOrg.value } });
			expenseFilter._and.push({ organization: { _eq: selectedOrg.value } });
		}

		// Fetch invoices and expenses in parallel
		const [invoices, expenseRecords] = await Promise.all([
			invoiceItems.list({
				fields: ['id', 'status', 'invoice_date', 'due_date', 'total_amount', 'bill_to.name'],
				filter: invoiceFilter,
				sort: ['invoice_date'],
				limit: 500,
			}),
			expenseItems.list({
				fields: ['id', 'amount', 'date'],
				filter: expenseFilter,
				sort: ['date'],
				limit: 1000,
			}),
		]);

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

			// Calculate expenses for this quarter
			const quarterExpenses = (expenseRecords as any[]).filter((exp: any) => {
				const d = new Date(exp.date);
				return d >= startDate && d <= endDate;
			});
			const expenseTotal = quarterExpenses.reduce((sum: number, exp: any) => sum + (Number(exp.amount) || 0), 0);

			qData.push({
				label: labels[q],
				goal: goalInputs.value[q] || 0,
				actual: total,
				paid: paidTotal,
				pending: pendingTotal,
				invoiceCount: quarterInvoices.length,
				paidCount: paidInvoices.length,
				expenses: expenseTotal,
				net: paidTotal - expenseTotal,
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
const yearlyExpenses = computed(() => quarters.value.reduce((sum, q) => sum + q.expenses, 0));
const yearlyNet = computed(() => yearlyPaid.value - yearlyExpenses.value);

// Projections (current year only, trailing average)
const projection = computed(() => {
	if (selectedYear.value !== currentYear) return null;

	const now = new Date();
	const completedMonths = now.getMonth(); // 0-indexed, so Jan=0 means 0 completed
	if (completedMonths < 2) return null; // Need at least 2 months

	const avgMonthlyIncome = yearlyPaid.value / completedMonths;
	const avgMonthlyExpenses = yearlyExpenses.value / completedMonths;
	const remainingMonths = 12 - completedMonths;

	return {
		projectedIncome: yearlyPaid.value + (remainingMonths * avgMonthlyIncome),
		projectedExpenses: yearlyExpenses.value + (remainingMonths * avgMonthlyExpenses),
		projectedNet: yearlyNet.value + (remainingMonths * (avgMonthlyIncome - avgMonthlyExpenses)),
	};
});

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
					@click="showHelp = !showHelp"
					class="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
					title="How are financials calculated?"
				>
					<UIcon name="i-heroicons-question-mark-circle" class="w-4 h-4" />
				</button>
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

		<!-- How It Works -->
		<div v-if="showHelp" class="p-4 bg-gray-50/80 dark:bg-gray-700/30 border-b border-gray-100 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400 space-y-2">
			<p class="font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide text-[10px] mb-2">How financials are calculated</p>
			<ul class="space-y-1.5 list-none">
				<li><span class="font-medium text-gray-700 dark:text-gray-300">Total Billed</span> &mdash; The sum of all invoice amounts for the selected year.</li>
				<li><span class="font-medium text-green-600">Collected</span> &mdash; Invoices with status "paid." This is actual revenue received.</li>
				<li><span class="font-medium text-amber-600">Outstanding</span> &mdash; Total Billed minus Collected.</li>
				<li><span class="font-medium text-red-500">Expenses</span> &mdash; Total expenses recorded for the period.</li>
				<li><span class="font-medium text-emerald-600">Net Income</span> &mdash; Collected minus Expenses.</li>
			</ul>
		</div>

		<div v-if="isLoading" class="p-8 flex items-center justify-center">
			<UIcon name="i-heroicons-arrow-path" class="w-5 h-5 animate-spin text-gray-400" />
		</div>

		<div v-else class="p-4">
			<!-- Yearly Summary -->
			<div class="grid grid-cols-5 gap-3 mb-6 text-center">
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
				<div class="bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
					<p class="text-lg font-bold text-red-500">{{ formatCurrency(yearlyExpenses) }}</p>
					<p class="text-[10px] uppercase tracking-wide text-gray-500">Expenses</p>
				</div>
				<div class="rounded-lg p-3" :class="yearlyNet >= 0 ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-red-50 dark:bg-red-900/20'">
					<p class="text-lg font-bold" :class="yearlyNet >= 0 ? 'text-emerald-600' : 'text-red-600'">{{ formatCurrency(yearlyNet) }}</p>
					<p class="text-[10px] uppercase tracking-wide text-gray-500">Net Income</p>
				</div>
			</div>

			<!-- Projection (current year only) -->
			<div v-if="projection" class="mb-6 p-3 bg-blue-50/50 dark:bg-blue-900/10 rounded-lg border border-blue-200/30 dark:border-blue-800/30">
				<p class="text-[10px] font-semibold uppercase tracking-wider text-blue-500 mb-2">Year-End Projection</p>
				<div class="grid grid-cols-3 gap-3 text-center">
					<div>
						<p class="text-sm font-bold text-green-600">{{ formatCurrency(projection.projectedIncome) }}</p>
						<p class="text-[10px] text-gray-500">Projected Income</p>
					</div>
					<div>
						<p class="text-sm font-bold text-red-500">{{ formatCurrency(projection.projectedExpenses) }}</p>
						<p class="text-[10px] text-gray-500">Projected Expenses</p>
					</div>
					<div>
						<p class="text-sm font-bold" :class="projection.projectedNet >= 0 ? 'text-emerald-600' : 'text-red-600'">{{ formatCurrency(projection.projectedNet) }}</p>
						<p class="text-[10px] text-gray-500">Projected Net</p>
					</div>
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

					<!-- Paid vs Pending vs Expenses breakdown -->
					<div class="flex items-center gap-4 text-[10px] flex-wrap">
						<div class="flex items-center gap-1">
							<span class="w-2 h-2 rounded-full bg-green-500"></span>
							<span class="text-gray-500">Paid: {{ formatCurrency(q.paid) }} ({{ q.paidCount }})</span>
						</div>
						<div class="flex items-center gap-1">
							<span class="w-2 h-2 rounded-full bg-amber-500"></span>
							<span class="text-gray-500">Pending: {{ formatCurrency(q.pending) }}</span>
						</div>
						<div class="flex items-center gap-1">
							<span class="w-2 h-2 rounded-full bg-red-500"></span>
							<span class="text-gray-500">Expenses: {{ formatCurrency(q.expenses) }}</span>
						</div>
						<div class="flex items-center gap-1 ml-auto">
							<span class="font-bold" :class="q.net >= 0 ? 'text-emerald-500' : 'text-red-500'">
								Net: {{ formatCurrency(q.net) }}
							</span>
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
