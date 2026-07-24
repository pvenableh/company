<script setup lang="ts">
import type { Goal } from '~~/shared/directus';

const invoiceItems = useDirectusItems('invoices');
const expenseItems = useDirectusItems('expenses');
const { selectedOrg } = useOrganization();
// Quarterly revenue targets live in the unified `goals` collection. Reads +
// writes go through useGoals so GoalsSummaryWidget + /goals stay in sync.
const { goals, createGoal, updateGoal, refresh: refreshGoals } = useGoals();

const isLoading = ref(true);
const currentYear = new Date().getFullYear();
const selectedYear = ref(currentYear);

// Build the deterministic filter for "this org's quarterly revenue goals
// for the selected year." Stage 1's migration writes scope='organization',
// category='revenue', timeframe='quarterly', start_date inside the quarter.
const yearQuarterGoals = computed<Goal[]>(() => {
	const year = selectedYear.value;
	const startBoundary = `${year}-01-01`;
	const endBoundary = `${year}-12-31`;
	return (goals.value || []).filter((g: Goal) => {
		if (g.scope !== 'organization') return false;
		if (g.category !== 'revenue') return false;
		if (g.timeframe !== 'quarterly') return false;
		if (!g.start_date) return false;
		return g.start_date >= startBoundary && g.start_date <= endBoundary;
	});
});

// Prefer the migration's stamped metadata; fall back to deriving from
// start_date for hand-created rows.
function quarterOf(goal: Goal): number | null {
	const stamped = (goal.metadata as any)?.quarter;
	if (typeof stamped === 'number' && stamped >= 1 && stamped <= 4) return stamped;
	if (!goal.start_date) return null;
	const month = new Date(goal.start_date).getMonth();
	if (Number.isNaN(month)) return null;
	return Math.floor(month / 3) + 1;
}

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

interface MonthlyPoint { month: string; income: number; expenses: number; }
interface CategoryItem { category: string; label: string; amount: number; color: string; percent: number; }

const monthlyData = ref<MonthlyPoint[]>([]);
const expenseCategories = ref<CategoryItem[]>([]);

const CATEGORY_LABELS: Record<string, string> = {
	software: 'Software', hardware: 'Hardware', travel: 'Travel', marketing: 'Marketing',
	office: 'Office', contractor: 'Contractors', hosting: 'Hosting', insurance: 'Insurance',
	legal: 'Legal', other: 'Other',
};
// Categorical expense colours come from the palette-driven tag ramp
// (--tag-1…8, re-skinned live by applyPaletteToDocument) instead of
// hardcoded hex, so the breakdown follows the active theme/palette.
// Assigned by sorted render order below, so the largest categories always
// land on distinct slots (the ramp has 8 — see TAG_RAMP_LENGTH).
const tagColor = (i: number) => `hsl(var(--tag-${(i % 8) + 1}))`;
const editingGoals = ref(false);
const goalInputs = ref<number[]>([0, 0, 0, 0]);
const showHelp = ref(false);

// Quarter date ranges
const getQuarterRange = (q: number, year: number) => {
	const starts = [`${year}-01-01`, `${year}-04-01`, `${year}-07-01`, `${year}-10-01`];
	const ends = [`${year}-03-31`, `${year}-06-30`, `${year}-09-30`, `${year}-12-31`];
	return { start: starts[q]!, end: ends[q]! };
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
			invoiceFilter._and.push({
				_or: [
					{ bill_to: { _eq: selectedOrg.value } },
					{ client: { organization: { _eq: selectedOrg.value } } },
				],
			});
			expenseFilter._and.push({ organization: { _eq: selectedOrg.value } });
		}

		// Fetch invoices and expenses in parallel
		const [invoices, expenseRecords] = await Promise.all([
			invoiceItems.list({
				fields: ['id', 'status', 'invoice_date', 'due_date', 'total_amount'],
				filter: invoiceFilter,
				sort: ['invoice_date'],
				limit: 500,
			}),
			expenseItems.list({
				fields: ['id', 'amount', 'date', 'category'],
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
				label: labels[q]!,
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

		// Build monthly trend (income vs expenses)
		const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
		const incomeByMonth = new Map<number, number>();
		const expenseByMonth = new Map<number, number>();
		for (let m = 0; m < 12; m++) { incomeByMonth.set(m, 0); expenseByMonth.set(m, 0); }

		for (const inv of (invoices as any[])) {
			if (inv.status === 'paid' && inv.invoice_date) {
				const m = new Date(inv.invoice_date).getMonth();
				incomeByMonth.set(m, (incomeByMonth.get(m) || 0) + (Number(inv.total_amount) || 0));
			}
		}
		for (const exp of (expenseRecords as any[])) {
			if (exp.date) {
				const m = new Date(exp.date).getMonth();
				expenseByMonth.set(m, (expenseByMonth.get(m) || 0) + (Number(exp.amount) || 0));
			}
		}

		const now = new Date();
		const maxMonth = selectedYear.value === currentYear ? now.getMonth() : 11;
		monthlyData.value = Array.from({ length: maxMonth + 1 }, (_, m) => ({
			month: monthNames[m]!,
			income: incomeByMonth.get(m) || 0,
			expenses: expenseByMonth.get(m) || 0,
		}));

		// Build expense category breakdown
		const catMap = new Map<string, number>();
		for (const exp of (expenseRecords as any[])) {
			const cat = exp.category || 'other';
			catMap.set(cat, (catMap.get(cat) || 0) + (Number(exp.amount) || 0));
		}
		const catTotal = Array.from(catMap.values()).reduce((s, v) => s + v, 0);
		expenseCategories.value = Array.from(catMap.entries())
			.map(([cat, amount]) => ({
				category: cat,
				label: CATEGORY_LABELS[cat] || cat,
				amount,
				color: '',
				percent: catTotal > 0 ? (amount / catTotal) * 100 : 0,
			}))
			.sort((a, b) => b.amount - a.amount)
			.map((item, i) => ({ ...item, color: tagColor(i) }));
	} catch (e) {
		console.warn('[Financials] Could not load data:', e);
	} finally {
		isLoading.value = false;
	}
};

const maxMonthValue = computed(() => Math.max(...monthlyData.value.map(m => Math.max(m.income, m.expenses)), 1));
const maxCatAmount = computed(() => Math.max(...expenseCategories.value.map(c => c.amount), 1));
const maxQuarterActual = computed(() => Math.max(...quarters.value.map(q => q.actual), 1));

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
	if (pct >= 100) return 'bg-success';
	if (pct >= 75) return 'bg-info';
	if (pct >= 50) return 'bg-warning';
	return 'bg-destructive';
};

const saveGoals = async () => {
	const year = selectedYear.value;
	const existingByQuarter = new Map<number, Goal>();
	for (const g of yearQuarterGoals.value) {
		const q = quarterOf(g);
		if (q !== null) existingByQuarter.set(q, g);
	}

	for (let qIdx = 0; qIdx < 4; qIdx++) {
		const target = Number(goalInputs.value[qIdx]) || 0;
		const q = qIdx + 1;
		const { start, end } = getQuarterRange(qIdx, year);
		const existing = existingByQuarter.get(q);

		if (existing) {
			const currentTarget = Number(existing.target_value) || 0;
			if (currentTarget !== target) {
				await updateGoal(existing.id, { target_value: target });
			}
		} else if (target > 0) {
			await createGoal({
				title: `Q${q} ${year} Revenue`,
				scope: 'organization',
				category: 'revenue',
				timeframe: 'quarterly',
				start_date: start,
				end_date: end,
				target_value: target,
				target_unit: 'USD',
				current_value: 0,
				status: 'active',
				metadata: { year, quarter: q },
			});
		}
	}

	editingGoals.value = false;
	await refreshGoals();
	loadFinancials();
};

// Sync goalInputs from yearQuarterGoals whenever the goals list resolves
// or the year changes. Skipped while the user is mid-edit so server-side
// data doesn't clobber unsaved input.
const loadSavedGoals = () => {
	if (editingGoals.value) return;
	const next: number[] = [0, 0, 0, 0];
	for (const g of yearQuarterGoals.value) {
		const q = quarterOf(g);
		if (q !== null && q >= 1 && q <= 4) {
			next[q - 1] = Number(g.target_value) || 0;
		}
	}
	goalInputs.value = next;
};

watch(yearQuarterGoals, () => {
	loadSavedGoals();
	// Re-derive the quarter cards once goals resolve so the "Goal:" label
	// shows the real targets rather than the initial $0 placeholder.
	if (!isLoading.value) loadFinancials();
}, { deep: true });

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
	<div class="ios-card overflow-hidden">
		<!-- Header -->
		<div class="flex items-center justify-between p-4 border-b border-border/30">
			<div class="flex items-center gap-2">
				<EIcon name="i-heroicons-chart-bar" class="w-5 h-5 text-success" />
				<h3 class="text-sm font-semibold uppercase tracking-wide">Financial Analysis</h3>
			</div>
			<div class="flex items-center gap-2">
				<UiViewLink to="/apps/money" size="sm">View money</UiViewLink>
				<button
					@click="showHelp = !showHelp"
					class="text-xs text-muted-foreground hover:text-foreground transition-colors"
					title="How are financials calculated?"
				>
					<EIcon name="i-heroicons-question-mark-circle" class="w-4 h-4" />
				</button>
				<button
					@click="editingGoals = !editingGoals"
					class="text-xs text-primary hover:underline"
				>
					{{ editingGoals ? 'Cancel' : 'Set Goals' }}
				</button>
				<select
					v-model="selectedYear"
					class="text-xs rounded-full glass-field px-3 py-1 focus:outline-none"
				>
					<option :value="currentYear - 1">{{ currentYear - 1 }}</option>
					<option :value="currentYear">{{ currentYear }}</option>
					<option :value="currentYear + 1">{{ currentYear + 1 }}</option>
				</select>
			</div>
		</div>

		<!-- Goal Editor -->
		<div v-if="editingGoals" class="p-4 bg-info/5 border-b border-border/30">
			<p class="text-xs text-muted-foreground mb-3">Set quarterly revenue goals:</p>
			<div class="grid grid-cols-4 gap-3">
				<div v-for="(_, idx) in goalInputs" :key="idx">
					<label class="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">Q{{ idx + 1 }}</label>
					<input
						v-model.number="goalInputs[idx]"
						type="number"
						min="0"
						step="1000"
						class="w-full text-sm glass-field rounded-md px-2 py-1 text-foreground focus:outline-none"
						placeholder="0"
					/>
				</div>
			</div>
			<button
				@click="saveGoals"
				class="mt-3 text-xs bg-primary text-primary-foreground px-4 py-1.5 rounded-md hover:bg-primary/90 transition-colors"
			>
				Save Goals
			</button>
		</div>

		<!-- How It Works -->
		<div v-if="showHelp" class="p-4 bg-muted/50 border-b border-border/30 text-xs text-muted-foreground space-y-2">
			<p class="font-semibold text-foreground uppercase tracking-wide text-[10px] mb-2">How financials are calculated</p>
			<ul class="space-y-1.5 list-none">
				<li><span class="font-medium text-foreground">Total Billed</span> &mdash; The sum of all invoice amounts for the selected year.</li>
				<li><span class="font-medium text-success">Collected</span> &mdash; Invoices with status "paid." This is actual revenue received.</li>
				<li><span class="font-medium text-warning">Outstanding</span> &mdash; Total Billed minus Collected.</li>
				<li><span class="font-medium text-destructive">Expenses</span> &mdash; Total expenses recorded for the period.</li>
				<li><span class="font-medium text-success">Net Income</span> &mdash; Collected minus Expenses.</li>
			</ul>
		</div>

		<div v-if="isLoading" class="p-8 flex items-center justify-center">
			<EIcon name="i-heroicons-arrow-path" class="w-5 h-5 animate-spin text-muted-foreground" />
		</div>

		<div v-else-if="yearlyActual === 0 && yearlyExpenses === 0" class="p-8 text-center">
			<EIcon name="i-heroicons-banknotes" class="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
			<p class="text-sm font-medium text-foreground">No financial activity yet</p>
			<p class="text-xs text-muted-foreground mt-1">Create your first invoice to start tracking revenue and expenses.</p>
			<NuxtLink
				to="/invoices?new=1"
				class="inline-flex items-center gap-1.5 mt-4 px-4 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
			>
				<EIcon name="i-heroicons-plus" class="w-3.5 h-3.5" />
				Create your first invoice
			</NuxtLink>
		</div>

		<div v-else class="p-4">
			<!-- Two-column layout: Chart+Projection | Quarters+Expenses -->
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
			<div>
			<!-- Monthly Income vs Expenses Chart -->
			<div v-if="monthlyData.length > 0" class="mb-6">
				<p class="text-[10px] text-muted-foreground uppercase tracking-wider mb-3 font-semibold">Monthly Income vs Expenses</p>
				<div class="flex items-end gap-1" style="height: 80px">
					<div
						v-for="m in monthlyData"
						:key="m.month"
						class="flex-1 flex flex-col items-center justify-end gap-0.5"
					>
						<div class="w-full flex gap-px justify-center" :style="{ height: '64px' }" style="align-items: flex-end">
							<div
								class="flex-1 rounded-t-[2px] bg-success/60"
								:style="{ height: `${Math.max((m.income / maxMonthValue) * 60, 1)}px` }"
								:title="`Income: ${formatCurrency(m.income)}`"
							/>
							<div
								class="flex-1 rounded-t-[2px] bg-destructive/50"
								:style="{ height: `${Math.max((m.expenses / maxMonthValue) * 60, 1)}px` }"
								:title="`Expenses: ${formatCurrency(m.expenses)}`"
							/>
						</div>
						<span class="text-[8px] text-muted-foreground">{{ m.month }}</span>
					</div>
				</div>
				<div class="flex items-center gap-4 mt-2 justify-end">
					<div class="flex items-center gap-1"><span class="w-2 h-2 rounded-sm bg-success/60"></span><span class="text-[9px] text-muted-foreground">Income</span></div>
					<div class="flex items-center gap-1"><span class="w-2 h-2 rounded-sm bg-destructive/50"></span><span class="text-[9px] text-muted-foreground">Expenses</span></div>
				</div>
			</div>

			<!-- Expenses by Category — a horizontal breakdown that fills out the
			     left column beneath the monthly chart so it balances the stack of
			     quarter cards on the right at lg. Reuses the already-computed
			     expenseCategories/maxCatAmount (previously unrendered). -->
			<div v-if="expenseCategories.length > 0">
				<p class="text-[10px] text-muted-foreground uppercase tracking-wider mb-3 font-semibold">Expenses by Category</p>
				<div class="space-y-2">
					<div v-for="c in expenseCategories.slice(0, 6)" :key="c.category" class="flex items-center gap-2">
						<span class="w-20 shrink-0 text-[10px] text-muted-foreground truncate" :title="c.label">{{ c.label }}</span>
						<div class="flex-1 h-2.5 bg-muted/40 rounded-full overflow-hidden">
							<div
								class="h-full rounded-full transition-all duration-500"
								:style="{ width: `${Math.max((c.amount / maxCatAmount) * 100, 2)}%`, backgroundColor: c.color }"
							/>
						</div>
						<span class="w-16 shrink-0 text-right text-[10px] font-medium text-foreground tabular-nums">{{ formatCurrency(c.amount) }}</span>
					</div>
				</div>
			</div>

			</div><!-- /left column -->
			<div>
			<!-- Quarter Breakdown -->
			<div class="space-y-4">
				<div
					v-for="q in quarters"
					:key="q.label"
					class="bg-muted/50 rounded-lg p-3"
				>
					<div class="flex items-center justify-between mb-2">
						<div class="flex items-center gap-2">
							<span class="text-sm font-bold text-foreground">{{ q.label }}</span>
							<span class="text-[10px] text-muted-foreground">{{ q.invoiceCount }} invoices</span>
						</div>
						<div class="text-right">
							<p class="text-sm font-bold text-foreground">{{ formatCurrency(q.actual) }}</p>
							<p v-if="q.goal" class="text-[10px] text-muted-foreground">
								Goal: {{ formatCurrency(q.goal) }}
							</p>
						</div>
					</div>

					<!-- Progress bar -->
					<div v-if="q.goal" class="w-full bg-muted rounded-full h-2 mb-2">
						<div
							:class="getProgressColor(q.paid, q.goal)"
							class="h-2 rounded-full transition-all duration-500"
							:style="{ width: getProgressPercent(q.paid, q.goal) + '%' }"
						/>
					</div>

					<!-- Visual stacked bar: paid | pending | expenses -->
					<div class="flex h-2 rounded-full overflow-hidden mb-2" v-if="q.actual > 0 || q.expenses > 0">
						<div class="bg-success/70 transition-all" :style="{ width: `${(q.paid / (q.actual + q.expenses || 1)) * 100}%` }" />
						<div class="bg-warning/70 transition-all" :style="{ width: `${(q.pending / (q.actual + q.expenses || 1)) * 100}%` }" />
						<div class="bg-destructive/60 transition-all" :style="{ width: `${(q.expenses / (q.actual + q.expenses || 1)) * 100}%` }" />
					</div>

					<!-- Paid vs Pending vs Expenses breakdown -->
					<div class="flex items-center gap-4 text-[10px] flex-wrap">
						<div class="flex items-center gap-1">
							<span class="w-2 h-2 rounded-full bg-success"></span>
							<span class="text-muted-foreground">Paid: {{ formatCurrency(q.paid) }} ({{ q.paidCount }})</span>
						</div>
						<div class="flex items-center gap-1">
							<span class="w-2 h-2 rounded-full bg-warning"></span>
							<span class="text-muted-foreground">Pending: {{ formatCurrency(q.pending) }}</span>
						</div>
						<div class="flex items-center gap-1">
							<span class="w-2 h-2 rounded-full bg-destructive"></span>
							<span class="text-muted-foreground">Expenses: {{ formatCurrency(q.expenses) }}</span>
						</div>
						<div class="flex items-center gap-1 ml-auto">
							<span class="font-bold" :class="q.net >= 0 ? 'text-success' : 'text-destructive'">
								Net: {{ formatCurrency(q.net) }}
							</span>
						</div>
						<div v-if="q.goal" class="ml-auto">
							<span
								:class="q.paid >= q.goal ? 'text-success' : 'text-muted-foreground'"
								class="font-bold"
							>
								{{ getProgressPercent(q.paid, q.goal) }}%
							</span>
						</div>
					</div>
				</div>
			</div>

			</div><!-- /right column -->
			</div><!-- /two-column grid -->
		</div>
	</div>
</template>
