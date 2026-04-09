<script setup lang="ts">
const expenseItems = useDirectusItems('expenses');
const { selectedOrg } = useOrganization();

const isLoading = ref(true);

interface CategoryData {
  category: string;
  label: string;
  amount: number;
  color: string;
  percent: number;
}

interface MonthData {
  month: string;
  amount: number;
}

const categories = ref<CategoryData[]>([]);
const monthlyTrend = ref<MonthData[]>([]);
const totalExpenses = ref(0);

const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  software: { label: 'Software', color: '#6366f1' },
  hardware: { label: 'Hardware', color: '#8b5cf6' },
  travel: { label: 'Travel', color: '#f59e0b' },
  marketing: { label: 'Marketing', color: '#3b82f6' },
  office: { label: 'Office', color: '#64748b' },
  contractor: { label: 'Contractors', color: '#ef4444' },
  hosting: { label: 'Hosting', color: '#06b6d4' },
  insurance: { label: 'Insurance', color: '#10b981' },
  legal: { label: 'Legal', color: '#f97316' },
  other: { label: 'Other', color: '#9ca3af' },
};

const currentYear = new Date().getFullYear();

async function loadExpenses() {
  isLoading.value = true;
  try {
    const filter: any = {
      _and: [
        { date: { _gte: `${currentYear}-01-01` } },
        { date: { _lte: `${currentYear}-12-31` } },
      ],
    };

    if (selectedOrg.value) {
      filter._and.push({ organization: { _eq: selectedOrg.value } });
    }

    const records = await expenseItems.list({
      fields: ['id', 'amount', 'date', 'category', 'name'],
      filter,
      sort: ['date'],
      limit: 1000,
    }) as any[];

    // Category breakdown
    const catMap = new Map<string, number>();
    for (const exp of records) {
      const cat = exp.category || 'other';
      catMap.set(cat, (catMap.get(cat) || 0) + (Number(exp.amount) || 0));
    }

    const total = Array.from(catMap.values()).reduce((s, v) => s + v, 0);
    totalExpenses.value = total;

    categories.value = Array.from(catMap.entries())
      .map(([cat, amount]) => ({
        category: cat,
        label: CATEGORY_CONFIG[cat]?.label || cat,
        amount,
        color: CATEGORY_CONFIG[cat]?.color || '#9ca3af',
        percent: total > 0 ? (amount / total) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    // Monthly trend
    const monthMap = new Map<number, number>();
    for (let m = 0; m < 12; m++) monthMap.set(m, 0);
    for (const exp of records) {
      const d = new Date(exp.date);
      const m = d.getMonth();
      monthMap.set(m, (monthMap.get(m) || 0) + (Number(exp.amount) || 0));
    }

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const now = new Date();
    monthlyTrend.value = Array.from(monthMap.entries())
      .filter(([m]) => m <= now.getMonth())
      .map(([m, amount]) => ({
        month: monthNames[m]!,
        amount,
      }));
  } catch (e) {
    console.warn('[ExpenseBreakdown] Error:', e);
  } finally {
    isLoading.value = false;
  }
}

const maxMonthAmount = computed(() => Math.max(...monthlyTrend.value.map(m => m.amount), 1));
const maxCatAmount = computed(() => Math.max(...categories.value.map(c => c.amount), 1));

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(val);

watch(selectedOrg, () => loadExpenses());
onMounted(() => loadExpenses());
</script>

<template>
  <div class="ios-card p-5">
    <div class="flex items-center justify-between mb-5">
      <div class="flex items-center gap-2">
        <Icon name="lucide:receipt" class="w-4 h-4 text-red-400" />
        <h3 class="text-sm font-semibold uppercase tracking-wide">Expense Breakdown</h3>
      </div>
      <span class="text-[10px] text-muted-foreground uppercase">{{ currentYear }}</span>
    </div>

    <div v-if="isLoading" class="flex items-center justify-center py-8">
      <Icon name="lucide:loader-2" class="w-5 h-5 animate-spin text-muted-foreground" />
    </div>

    <div v-else-if="categories.length === 0" class="text-center py-8">
      <Icon name="lucide:receipt" class="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
      <p class="text-xs text-muted-foreground">No expenses recorded yet</p>
    </div>

    <div v-else>
      <!-- Monthly trend bars -->
      <div class="mb-6">
        <p class="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">Monthly Spending</p>
        <div class="flex items-end gap-1.5" style="height: 72px">
          <div
            v-for="m in monthlyTrend"
            :key="m.month"
            class="flex-1 flex flex-col items-center justify-end gap-1"
          >
            <div
              class="w-full rounded-t-[2px] transition-all duration-500"
              :class="m.amount > 0 ? 'bg-slate-700/60' : 'bg-muted/30'"
              :style="{ height: `${Math.max((m.amount / maxMonthAmount) * 56, 2)}px` }"
              :title="formatCurrency(m.amount)"
            />
            <span class="text-[8px] text-muted-foreground/70">{{ m.month }}</span>
          </div>
        </div>
      </div>

      <!-- Category breakdown -->
      <div>
        <div class="flex items-center justify-between mb-3">
          <p class="text-[10px] text-muted-foreground uppercase tracking-wider">By Category</p>
          <p class="text-xs font-semibold text-foreground">{{ formatCurrency(totalExpenses) }}</p>
        </div>

        <!-- Stacked bar -->
        <div class="flex h-2.5 rounded-full overflow-hidden mb-4">
          <div
            v-for="cat in categories"
            :key="cat.category"
            class="transition-all duration-500"
            :style="{ width: `${cat.percent}%`, backgroundColor: cat.color }"
            :title="`${cat.label}: ${formatCurrency(cat.amount)}`"
          />
        </div>

        <!-- Category list -->
        <div class="space-y-2.5">
          <div
            v-for="cat in categories"
            :key="cat.category"
            class="flex items-center gap-3"
          >
            <span
              class="w-2 h-2 rounded-full shrink-0"
              :style="{ backgroundColor: cat.color }"
            />
            <span class="text-xs text-foreground/80 flex-1">{{ cat.label }}</span>
            <div class="w-24 h-1.5 rounded-full bg-muted/30 overflow-hidden">
              <div
                class="h-full rounded-full transition-all duration-500"
                :style="{ width: `${(cat.amount / maxCatAmount) * 100}%`, backgroundColor: cat.color }"
              />
            </div>
            <span class="text-xs font-medium text-foreground tabular-nums w-16 text-right">{{ formatCurrency(cat.amount) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
