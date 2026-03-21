<script setup lang="ts">
const { expenses, totalExpenses, expensesByCategory, isLoading } = useExpenses();
const { EXPENSE_CATEGORIES } = await import('~/composables/useExpenses');
const router = useRouter();

const recentExpenses = computed(() => {
	return [...expenses.value]
		.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
		.slice(0, 5);
});

// Monthly comparison
const thisMonth = computed(() => {
	const now = new Date();
	const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
	return expenses.value
		.filter(e => e.date >= monthStart)
		.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
});

const lastMonth = computed(() => {
	const now = new Date();
	const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
	const start = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-01`;
	const end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
	return expenses.value
		.filter(e => e.date >= start && e.date < end)
		.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
});

const monthChange = computed(() => {
	if (!lastMonth.value) return null;
	return Math.round(((thisMonth.value - lastMonth.value) / lastMonth.value) * 100);
});

const formatCurrency = (val: number) =>
	new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(val);

const getCategoryConfig = (cat: string) =>
	EXPENSE_CATEGORIES.find(c => c.value === cat) || EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1];

// Top categories by spend
const topCategories = computed(() => {
	const cats = expensesByCategory.value;
	return Object.entries(cats)
		.sort(([, a], [, b]) => b.total - a.total)
		.slice(0, 4)
		.map(([key, data]) => ({ key, ...data, config: getCategoryConfig(key) }));
});
</script>

<template>
	<div class="ios-card p-5">
		<div class="flex items-center justify-between mb-4">
			<div class="flex items-center gap-2">
				<UIcon name="i-heroicons-receipt-percent" class="w-5 h-5 text-red-400" />
				<h3 class="text-sm font-semibold uppercase tracking-wide text-foreground/70">Expenses</h3>
			</div>
			<button
				@click="router.push('/expenses')"
				class="text-xs text-primary hover:underline"
			>
				View All
			</button>
		</div>

		<!-- Loading -->
		<div v-if="isLoading && !expenses.length" class="space-y-3">
			<div v-for="i in 3" :key="i" class="h-10 bg-muted/30 rounded-lg animate-pulse" />
		</div>

		<!-- Empty -->
		<div v-else-if="!expenses.length" class="text-center py-6">
			<UIcon name="i-heroicons-receipt-percent" class="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
			<p class="text-xs text-muted-foreground">No expenses recorded</p>
			<button
				@click="router.push('/expenses')"
				class="mt-2 text-xs text-primary hover:underline"
			>
				Add an Expense
			</button>
		</div>

		<!-- Content -->
		<div v-else class="space-y-3">
			<!-- Monthly total -->
			<div class="flex items-center justify-between text-xs mb-1">
				<span class="text-muted-foreground">This month</span>
				<div class="flex items-center gap-2">
					<span class="font-semibold text-foreground">{{ formatCurrency(thisMonth) }}</span>
					<span
						v-if="monthChange !== null"
						class="text-[10px] font-medium"
						:class="monthChange > 0 ? 'text-red-400' : 'text-emerald-400'"
					>
						{{ monthChange > 0 ? '+' : '' }}{{ monthChange }}%
					</span>
				</div>
			</div>

			<!-- Top categories -->
			<div v-if="topCategories.length" class="space-y-1.5">
				<div
					v-for="cat in topCategories"
					:key="cat.key"
					class="flex items-center gap-2.5"
				>
					<UIcon
						:name="cat.config.icon"
						class="w-3.5 h-3.5 flex-shrink-0"
						:class="cat.config.color"
					/>
					<span class="text-[11px] text-foreground/80 flex-1 truncate">{{ cat.config.label }}</span>
					<span class="text-[11px] font-medium text-foreground">{{ formatCurrency(cat.total) }}</span>
				</div>
			</div>

			<!-- Recent list -->
			<div class="border-t border-border/50 pt-2 mt-2">
				<p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Recent</p>
				<div
					v-for="expense in recentExpenses"
					:key="expense.id"
					class="flex items-center justify-between py-1 text-xs cursor-pointer hover:bg-muted/20 rounded px-1 -mx-1"
					@click="router.push('/expenses')"
				>
					<span class="text-foreground/80 truncate">{{ expense.name }}</span>
					<span class="text-foreground font-medium whitespace-nowrap ml-2">{{ formatCurrency(Number(expense.amount) || 0) }}</span>
				</div>
			</div>
		</div>
	</div>
</template>
