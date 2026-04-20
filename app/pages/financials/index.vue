<script setup lang="ts">
import type { ChartConfig } from '~/components/ui/chart';
import { ChartContainer, ChartCrosshair } from '~/components/ui/chart';
import { VisXYContainer, VisLine, VisAxis, VisStackedBar } from '@unovis/vue';
import { CurveType } from '@unovis/ts';

definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Financials | Earnest' });

const router = useRouter();

// ── Fetch monthly data for charts ──
const invoiceItems = useDirectusItems('invoices');
const expenseItems = useDirectusItems('expenses');
const { selectedOrg } = useOrganization();
const { setEntity, clearEntity, sidebarOpen, closeSidebar } = useEntityPageContext();

const currentYear = new Date().getFullYear();
const monthlyData = ref<{ month: number; label: string; revenue: number; expenses: number; net: number }[]>([]);
const isLoadingCharts = ref(true);
const unpaidInvoices = ref<any[]>([]);
const recentExpenses = ref<any[]>([]);

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Previous month comparison
const currentMonth = new Date().getMonth();
const thisMonthRevenue = computed(() => monthlyData.value[currentMonth]?.revenue ?? 0);
const lastMonthRevenue = computed(() => currentMonth > 0 ? (monthlyData.value[currentMonth - 1]?.revenue ?? 0) : 0);
const revenueChange = computed(() => lastMonthRevenue.value > 0 ? Math.round(((thisMonthRevenue.value - lastMonthRevenue.value) / lastMonthRevenue.value) * 100) : 0);
const thisMonthExpenses = computed(() => monthlyData.value[currentMonth]?.expenses ?? 0);
const lastMonthExpenses = computed(() => currentMonth > 0 ? (monthlyData.value[currentMonth - 1]?.expenses ?? 0) : 0);
const expenseChange = computed(() => lastMonthExpenses.value > 0 ? Math.round(((thisMonthExpenses.value - lastMonthExpenses.value) / lastMonthExpenses.value) * 100) : 0);
const thisMonthNet = computed(() => thisMonthRevenue.value - thisMonthExpenses.value);
const lastMonthNet = computed(() => lastMonthRevenue.value - lastMonthExpenses.value);
const netChange = computed(() => lastMonthNet.value !== 0 ? Math.round(((thisMonthNet.value - lastMonthNet.value) / Math.abs(lastMonthNet.value)) * 100) : 0);

const totalUnpaid = computed(() => unpaidInvoices.value.reduce((s, inv) => s + (Number(inv.total_amount) || 0), 0));

// getDaysUntilDue is auto-imported from utils/dates.ts

async function loadDashboard() {
  isLoadingCharts.value = true;
  try {
    const invoiceFilter: any = {
      _and: [
        { invoice_date: { _gte: `${currentYear}-01-01` } },
        { invoice_date: { _lte: `${currentYear}-12-31` } },
      ],
    };
    const expenseFilter: any = {
      _and: [
        { date: { _gte: `${currentYear}-01-01` } },
        { date: { _lte: `${currentYear}-12-31` } },
      ],
    };
    const unpaidFilter: any = {
      _and: [
        { status: { _in: ['pending', 'processing'] } },
      ],
    };

    if (selectedOrg.value) {
      invoiceFilter._and.push({ bill_to: { _eq: selectedOrg.value } });
      expenseFilter._and.push({ organization: { _eq: selectedOrg.value } });
      unpaidFilter._and.push({ bill_to: { _eq: selectedOrg.value } });
    }

    const [invoices, expenses, unpaid, recentExp] = await Promise.all([
      invoiceItems.list({ filter: invoiceFilter, fields: ['total_amount', 'invoice_date', 'status'], limit: 1000 }),
      expenseItems.list({ filter: expenseFilter, fields: ['amount', 'date'], limit: 1000 }),
      invoiceItems.list({ filter: unpaidFilter, fields: ['id', 'invoice_code', 'total_amount', 'due_date', 'status', 'client.name'], sort: ['due_date'], limit: 10 }),
      expenseItems.list({ fields: ['name', 'amount', 'category', 'date'], sort: ['-date'], limit: 5 }),
    ]);

    unpaidInvoices.value = unpaid;
    recentExpenses.value = recentExp;

    // Bucket by month
    const data = months.map((label, i) => ({
      month: i,
      label,
      revenue: 0,
      expenses: 0,
      net: 0,
    }));

    for (const inv of invoices) {
      if (!inv.invoice_date) continue;
      const m = new Date(inv.invoice_date).getMonth();
      if (data[m]) data[m].revenue += Number(inv.total_amount) || 0;
    }

    for (const exp of expenses) {
      if (!exp.date) continue;
      const m = new Date(exp.date + 'T00:00:00').getMonth();
      if (data[m]) data[m].expenses += Number(exp.amount) || 0;
    }

    data.forEach(d => { d.net = d.revenue - d.expenses; });
    monthlyData.value = data;
  } catch (err) {
    console.error('Failed to load financial data:', err);
  } finally {
    isLoadingCharts.value = false;
  }
}

onMounted(() => {
  loadDashboard();
  setEntity('financials', 'dashboard', 'Financials');
});

onUnmounted(() => clearEntity());

// ── Chart config ──
const revenueChartConfig: ChartConfig = {
  revenue: { label: 'Revenue', color: 'hsl(142, 71%, 45%)' },
  expenses: { label: 'Expenses', color: 'hsl(0, 72%, 51%)' },
};
const netChartConfig: ChartConfig = {
  net: { label: 'Net', color: 'hsl(217, 91%, 60%)' },
};

// ── Summary stats ──
const totalRevenue = computed(() => monthlyData.value.reduce((s, d) => s + d.revenue, 0));
const totalExpenses = computed(() => monthlyData.value.reduce((s, d) => s + d.expenses, 0));
const totalNet = computed(() => totalRevenue.value - totalExpenses.value);

function formatCurrency(v: number): string {
  if (v >= 1000) return '$' + (v / 1000).toFixed(1) + 'K';
  return '$' + v.toFixed(0);
}

const sections = [
  {
    name: 'Quarterly Analysis',
    description: 'Revenue, expenses, and financial overview',
    icon: 'lucide:bar-chart-3',
    route: '/command-center/financials',
    color: 'text-emerald-400',
  },
  {
    name: 'Products & Services',
    description: 'Manage products and services for invoicing',
    icon: 'lucide:package',
    route: '/financials/products',
    color: 'text-blue-400',
  },
  {
    name: 'Invoices',
    description: 'Create, manage, and track invoices',
    icon: 'lucide:file-text',
    route: '/invoices',
    color: 'text-amber-400',
  },
  {
    name: 'Payments',
    description: 'View payment history and status',
    icon: 'lucide:credit-card',
    route: '/invoices/payments',
    color: 'text-purple-400',
  },
  {
    name: 'Expenses',
    description: 'Track and manage business expenses',
    icon: 'lucide:receipt',
    route: '/expenses',
    color: 'text-red-400',
  },
];
</script>

<template>
  <div class="p-4 md:p-6 max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-xl font-semibold">Financials</h1>
        <p class="text-sm text-muted-foreground">{{ currentYear }} financial overview</p>
      </div>
      <button
        class="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-border text-xs font-medium text-primary hover:bg-primary/10 hover:border-primary/30 transition-colors"
        @click="sidebarOpen = true"
      >
        <UIcon name="lucide:sparkles" class="w-3.5 h-3.5" />
        <span class="hidden sm:inline">Ask Earnest</span>
      </button>
    </div>

    <!-- Summary Stats with month-over-month arrows -->
    <div class="grid grid-cols-3 gap-3 mb-6">
      <div class="ios-card p-4">
        <p class="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">This Month Revenue</p>
        <p class="text-2xl font-bold text-emerald-400">{{ formatCurrency(thisMonthRevenue) }}</p>
        <p v-if="revenueChange !== 0" class="text-xs mt-1" :class="revenueChange > 0 ? 'text-emerald-400' : 'text-red-400'">
          {{ revenueChange > 0 ? '↑' : '↓' }} {{ Math.abs(revenueChange) }}% vs last month
        </p>
      </div>
      <div class="ios-card p-4">
        <p class="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">This Month Expenses</p>
        <p class="text-2xl font-bold text-red-400">{{ formatCurrency(thisMonthExpenses) }}</p>
        <p v-if="expenseChange !== 0" class="text-xs mt-1" :class="expenseChange < 0 ? 'text-emerald-400' : 'text-red-400'">
          {{ expenseChange > 0 ? '↑' : '↓' }} {{ Math.abs(expenseChange) }}%
        </p>
      </div>
      <div class="ios-card p-4">
        <p class="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Net</p>
        <p class="text-2xl font-bold" :class="thisMonthNet >= 0 ? 'text-blue-400' : 'text-red-400'">{{ formatCurrency(thisMonthNet) }}</p>
        <p v-if="netChange !== 0" class="text-xs mt-1" :class="netChange > 0 ? 'text-emerald-400' : 'text-red-400'">
          {{ netChange > 0 ? '↑' : '↓' }} {{ Math.abs(netChange) }}%
        </p>
      </div>
    </div>

    <!-- Charts Row -->
    <div v-if="!isLoadingCharts && monthlyData.length" class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
      <!-- Revenue vs Expenses Chart -->
      <div class="ios-card p-5">
        <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">Revenue vs Expenses</h3>
        <div class="h-[240px]">
          <ClientOnly>
            <ChartContainer :config="revenueChartConfig" class="h-full w-full">
              <VisXYContainer
                :data="monthlyData"
                :margin="{ left: 10, right: 10, top: 10, bottom: 5 }"
                :y-domain="[0, undefined]"
              >
                <VisStackedBar
                  :x="(d: any) => d.month"
                  :y="[(d: any) => d.revenue, (d: any) => d.expenses]"
                  :color="[revenueChartConfig.revenue?.color ?? '', revenueChartConfig.expenses?.color ?? '']"
                  :bar-padding="0.3"
                  :rounded-corners="4"
                />
                <VisAxis
                  type="x"
                  :x="(d: any) => d.month"
                  :tick-line="false"
                  :domain-line="false"
                  :grid-line="false"
                  :tick-format="(v: number) => months[v] ?? ''"
                  :num-ticks="12"
                />
                <VisAxis
                  type="y"
                  :tick-format="(v: number) => formatCurrency(v)"
                  :grid-line="true"
                  :tick-line="false"
                  :domain-line="false"
                  :num-ticks="5"
                />
              </VisXYContainer>
            </ChartContainer>
          </ClientOnly>
        </div>
        <div class="flex gap-4 mt-3 text-xs text-muted-foreground">
          <span class="flex items-center gap-1.5">
            <span class="w-2.5 h-2.5 rounded-sm" style="background: hsl(142, 71%, 45%)"></span>
            Revenue
          </span>
          <span class="flex items-center gap-1.5">
            <span class="w-2.5 h-2.5 rounded-sm" style="background: hsl(0, 72%, 51%)"></span>
            Expenses
          </span>
        </div>
      </div>

      <!-- Net Income Trend -->
      <div class="ios-card p-5">
        <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">Net Income Trend</h3>
        <div class="h-[240px]">
          <ClientOnly>
            <ChartContainer :config="netChartConfig" class="h-full w-full">
              <VisXYContainer
                :data="monthlyData"
                :margin="{ left: 10, right: 10, top: 10, bottom: 5 }"
              >
                <VisLine
                  :x="(d: any) => d.month"
                  :y="[(d: any) => d.net]"
                  :color="[netChartConfig.net?.color ?? '']"
                  :curve-type="CurveType.MonotoneX"
                />
                <VisAxis
                  type="x"
                  :x="(d: any) => d.month"
                  :tick-line="false"
                  :domain-line="false"
                  :grid-line="false"
                  :tick-format="(v: number) => months[v] ?? ''"
                  :num-ticks="12"
                />
                <VisAxis
                  type="y"
                  :tick-format="(v: number) => formatCurrency(v)"
                  :grid-line="true"
                  :tick-line="false"
                  :domain-line="false"
                  :num-ticks="5"
                />
              </VisXYContainer>
            </ChartContainer>
          </ClientOnly>
        </div>
        <div class="flex gap-4 mt-3 text-xs text-muted-foreground">
          <span class="flex items-center gap-1.5">
            <span class="w-2.5 h-2.5 rounded-sm" style="background: hsl(217, 91%, 60%)"></span>
            Net Income
          </span>
        </div>
      </div>
    </div>

    <!-- Loading state for charts -->
    <div v-else-if="isLoadingCharts" class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
      <div class="ios-card p-5 h-[320px] flex items-center justify-center">
        <Icon name="lucide:loader-2" class="w-6 h-6 text-muted-foreground animate-spin" />
      </div>
      <div class="ios-card p-5 h-[320px] flex items-center justify-center">
        <Icon name="lucide:loader-2" class="w-6 h-6 text-muted-foreground animate-spin" />
      </div>
    </div>

    <!-- Unpaid Invoices + Recent Expenses side by side -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
      <!-- Unpaid Invoices -->
      <div class="ios-card p-5">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Unpaid Invoices
            <span v-if="unpaidInvoices.length" class="text-amber-400 ml-1">({{ unpaidInvoices.length }})</span>
          </h3>
          <span v-if="totalUnpaid > 0" class="text-sm font-bold text-amber-400">{{ formatCurrency(totalUnpaid) }}</span>
        </div>
        <div v-if="unpaidInvoices.length === 0" class="text-sm text-muted-foreground/60 py-4 text-center">
          All caught up — no unpaid invoices.
        </div>
        <div v-else class="space-y-0.5">
          <div
            v-for="inv in unpaidInvoices"
            :key="inv.id"
            class="flex items-center justify-between py-2.5 px-2 -mx-2 rounded-md hover:bg-muted/30 cursor-pointer transition-colors"
            @click="router.push(`/invoices/detail/${inv.id}`)"
          >
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium">{{ inv.invoice_code || 'Draft' }}</span>
                <span class="text-xs text-muted-foreground truncate">{{ typeof inv.client === 'object' ? inv.client?.name : '' }}</span>
              </div>
              <div class="text-[11px] mt-0.5" :class="inv.due_date && getDaysUntilDue(inv.due_date) < 0 ? 'text-red-400' : inv.due_date && getDaysUntilDue(inv.due_date) <= 7 ? 'text-amber-400' : 'text-muted-foreground'">
                <template v-if="inv.due_date">
                  <template v-if="getDaysUntilDue(inv.due_date) < 0">{{ Math.abs(getDaysUntilDue(inv.due_date)) }}d overdue</template>
                  <template v-else-if="getDaysUntilDue(inv.due_date) === 0">Due today</template>
                  <template v-else>Due in {{ getDaysUntilDue(inv.due_date) }}d</template>
                </template>
                <template v-else>No due date</template>
              </div>
            </div>
            <span class="text-sm font-bold tabular-nums shrink-0 ml-3">{{ formatCurrency(Number(inv.total_amount) || 0) }}</span>
          </div>
        </div>
        <NuxtLink v-if="unpaidInvoices.length > 0" to="/invoices" class="block text-center text-xs text-primary hover:underline mt-3 pt-3 border-t border-border/30">
          View all invoices →
        </NuxtLink>
      </div>

      <!-- Recent Expenses -->
      <div class="ios-card p-5">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent Expenses</h3>
          <NuxtLink to="/expenses" class="text-xs text-primary hover:underline">View all</NuxtLink>
        </div>
        <div v-if="recentExpenses.length === 0" class="text-sm text-muted-foreground/60 py-4 text-center">
          No expenses recorded yet.
        </div>
        <div v-else class="space-y-0.5">
          <div
            v-for="exp in recentExpenses"
            :key="exp.id || exp.name"
            class="flex items-center justify-between py-2.5 px-2 -mx-2 rounded-md hover:bg-muted/30 cursor-pointer transition-colors"
            @click="router.push('/expenses')"
          >
            <div class="min-w-0 flex-1">
              <span class="text-sm font-medium">{{ exp.name }}</span>
              <div class="flex items-center gap-2 mt-0.5">
                <span class="text-[11px] text-muted-foreground capitalize">{{ (exp.category || 'other').replace(/_/g, ' ') }}</span>
                <span v-if="exp.date" class="text-[11px] text-muted-foreground/60">{{ new Date(exp.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }}</span>
              </div>
            </div>
            <span class="text-sm font-bold tabular-nums shrink-0 ml-3">{{ formatCurrency(Number(exp.amount) || 0) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Compact Quick Navigation -->
    <div class="flex gap-2 mb-6 overflow-x-auto pb-1">
      <NuxtLink
        v-for="section in sections"
        :key="section.route"
        :to="section.route"
        class="flex items-center gap-2 px-3 py-2 ios-card hover:ring-1 hover:ring-white/10 transition-all shrink-0"
      >
        <Icon :name="section.icon" :class="[section.color, 'w-4 h-4']" />
        <span class="text-xs font-medium">{{ section.name }}</span>
      </NuxtLink>
    </div>

    <!-- Quarterly Analysis -->
    <div>
      <h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">Quarterly Overview</h2>
      <CommandCenterFinancialQuarter />
    </div>

    <!-- Contextual AI Sidebar -->
    <ClientOnly>
      <AIContextualSidebar
        v-if="sidebarOpen"
        entity-type="financials"
        entity-id="dashboard"
        entity-label="Financials"
        @close="closeSidebar"
      />
      <Transition name="overlay">
        <div v-if="sidebarOpen" class="fixed inset-0 bg-black/20 z-40" @click="closeSidebar" />
      </Transition>
    </ClientOnly>
  </div>
</template>
