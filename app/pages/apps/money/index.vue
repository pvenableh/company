<script setup lang="ts">
/**
 * Money app — Apps Layout Phase 4.
 *
 * Single landing page with a pill-segmented floor strip:
 *   Cash flow (default) | Invoices | Payments | Expenses | Time
 *
 * Same shape as /apps/work: floor switching is in-place via `?floor=` query
 * param so the shell never remounts. Drill-downs from any floor still push
 * to the canonical classic detail routes (`/invoices/detail/[id]`,
 * `/invoices/[id]`, etc.). The classic list pages
 * (`/invoices`, `/invoices/payments`, `/expenses`, `/time-tracker`) stay
 * intact alongside this app — classic-mode users navigate to those
 * pages directly. The Time floor below is the apps-mode home for
 * time tracking; classic users keep `/time-tracker`. Shared modal +
 * floating dock branch on `useAppsMode().isAppsMode` so the "View all
 * entries" link routes to whichever home matches the user's mode.
 *
 * Decisions documented for Phase 4:
 *   - "Invoice payments" stays inside the invoice detail page (per-invoice
 *     payment management already shipped post invoicing-overhaul). The
 *     Payments floor here is a portfolio-wide receipt log, not an editor.
 *   - Stripe Connect health chip + Plaid bank-sync CTA are deferred —
 *     KYC isn't verified yet and Plaid is pre-GA. Surface in Phase 5+ if
 *     useful.
 *   - Detail pages are not rebuilt. Drilling reaches existing routes.
 */
import type { Invoice, TimeEntry } from '~~/shared/directus';
import { useDebounceFn } from '@vueuse/core';
import { Button } from '~/components/ui/button';
import { openTimerDockPanel } from '~/composables/useTimeTrackerModal';
import { format, startOfWeek, endOfWeek, parseISO, isToday as dateFnsIsToday } from 'date-fns';

definePageMeta({ layout: 'apps', middleware: ['auth'] });
useHead({ title: 'Money | Earnest' });

const router = useRouter();
const route = useRoute();

// ── Floor strip ─────────────────────────────────────────────────────────────
type FloorKey = 'cashflow' | 'invoices' | 'payments' | 'expenses' | 'time' | 'insights';
const FLOOR_KEYS: FloorKey[] = ['cashflow', 'invoices', 'payments', 'expenses', 'time', 'insights'];

const initialFloor: FloorKey = (() => {
  const v = route.query.floor;
  return typeof v === 'string' && FLOOR_KEYS.includes(v as FloorKey) ? (v as FloorKey) : 'cashflow';
})();
const floor = ref<FloorKey>(initialFloor);

watch(floor, (next) => {
  router.replace({ query: { ...route.query, floor: next === 'cashflow' ? undefined : next } });
});

const floors: Array<{ key: FloorKey; label: string; icon: string }> = [
  { key: 'cashflow', label: 'Cash flow', icon: 'lucide:trending-up' },
  { key: 'invoices', label: 'Invoices', icon: 'lucide:file-text' },
  { key: 'payments', label: 'Payments', icon: 'lucide:credit-card' },
  { key: 'expenses', label: 'Expenses', icon: 'lucide:receipt' },
  { key: 'time', label: 'Time', icon: 'lucide:clock' },
  { key: 'insights', label: 'Insights', icon: 'lucide:bar-chart-3' },
];

// ── Insights floor ──────────────────────────────────────────────────────────
const { snapshot: moneyInsightsSnapshot, snapshotLoading: moneyInsightsLoading, fetchSnapshot: fetchMoneyInsights } = useCRMIntelligence();
let moneyInsightsLoaded = false;
watch(floor, (next) => {
  if (next === 'insights' && !moneyInsightsLoaded) {
    moneyInsightsLoaded = true;
    if (!moneyInsightsSnapshot.value) fetchMoneyInsights();
  }
}, { immediate: true });

// ── Common deps ─────────────────────────────────────────────────────────────
const { getInvoices, updateInvoice } = useInvoices();
const { selectedOrg, getOrganizationFilter } = useOrganization();
const { selectedClient, getClientFilter } = useClients();
const { canAccess } = useOrgRole();
const { getStatusBadgeClasses } = useStatusStyle();
const isAdmin = computed(() => canAccess('invoices'));

function fmtMoney(v: number | null | undefined): string {
  return formatCurrency(Number(v) || 0);
}
function fmtCompact(v: number): string {
  if (Math.abs(v) >= 1000) return '$' + (v / 1000).toFixed(1) + 'K';
  return '$' + v.toFixed(0);
}

// ── Cash flow floor ─────────────────────────────────────────────────────────
const cashflowLoading = ref(false);
const cashflowInvoices = ref<any[]>([]);
const cashflowExpenses = ref<any[]>([]);
const cashflowPayments = ref<any[]>([]);

async function fetchCashflow() {
  cashflowLoading.value = true;
  try {
    const invoiceItems = useDirectusItems('invoices');
    const expenseItems = useDirectusItems('expenses');
    const paymentItems = useDirectusItems('payments_received');

    const yearStart = `${new Date().getFullYear()}-01-01`;
    const orgId = selectedOrg.value;

    const invoiceFilter: any = { _and: [{ invoice_date: { _gte: yearStart } }] };
    const expenseFilter: any = { _and: [{ date: { _gte: yearStart } }] };
    if (orgId) {
      invoiceFilter._and.push({ bill_to: { _eq: orgId } });
      expenseFilter._and.push({ organization: { _eq: orgId } });
    }

    const [invs, exps, pays] = await Promise.all([
      invoiceItems.list({
        filter: invoiceFilter,
        fields: [
          'id', 'invoice_code', 'invoice_date', 'due_date', 'status', 'total_amount',
          'client.id', 'client.name',
        ],
        sort: ['-invoice_date'],
        limit: 500,
      }),
      expenseItems.list({
        fields: ['id', 'name', 'amount', 'category', 'date', 'vendor'],
        filter: expenseFilter,
        sort: ['-date'],
        limit: 50,
      }),
      paymentItems.list({
        fields: ['id', 'amount', 'date_received', 'payment_method', 'status', 'invoice_id.id', 'invoice_id.invoice_code', 'invoice_id.client.name'],
        sort: ['-date_received'],
        limit: 10,
      }),
    ]);

    cashflowInvoices.value = invs || [];
    cashflowExpenses.value = exps || [];
    cashflowPayments.value = pays || [];
  } catch (err) {
    console.error('[apps/money] fetchCashflow failed', err);
  } finally {
    cashflowLoading.value = false;
  }
}

const cashflowKpis = computed(() => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  let billedThisMonth = 0;
  let paidThisMonth = 0;
  let outstanding = 0;
  let overdueCount = 0;

  for (const inv of cashflowInvoices.value) {
    const total = Number(inv.total_amount) || 0;
    const invDate = inv.invoice_date ? new Date(inv.invoice_date) : null;
    if (invDate && invDate >= monthStart) billedThisMonth += total;
    if (inv.status === 'pending' || inv.status === 'processing') {
      outstanding += total;
      if (inv.due_date && new Date(inv.due_date) < now) overdueCount++;
    }
    if (inv.status === 'paid' && invDate && invDate >= monthStart) paidThisMonth += total;
  }

  return { billedThisMonth, paidThisMonth, outstanding, overdueCount };
});

const arAgingBuckets = computed(() => {
  const now = new Date();
  const buckets = [
    { key: 'current', label: 'Not yet due', amount: 0, count: 0, color: 'bg-success' },
    { key: '0-30', label: '1–30 days', amount: 0, count: 0, color: 'bg-warning' },
    { key: '31-60', label: '31–60 days', amount: 0, count: 0, color: 'bg-warning' },
    { key: '61-90', label: '61–90 days', amount: 0, count: 0, color: 'bg-warning' },
    { key: '90+', label: '90+ days', amount: 0, count: 0, color: 'bg-destructive' },
  ];
  for (const inv of cashflowInvoices.value) {
    if (inv.status !== 'pending' && inv.status !== 'processing') continue;
    const total = Number(inv.total_amount) || 0;
    if (!inv.due_date) {
      buckets[0]!.amount += total; buckets[0]!.count++;
      continue;
    }
    const due = new Date(inv.due_date);
    const daysOverdue = Math.floor((now.getTime() - due.getTime()) / 86400000);
    let idx = 0;
    if (daysOverdue <= 0) idx = 0;
    else if (daysOverdue <= 30) idx = 1;
    else if (daysOverdue <= 60) idx = 2;
    else if (daysOverdue <= 90) idx = 3;
    else idx = 4;
    buckets[idx]!.amount += total;
    buckets[idx]!.count++;
  }
  const totalAmount = buckets.reduce((s, b) => s + b.amount, 0) || 1;
  return buckets.map((b) => ({ ...b, pct: (b.amount / totalAmount) * 100 }));
});

const unpaidInvoicesPreview = computed(() => {
  return cashflowInvoices.value
    .filter((i: any) => i.status === 'pending' || i.status === 'processing')
    .sort((a: any, b: any) => {
      const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
      const db = b.due_date ? new Date(b.due_date).getTime() : Infinity;
      return da - db;
    })
    .slice(0, 6);
});

const recentExpensesPreview = computed(() => cashflowExpenses.value.slice(0, 6));

// ── Invoices floor ──────────────────────────────────────────────────────────
const invoicesList = ref<Invoice[]>([]);
const invoicesTotal = ref(0);
const invoicesLoading = ref(false);
const invoicesSearch = ref('');
const invoicesStatus = ref<'all' | 'pending' | 'processing' | 'paid' | 'archived'>('all');
const invoicesSort = ref('-due_date');
const showInvoiceModal = ref(false);

const invoiceStatusItems = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'processing', label: 'Processing' },
  { key: 'paid', label: 'Paid' },
  { key: 'archived', label: 'Archived' },
];

async function fetchInvoices() {
  invoicesLoading.value = true;
  try {
    const result = await getInvoices({
      search: invoicesSearch.value || undefined,
      status: invoicesStatus.value !== 'all' ? invoicesStatus.value : undefined,
      sort: [invoicesSort.value],
      limit: 200,
    });
    invoicesList.value = result.data;
    invoicesTotal.value = result.total;
  } catch (err) {
    console.error('[apps/money] fetchInvoices failed', err);
  } finally {
    invoicesLoading.value = false;
  }
}
const debouncedFetchInvoices = useDebounceFn(fetchInvoices, 300);

function getInvoiceDisplayName(inv: Invoice): string {
  const client = inv.client;
  if (client && typeof client === 'object' && (client as any).name) return (client as any).name;
  if (!inv.bill_to) return '—';
  if (typeof inv.bill_to === 'string') return inv.bill_to;
  return (inv.bill_to as any).name || '—';
}
function getInvoiceLineItemCount(inv: Invoice): number {
  return Array.isArray(inv.line_items) ? inv.line_items.length : 0;
}
async function updateInvoiceStatus(inv: Invoice, newStatus: string) {
  try {
    await updateInvoice(inv.id, { status: newStatus });
    inv.status = newStatus;
  } catch (err) {
    console.error('Failed to update status:', err);
  }
}
const dueDateColors: Record<string, string> = {
  past: 'text-destructive',
  urgent: 'text-warning',
  normal: 'text-muted-foreground',
};
function getDueDateUrgency(inv: Invoice): 'past' | 'urgent' | 'normal' {
  if (!inv.due_date || inv.status === 'paid' || inv.status === 'archived') return 'normal';
  const status = formatDueDateStatus(inv.due_date);
  if (status === 'past') return 'past';
  if (status === 'urgent' || status === 'medium') return 'urgent';
  return 'normal';
}
function onInvoiceCreated() {
  fetchInvoices();
  if (cashflowLoaded.value) fetchCashflow();
}

// ── Payments floor ──────────────────────────────────────────────────────────
const paymentsList = ref<any[]>([]);
const paymentsLoading = ref(false);

async function fetchPayments() {
  paymentsLoading.value = true;
  try {
    const paymentItems = useDirectusItems('payments_received');
    paymentsList.value = await paymentItems.list({
      fields: ['*', 'invoice_id.id', 'invoice_id.invoice_code', 'invoice_id.status', 'invoice_id.total_amount', 'invoice_id.client.name'],
      sort: ['-date_received'],
      limit: 200,
    });
  } catch (err) {
    console.error('[apps/money] fetchPayments failed', err);
    paymentsList.value = [];
  } finally {
    paymentsLoading.value = false;
  }
}

const paymentsTotal = computed(() => paymentsList.value.reduce((s, p) => s + (Number(p.amount) || 0), 0));

// ── Expenses floor ──────────────────────────────────────────────────────────
const { expenses, isLoading: expensesLoading, billableExpenses, reimbursableExpenses, deleteExpense, refresh: refreshExpenses } = useExpenses();
const expensesSearch = ref('');
const expensesCategory = ref('');
const expensesStatusFilter = ref('');
const expensesShowBillable = ref(false);
const showExpenseModal = ref(false);
const editingExpense = ref<any>(null);

const expenseStatusOptions = [
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'approved', label: 'Approved' },
  { value: 'paid', label: 'Paid' },
  { value: 'rejected', label: 'Rejected' },
];

const filteredExpenses = computed(() => {
  let result = [...expenses.value];
  if (expensesSearch.value) {
    const q = expensesSearch.value.toLowerCase();
    result = result.filter((e) =>
      (e.name || '').toLowerCase().includes(q) ||
      (e.vendor || '').toLowerCase().includes(q) ||
      (e.description || '').toLowerCase().includes(q),
    );
  }
  if (expensesCategory.value) result = result.filter((e) => e.category === expensesCategory.value);
  if (expensesStatusFilter.value) result = result.filter((e) => e.status === expensesStatusFilter.value);
  if (expensesShowBillable.value) result = result.filter((e) => e.is_billable);
  return result;
});
const expenseFilteredTotal = computed(() => filteredExpenses.value.reduce((s, e) => s + (Number(e.amount) || 0), 0));
const expenseBillableTotal = computed(() => billableExpenses.value.reduce((s, e) => s + (Number(e.amount) || 0), 0));

function getExpenseCategoryConfig(cat: string) {
  return EXPENSE_CATEGORIES.find((c) => c.value === cat) || EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1];
}
function formatExpenseDate(dateStr: string) {
  if (!dateStr) return '';
  return getFriendlyDateThree(dateStr + 'T00:00:00');
}
function openExpenseEdit(expense: any) {
  editingExpense.value = expense;
  showExpenseModal.value = true;
}
function openExpenseCreate() {
  editingExpense.value = null;
  showExpenseModal.value = true;
}
async function onExpenseSaved() {
  editingExpense.value = null;
  await refreshExpenses();
}
async function handleExpenseDelete(expense: any) {
  if (!confirm(`Delete "${expense.name}"?`)) return;
  try {
    await deleteExpense(expense.id);
  } catch {
    /* swallow — useExpenses already toasts */
  }
}

// ── Time floor ──────────────────────────────────────────────────────────────
const { isOrgManagerOrAbove } = useOrgRole();
const { user } = useDirectusAuth();
const { restoreTimer, getTimeEntries, deleteTimeEntry, formatDuration } = useTimeTracker();

const timeEntries = ref<TimeEntry[]>([]);
const timeTotal = ref(0);
const timeLoading = ref(false);
const timeTab = ref<'today' | 'week' | 'all' | 'team' | 'reports'>('week');
const showTimeManualEntry = ref(false);
const editingTimeEntry = ref<TimeEntry | null>(null);
const timePage = ref(1);
const TIME_PAGE_LIMIT = 50;

const timeTabs = computed(() => {
  const base: Array<{ key: typeof timeTab.value; label: string }> = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'This Week' },
    { key: 'all', label: 'All Entries' },
  ];
  if (isOrgManagerOrAbove.value) base.push({ key: 'team', label: 'Team' });
  base.push({ key: 'reports', label: 'Reports' });
  return base;
});

function getTimeDateFilters(): { dateFrom?: string; dateTo?: string } {
  const now = new Date();
  if (timeTab.value === 'today') {
    const todayStr = format(now, 'yyyy-MM-dd');
    return { dateFrom: todayStr, dateTo: todayStr };
  }
  if (timeTab.value === 'week') {
    return {
      dateFrom: format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
      dateTo: format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    };
  }
  return {};
}

async function fetchTimeEntries() {
  timeLoading.value = true;
  try {
    const result = await getTimeEntries({
      ...getTimeDateFilters(),
      status: 'completed',
      sort: ['-date', '-start_time'],
      limit: timeTab.value === 'all' ? TIME_PAGE_LIMIT : 200,
      page: timeTab.value === 'all' ? timePage.value : 1,
    });
    timeEntries.value = result.data;
    timeTotal.value = result.total;
  } catch (err) {
    console.error('[apps/money] fetchTimeEntries failed', err);
  } finally {
    timeLoading.value = false;
  }
}

interface TimeDateGroup {
  date: string;
  label: string;
  totalMinutes: number;
  entries: TimeEntry[];
}
const groupedTimeEntries = computed<TimeDateGroup[]>(() => {
  const groups = new Map<string, TimeEntry[]>();
  for (const entry of timeEntries.value) {
    const dateKey = entry.date || format(new Date(entry.start_time), 'yyyy-MM-dd');
    if (!groups.has(dateKey)) groups.set(dateKey, []);
    groups.get(dateKey)!.push(entry);
  }
  const result: TimeDateGroup[] = [];
  for (const [dateKey, entries] of groups) {
    const parsed = parseISO(dateKey);
    const isEntryToday = dateFnsIsToday(parsed);
    const dayName = isEntryToday ? 'Today' : format(parsed, 'EEEE');
    const dateLabel = format(parsed, 'MMM d, yyyy');
    const totalMinutes = entries.reduce((sum, e) => sum + (e.duration_minutes || 0), 0);
    result.push({ date: dateKey, label: `${dayName}, ${dateLabel}`, totalMinutes, entries });
  }
  return result.sort((a, b) => b.date.localeCompare(a.date));
});

function editTimeEntry(entry: TimeEntry) {
  editingTimeEntry.value = entry;
  showTimeManualEntry.value = true;
}
function closeTimeForm() {
  showTimeManualEntry.value = false;
  editingTimeEntry.value = null;
}
async function handleTimeSave() {
  closeTimeForm();
  await fetchTimeEntries();
}
async function handleTimeDelete(entry: TimeEntry) {
  if (!confirm('Delete this time entry?')) return;
  try {
    await deleteTimeEntry(entry.id);
    await fetchTimeEntries();
  } catch (err) {
    console.error('Failed to delete time entry:', err);
  }
}
function switchTimeTab(tab: typeof timeTab.value) {
  timeTab.value = tab;
  timePage.value = 1;
  if (tab !== 'reports' && tab !== 'team') fetchTimeEntries();
}

// ── Lazy-load per floor ─────────────────────────────────────────────────────
const cashflowLoaded = ref(false);
const invoicesLoaded = ref(false);
const paymentsLoaded = ref(false);
const expensesLoaded = ref(false);
const timeLoaded = ref(false);

watch(
  floor,
  (next) => {
    if (next === 'cashflow' && !cashflowLoaded.value) {
      cashflowLoaded.value = true;
      fetchCashflow();
    }
    if (next === 'invoices' && !invoicesLoaded.value) {
      invoicesLoaded.value = true;
      fetchInvoices();
    }
    if (next === 'payments' && !paymentsLoaded.value) {
      paymentsLoaded.value = true;
      fetchPayments();
    }
    if (next === 'expenses' && !expensesLoaded.value) {
      expensesLoaded.value = true;
      refreshExpenses();
    }
    if (next === 'time' && !timeLoaded.value) {
      timeLoaded.value = true;
      restoreTimer();
      fetchTimeEntries();
    }
  },
  { immediate: true },
);

// Refetch on filter / org / client changes (only if floor already loaded)
watch([invoicesStatus, invoicesSort, selectedOrg, selectedClient], () => {
  if (invoicesLoaded.value) fetchInvoices();
});
watch([selectedOrg, selectedClient], () => {
  if (cashflowLoaded.value) fetchCashflow();
  if (paymentsLoaded.value) fetchPayments();
});
watch(selectedClient, () => {
  if (timeLoaded.value) fetchTimeEntries();
});

// ── Header action button ────────────────────────────────────────────────────
const headerAction = computed(() => {
  if (floor.value === 'invoices' && isAdmin.value) {
    return { label: 'New Invoice', icon: 'lucide:plus', onClick: () => (showInvoiceModal.value = true) };
  }
  if (floor.value === 'expenses') {
    return { label: 'Add Expense', icon: 'lucide:plus', onClick: openExpenseCreate };
  }
  if (floor.value === 'time') {
    return { label: 'Start Timer', icon: 'lucide:timer', onClick: () => openTimerDockPanel() };
  }
  return null;
});
</script>

<template>
  <div class="apps-page">
    <AppHeader title="Money" app-id="money">
      <template #actions>
        <Button v-if="headerAction" size="sm" @click="headerAction.onClick">
          <Icon :name="headerAction.icon" class="w-4 h-4 mr-1" />
          {{ headerAction.label }}
        </Button>
      </template>
    </AppHeader>

    <LayoutPageContainer>
      <AppFloorStrip v-model="floor" :items="floors" aria-label="Money sections" />

      <AppIntroCard app-id="money" />
      <GoalsRelatedGoalsCard :categories="['revenue', 'retention']" title="Goals in this lens" />

      <!-- ── Cash flow floor ──────────────────────────────────────────── -->
      <template v-if="floor === 'cashflow'">
        <div v-if="cashflowLoading && !cashflowInvoices.length" class="flex items-center justify-center py-24 gap-3">
          <Icon name="lucide:loader-2" class="w-6 h-6 text-muted-foreground animate-spin" />
          <span class="text-sm text-muted-foreground">Loading…</span>
        </div>

        <template v-else>
          <!-- KPI strip -->
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <div class="ios-card p-4">
              <p class="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Outstanding</p>
              <p class="text-2xl font-bold" :class="cashflowKpis.outstanding > 0 ? 'text-warning' : 'text-foreground'">
                {{ fmtCompact(cashflowKpis.outstanding) }}
              </p>
              <p class="text-[11px] text-muted-foreground mt-0.5">across all open invoices</p>
            </div>
            <div class="ios-card p-4">
              <p class="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Overdue</p>
              <p class="text-2xl font-bold" :class="cashflowKpis.overdueCount > 0 ? 'text-destructive' : 'text-foreground'">
                {{ cashflowKpis.overdueCount }}
              </p>
              <p class="text-[11px] text-muted-foreground mt-0.5">{{ cashflowKpis.overdueCount === 1 ? 'invoice' : 'invoices' }} past due</p>
            </div>
            <div class="ios-card p-4">
              <p class="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Billed this month</p>
              <p class="text-2xl font-bold text-foreground">{{ fmtCompact(cashflowKpis.billedThisMonth) }}</p>
              <p class="text-[11px] text-muted-foreground mt-0.5">{{ format(new Date(), 'MMMM yyyy') }}</p>
            </div>
            <div class="ios-card p-4">
              <p class="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Paid this month</p>
              <p class="text-2xl font-bold text-success">{{ fmtCompact(cashflowKpis.paidThisMonth) }}</p>
              <p class="text-[11px] text-muted-foreground mt-0.5">collected</p>
            </div>
          </div>

          <!-- AR aging stack -->
          <div class="ios-card p-5 mb-5">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                AR Aging
              </h3>
              <span class="text-xs text-muted-foreground">{{ fmtCompact(cashflowKpis.outstanding) }} outstanding</span>
            </div>
            <div v-if="cashflowKpis.outstanding === 0" class="text-sm text-muted-foreground/70 py-3 text-center">
              No outstanding invoices.
            </div>
            <template v-else>
              <div class="flex h-3 rounded-full overflow-hidden bg-muted/30">
                <div
                  v-for="b in arAgingBuckets"
                  :key="b.key"
                  :class="b.color"
                  :style="{ width: `${b.pct}%` }"
                  class="transition-all"
                  :title="`${b.label}: ${fmtMoney(b.amount)}`"
                />
              </div>
              <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
                <div v-for="b in arAgingBuckets" :key="b.key" class="flex items-start gap-2">
                  <span :class="['w-2 h-2 rounded-full mt-1.5 shrink-0', b.color]" />
                  <div class="min-w-0">
                    <p class="text-[10px] uppercase tracking-wide text-muted-foreground">{{ b.label }}</p>
                    <p class="text-sm font-semibold tabular-nums">{{ fmtCompact(b.amount) }}</p>
                    <p class="text-[10px] text-muted-foreground">{{ b.count }} {{ b.count === 1 ? 'invoice' : 'invoices' }}</p>
                  </div>
                </div>
              </div>
            </template>
          </div>

          <!-- Recent activity grid -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div class="ios-card p-5">
              <div class="flex items-center justify-between mb-3">
                <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Unpaid Invoices
                  <span v-if="unpaidInvoicesPreview.length" class="text-warning ml-1">({{ unpaidInvoicesPreview.length }})</span>
                </h3>
                <button
                  class="inline-flex items-center gap-0.5 text-[10px] font-medium uppercase tracking-wide text-primary hover:underline"
                  @click="floor = 'invoices'"
                >
                  View all
                  <Icon name="lucide:chevron-right" class="w-3 h-3" />
                </button>
              </div>
              <div v-if="!unpaidInvoicesPreview.length" class="text-sm text-muted-foreground/70 py-4 text-center">
                All caught up.
              </div>
              <div v-else class="space-y-0.5">
                <div
                  v-for="inv in unpaidInvoicesPreview"
                  :key="inv.id"
                  class="flex items-center justify-between py-2.5 px-2 -mx-2 rounded-md hover:bg-muted/30 cursor-pointer transition-colors"
                  @click="router.push(`/invoices/detail/${inv.id}`)"
                >
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-medium truncate">{{ inv.invoice_code || 'Draft' }}</span>
                      <span class="text-xs text-muted-foreground truncate">{{ inv.client?.name || '' }}</span>
                    </div>
                    <div
                      class="text-[11px] mt-0.5"
                      :class="inv.due_date && getDaysUntilDue(inv.due_date) < 0 ? 'text-destructive' : inv.due_date && getDaysUntilDue(inv.due_date) <= 7 ? 'text-warning' : 'text-muted-foreground'"
                    >
                      <template v-if="inv.due_date">
                        <template v-if="getDaysUntilDue(inv.due_date) < 0">{{ Math.abs(getDaysUntilDue(inv.due_date)) }}d overdue</template>
                        <template v-else-if="getDaysUntilDue(inv.due_date) === 0">Due today</template>
                        <template v-else>Due in {{ getDaysUntilDue(inv.due_date) }}d</template>
                      </template>
                      <template v-else>No due date</template>
                    </div>
                  </div>
                  <span class="text-sm font-bold tabular-nums shrink-0 ml-3">{{ fmtMoney(inv.total_amount) }}</span>
                </div>
              </div>
            </div>

            <div class="ios-card p-5">
              <div class="flex items-center justify-between mb-3">
                <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent Expenses</h3>
                <button
                  class="inline-flex items-center gap-0.5 text-[10px] font-medium uppercase tracking-wide text-primary hover:underline"
                  @click="floor = 'expenses'"
                >
                  View all
                  <Icon name="lucide:chevron-right" class="w-3 h-3" />
                </button>
              </div>
              <div v-if="!recentExpensesPreview.length" class="text-sm text-muted-foreground/70 py-4 text-center">
                No expenses recorded yet.
              </div>
              <div v-else class="space-y-0.5">
                <div
                  v-for="exp in recentExpensesPreview"
                  :key="exp.id"
                  class="flex items-center justify-between py-2.5 px-2 -mx-2 rounded-md hover:bg-muted/30 cursor-pointer transition-colors"
                  @click="floor = 'expenses'"
                >
                  <div class="min-w-0 flex-1">
                    <span class="text-sm font-medium truncate block">{{ exp.name }}</span>
                    <div class="flex items-center gap-2 mt-0.5">
                      <span class="text-[11px] text-muted-foreground capitalize">{{ (exp.category || 'other').replace(/_/g, ' ') }}</span>
                      <span v-if="exp.date" class="text-[11px] text-muted-foreground/60">{{ formatExpenseDate(exp.date) }}</span>
                    </div>
                  </div>
                  <span class="text-sm font-bold tabular-nums shrink-0 ml-3">{{ fmtMoney(exp.amount) }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Recent payments -->
          <div v-if="cashflowPayments.length" class="ios-card p-5 mt-4">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent Payments</h3>
              <button class="inline-flex items-center gap-0.5 text-[10px] font-medium uppercase tracking-wide text-primary hover:underline" @click="floor = 'payments'">
                View all
                <Icon name="lucide:chevron-right" class="w-3 h-3" />
              </button>
            </div>
            <div class="space-y-0.5">
              <div
                v-for="p in cashflowPayments.slice(0, 5)"
                :key="p.id"
                class="flex items-center justify-between py-2.5 px-2 -mx-2 rounded-md hover:bg-muted/30 cursor-pointer transition-colors"
                @click="p.invoice_id?.id && router.push(`/invoices/detail/${p.invoice_id.id}`)"
              >
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium truncate">{{ p.invoice_id?.invoice_code || '—' }}</span>
                    <span class="text-xs text-muted-foreground truncate">{{ p.invoice_id?.client?.name || '' }}</span>
                  </div>
                  <div class="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                    <span>{{ getFriendlyDateThree(p.date_received) || '—' }}</span>
                    <span v-if="p.payment_method" class="capitalize">· {{ p.payment_method }}</span>
                  </div>
                </div>
                <span class="text-sm font-bold tabular-nums shrink-0 ml-3 text-success">{{ fmtMoney(p.amount) }}</span>
              </div>
            </div>
          </div>
        </template>
      </template>

      <!-- ── Invoices floor ───────────────────────────────────────────── -->
      <template v-else-if="floor === 'invoices'">
        <div class="flex gap-3 mb-5 flex-wrap items-center">
          <input
            v-model="invoicesSearch"
            type="search"
            placeholder="Search invoices…"
            class="flex-1 min-w-48 rounded-md border bg-background px-3 py-2 text-sm"
            @input="debouncedFetchInvoices"
          />
          <UTabs
            v-model="invoicesStatus"
            :items="invoiceStatusItems"
            class="w-fit"
          />
        </div>

        <div v-if="invoicesLoading && !invoicesList.length" class="flex flex-col items-center justify-center py-24 gap-3">
          <Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
          <p class="text-sm text-muted-foreground">Loading invoices…</p>
        </div>

        <div v-else-if="!invoicesList.length" class="flex flex-col items-center justify-center py-24 gap-4">
          <Icon name="lucide:file-text" class="w-12 h-12 text-muted-foreground/40" />
          <div class="text-center">
            <p class="text-sm font-medium text-muted-foreground">No invoices found</p>
            <p class="text-xs text-muted-foreground/70 mt-1">
              {{ invoicesSearch ? 'Try adjusting your search.' : 'Create your first invoice to get started.' }}
            </p>
          </div>
          <Button v-if="!invoicesSearch && isAdmin" size="sm" @click="showInvoiceModal = true">
            <Icon name="lucide:plus" class="w-4 h-4 mr-1" />
            New Invoice
          </Button>
        </div>

        <div v-else class="ios-card overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-border/50">
                  <th class="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Invoice</th>
                  <th class="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Bill To</th>
                  <th class="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Status</th>
                  <th class="text-right py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Amount</th>
                  <th class="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Due Date</th>
                  <th class="text-center py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Items</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="inv in invoicesList"
                  :key="inv.id"
                  class="border-b border-border/30 last:border-b-0 hover:bg-muted/20 cursor-pointer transition-colors"
                  :class="{ 'opacity-50': inv.status === 'paid' || inv.status === 'archived' }"
                  @click="router.push(`/invoices/detail/${inv.id}`)"
                >
                  <td class="py-3 px-4 font-medium">{{ inv.invoice_code || 'No Code' }}</td>
                  <td class="py-3 px-4 text-muted-foreground">{{ getInvoiceDisplayName(inv) }}</td>
                  <td class="py-3 px-4" @click.stop>
                    <select
                      v-if="isAdmin"
                      :value="inv.status"
                      class="appearance-none rounded-full px-2 py-0.5 text-[10px] font-medium capitalize border-0 cursor-pointer pr-5 bg-no-repeat bg-[right_4px_center] bg-[length:10px]"
                      :class="getStatusBadgeClasses(inv.status)"
                      :style="{ backgroundImage: `url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22 fill=%22currentColor%22><path fill-rule=%22evenodd%22 d=%22M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z%22 clip-rule=%22evenodd%22/></svg>')` }"
                      @change="updateInvoiceStatus(inv, ($event.target as HTMLSelectElement).value)"
                    >
                      <option v-for="s in invoiceStatusItems.slice(1)" :key="s.key" :value="s.key">{{ s.label }}</option>
                    </select>
                    <span
                      v-else
                      class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize"
                      :class="getStatusBadgeClasses(inv.status)"
                    >
                      {{ inv.status }}
                    </span>
                  </td>
                  <td class="py-3 px-4 text-right font-medium tabular-nums">{{ fmtMoney(inv.total_amount) }}</td>
                  <td class="py-3 px-4">
                    <span :class="dueDateColors[getDueDateUrgency(inv)]">
                      {{ inv.due_date ? getFriendlyDateThree(inv.due_date) : '—' }}
                    </span>
                    <span
                      v-if="getDueDateUrgency(inv) === 'past'"
                      class="text-[9px] uppercase font-semibold text-destructive ml-1"
                    >
                      Past due
                    </span>
                  </td>
                  <td class="py-3 px-4 text-center text-muted-foreground">{{ getInvoiceLineItemCount(inv) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <p v-if="invoicesTotal" class="text-[11px] text-muted-foreground mt-3">
          Showing {{ invoicesList.length }} of {{ invoicesTotal }}
        </p>

        <InvoicesFormModal
          v-model="showInvoiceModal"
          @created="onInvoiceCreated"
        />
      </template>

      <!-- ── Payments floor ───────────────────────────────────────────── -->
      <template v-else-if="floor === 'payments'">
        <div v-if="paymentsLoading && !paymentsList.length" class="flex flex-col items-center justify-center py-24 gap-3">
          <Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
          <p class="text-sm text-muted-foreground">Loading payments…</p>
        </div>

        <template v-else>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            <div class="ios-card p-4">
              <p class="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Total Received</p>
              <p class="text-2xl font-bold text-success">{{ fmtMoney(paymentsTotal) }}</p>
            </div>
            <div class="ios-card p-4">
              <p class="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Payments</p>
              <p class="text-2xl font-bold text-foreground">{{ paymentsList.length }}</p>
            </div>
            <div class="ios-card p-4">
              <p class="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Latest</p>
              <p class="text-2xl font-bold text-foreground">
                {{ paymentsList.length ? (getFriendlyDateThree(paymentsList[0]?.date_received) || '—') : '—' }}
              </p>
            </div>
          </div>

          <div v-if="!paymentsList.length" class="flex flex-col items-center justify-center py-24 gap-4">
            <Icon name="lucide:credit-card" class="w-12 h-12 text-muted-foreground/40" />
            <p class="text-sm text-muted-foreground">No payments received yet.</p>
          </div>

          <div v-else class="ios-card overflow-hidden">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-border/50">
                  <th class="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Date</th>
                  <th class="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Invoice</th>
                  <th class="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Client</th>
                  <th class="text-right py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Amount</th>
                  <th class="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Method</th>
                  <th class="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="p in paymentsList"
                  :key="p.id"
                  class="border-b border-border/30 last:border-b-0 hover:bg-muted/20 transition-colors"
                  :class="{ 'cursor-pointer': p.invoice_id?.id }"
                  @click="p.invoice_id?.id && router.push(`/invoices/detail/${p.invoice_id.id}`)"
                >
                  <td class="py-3 px-4">{{ getFriendlyDateThree(p.date_received) || '—' }}</td>
                  <td class="py-3 px-4">
                    <span v-if="p.invoice_id?.id" class="text-blue-500 font-medium">{{ p.invoice_id.invoice_code || 'View Invoice' }}</span>
                    <span v-else class="text-muted-foreground">—</span>
                  </td>
                  <td class="py-3 px-4 text-muted-foreground">{{ p.invoice_id?.client?.name || '—' }}</td>
                  <td class="py-3 px-4 text-right font-medium tabular-nums">{{ fmtMoney(p.amount) }}</td>
                  <td class="py-3 px-4 text-muted-foreground capitalize">{{ p.payment_method || p.method || '—' }}</td>
                  <td class="py-3 px-4">
                    <span
                      class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize"
                      :class="getStatusBadgeClasses(p.status || 'completed')"
                    >
                      {{ p.status || 'completed' }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </template>

      <!-- ── Expenses floor ───────────────────────────────────────────── -->
      <template v-else-if="floor === 'expenses'">
        <div v-if="expensesLoading && !expenses.length" class="flex flex-col items-center justify-center py-24 gap-3">
          <Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
          <p class="text-sm text-muted-foreground">Loading expenses…</p>
        </div>

        <template v-else>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <div class="ios-card p-4 text-center">
              <p class="text-lg font-bold text-foreground">{{ fmtMoney(expenseFilteredTotal) }}</p>
              <p class="text-[10px] uppercase tracking-wide text-muted-foreground">Total</p>
            </div>
            <div class="ios-card p-4 text-center">
              <p class="text-lg font-bold text-foreground">{{ filteredExpenses.length }}</p>
              <p class="text-[10px] uppercase tracking-wide text-muted-foreground">Entries</p>
            </div>
            <div class="ios-card p-4 text-center">
              <p class="text-lg font-bold text-blue-400">{{ fmtMoney(expenseBillableTotal) }}</p>
              <p class="text-[10px] uppercase tracking-wide text-muted-foreground">Billable</p>
            </div>
            <div class="ios-card p-4 text-center">
              <p class="text-lg font-bold text-purple-400">{{ reimbursableExpenses.length }}</p>
              <p class="text-[10px] uppercase tracking-wide text-muted-foreground">Reimbursable</p>
            </div>
          </div>

          <div class="flex flex-wrap gap-2 mb-4">
            <input
              v-model="expensesSearch"
              type="search"
              placeholder="Search expenses…"
              class="flex-1 min-w-[180px] rounded-md border bg-background px-3 py-2 text-sm"
            />
            <select
              v-model="expensesCategory"
              class="rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">All Categories</option>
              <option v-for="cat in EXPENSE_CATEGORIES" :key="cat.value" :value="cat.value">{{ cat.label }}</option>
            </select>
            <select
              v-model="expensesStatusFilter"
              class="rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">All Statuses</option>
              <option v-for="s in expenseStatusOptions" :key="s.value" :value="s.value">{{ s.label }}</option>
            </select>
            <button
              type="button"
              class="px-3 py-2 rounded-md text-sm font-medium transition-colors"
              :class="expensesShowBillable ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:text-foreground'"
              @click="expensesShowBillable = !expensesShowBillable"
            >
              Billable only
            </button>
          </div>

          <div v-if="!filteredExpenses.length" class="flex flex-col items-center justify-center py-24 gap-3">
            <Icon name="lucide:receipt" class="w-12 h-12 text-muted-foreground/40" />
            <p class="text-sm text-muted-foreground">
              {{ expenses.length ? 'No expenses match your filters.' : 'No expenses yet.' }}
            </p>
            <Button v-if="!expenses.length" size="sm" @click="openExpenseCreate">
              <Icon name="lucide:plus" class="w-4 h-4 mr-1" />
              Add expense
            </Button>
          </div>

          <div v-else class="ios-card overflow-hidden">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-border/50">
                  <th class="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Expense</th>
                  <th class="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Category</th>
                  <th class="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Vendor</th>
                  <th class="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Date</th>
                  <th class="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Status</th>
                  <th class="text-right py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Amount</th>
                  <th class="text-right py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider w-12"></th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="expense in filteredExpenses"
                  :key="expense.id"
                  class="border-b border-border/30 last:border-b-0 hover:bg-muted/20 cursor-pointer transition-colors"
                  @click="openExpenseEdit(expense)"
                >
                  <td class="py-3 px-4 font-medium">{{ expense.name }}</td>
                  <td class="py-3 px-4">
                    <div class="flex items-center gap-1.5">
                      <UIcon
                        :name="getExpenseCategoryConfig(expense.category || 'other')?.icon ?? 'i-heroicons-tag'"
                        class="w-3.5 h-3.5"
                        :class="getExpenseCategoryConfig(expense.category || 'other')?.color ?? 'text-muted-foreground'"
                      />
                      <span class="text-muted-foreground text-xs">
                        {{ getExpenseCategoryConfig(expense.category || 'other')?.label ?? 'Other' }}
                      </span>
                    </div>
                  </td>
                  <td class="py-3 px-4 text-muted-foreground">{{ expense.vendor || '—' }}</td>
                  <td class="py-3 px-4 text-muted-foreground">{{ formatExpenseDate(expense.date) }}</td>
                  <td class="py-3 px-4">
                    <span
                      class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize"
                      :class="getStatusBadgeClasses(expense.status || 'draft')"
                    >
                      {{ expense.status || 'draft' }}
                    </span>
                  </td>
                  <td class="py-3 px-4 text-right font-medium tabular-nums">{{ fmtMoney(expense.amount) }}</td>
                  <td class="py-3 px-4 text-right" @click.stop>
                    <button
                      type="button"
                      class="p-1 rounded text-muted-foreground hover:text-destructive transition-colors"
                      @click="handleExpenseDelete(expense)"
                    >
                      <UIcon name="i-heroicons-trash" class="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>

        <ExpensesFormModal
          v-model="showExpenseModal"
          :expense="editingExpense"
          @saved="onExpenseSaved"
        />
      </template>

      <!-- ── Time floor ───────────────────────────────────────────────── -->
      <template v-else-if="floor === 'time'">
        <TimeTrackerStats :entries="timeEntries" class="mb-5" />

        <div class="inline-flex items-center gap-1 rounded-xl bg-muted/50 p-1 border border-border mb-5">
          <button
            v-for="tab in timeTabs"
            :key="tab.key"
            type="button"
            class="flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] uppercase tracking-wider font-semibold transition-all"
            :class="timeTab === tab.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            @click="switchTimeTab(tab.key)"
          >
            {{ tab.label }}
          </button>
        </div>

        <LazyTimeTrackerTeamView v-if="timeTab === 'team'" />
        <LazyTimeTrackerReport v-else-if="timeTab === 'reports'" :team-mode="isOrgManagerOrAbove" />

        <template v-else>
          <div v-if="timeLoading && !timeEntries.length" class="flex flex-col items-center justify-center py-24 gap-3">
            <Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
            <p class="text-sm text-muted-foreground">Loading entries…</p>
          </div>

          <div v-else-if="!timeEntries.length" class="flex flex-col items-center justify-center py-24 gap-4">
            <Icon name="lucide:clock" class="w-12 h-12 text-muted-foreground/40" />
            <div class="text-center">
              <p class="text-sm font-medium text-muted-foreground">No time entries</p>
              <p class="text-xs text-muted-foreground/70 mt-1">
                Start a timer or add a manual entry to begin tracking.
              </p>
            </div>
            <Button size="sm" @click="showTimeManualEntry = true">
              <Icon name="lucide:plus" class="w-4 h-4 mr-1" />
              Manual Entry
            </Button>
          </div>

          <div v-else class="min-h-[400px]">
            <div v-for="group in groupedTimeEntries" :key="group.date" class="mb-6">
              <div class="flex items-center justify-between mb-3 px-1">
                <h3 class="text-sm font-medium text-muted-foreground">{{ group.label }}</h3>
                <span class="text-xs text-muted-foreground">{{ formatDuration(group.totalMinutes) }}</span>
              </div>
              <div class="space-y-2">
                <TimeTrackerEntryCard
                  v-for="entry in group.entries"
                  :key="entry.id"
                  :entry="entry"
                  :show-user="timeTab === 'all'"
                  @edit="editTimeEntry"
                  @delete="handleTimeDelete"
                />
              </div>
            </div>

            <div v-if="timeTab === 'all'" class="flex justify-between items-center mt-4">
              <p class="text-sm text-muted-foreground">Showing {{ timeEntries.length }} of {{ timeTotal }}</p>
              <div class="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  :disabled="timePage === 1"
                  @click="timePage--; fetchTimeEntries()"
                >
                  <Icon name="lucide:chevron-left" class="w-4 h-4" />
                </Button>
                <span class="text-sm px-3 py-1">{{ timePage }}</span>
                <Button
                  variant="outline"
                  size="sm"
                  :disabled="timePage * TIME_PAGE_LIMIT >= timeTotal"
                  @click="timePage++; fetchTimeEntries()"
                >
                  <Icon name="lucide:chevron-right" class="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          <Teleport to="body">
            <Transition name="modal-fade">
              <div
                v-if="showTimeManualEntry"
                class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
                @click.self="closeTimeForm"
              >
                <div class="ios-card shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto p-6">
                  <h2 class="font-semibold mb-4">{{ editingTimeEntry ? 'Edit Entry' : 'Manual Entry' }}</h2>
                  <TimeTrackerEntryForm
                    :show="showTimeManualEntry"
                    :entry="editingTimeEntry"
                    @save="handleTimeSave"
                    @cancel="closeTimeForm"
                  />
                </div>
              </div>
            </Transition>
          </Teleport>
        </template>
      </template>

      <!-- ── Insights floor ────────────────────────────────────────────── -->
      <template v-else-if="floor === 'insights'">
        <MoneyInsightsView :snapshot="moneyInsightsSnapshot" :loading="moneyInsightsLoading" />
      </template>
    </LayoutPageContainer>
  </div>
</template>

<style scoped>
.apps-page {
  @apply flex flex-col min-h-full;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
</style>
