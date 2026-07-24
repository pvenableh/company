<script setup lang="ts">
/**
 * Money app — Apps Layout Phase 4 (Time floor extracted in retainer/social
 * Phase 2, 2026-05-18; Documents floor added in document-system step 5,
 * 2026-05-18).
 *
 * Single landing page with a pill-segmented floor strip:
 *   Cash flow (default) | Documents | Invoices | Payments | Expenses | Insights
 *
 * Same shape as /apps/work: floor switching is in-place via `?floor=` query
 * param so the shell never remounts. Drill-downs from any floor still push
 * to the canonical classic detail routes (`/invoices/detail/[id]`,
 * `/invoices/[id]`, etc.) — except Documents, which opens proposal/contract
 * slide-over panels instead of navigating away.
 *
 * `?floor=time` now redirects to `/apps/work?floor=time` — time tracking
 * lives under Work because the hours pool absorbs ALL work types, not just
 * billable invoicing. See retainer plan memory.
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
import type { Invoice } from '~~/shared/directus';
import { useDebounceFn } from '@vueuse/core';
import { Button } from '~/components/ui/button';
import { format, startOfWeek, parseISO, isToday as dateFnsIsToday } from 'date-fns';
import { toast } from 'vue-sonner';

definePageMeta({ layout: 'apps', middleware: ['auth'] });
useHead({ title: 'Money | Earnest' });

const router = useRouter();

const invoiceSlide = useAppSlideOver('invoice');
function openInvoice(invoiceId: string) {
  invoiceSlide.open(invoiceId);
}
// Open the full rendered invoice in a new tab — staff viewers get the printable
// view, which carries its own "Download PDF" button (DocumentsDocumentPdfGenerator).
function openInvoicePdf(invoiceId: string) {
  window.open(`/invoices/${invoiceId}`, '_blank', 'noopener');
}
const route = useRoute();

// ── Floor strip ─────────────────────────────────────────────────────────────
// Time tracking moved to /apps/work?floor=time in Phase 2 of the retainer
// plan — any lingering `?floor=time` deep-links bounce out below.
type FloorKey = 'cashflow' | 'documents' | 'pipeline' | 'invoices' | 'payments' | 'deposits' | 'expenses' | 'insights';
const FLOOR_KEYS: FloorKey[] = ['cashflow', 'documents', 'pipeline', 'invoices', 'payments', 'deposits', 'expenses', 'insights'];

if (route.query.floor === 'time') {
  await navigateTo({ path: '/apps/work', query: { floor: 'time' } }, { redirectCode: 302, replace: true });
}

const initialFloor: FloorKey = (() => {
  const v = route.query.floor;
  return typeof v === 'string' && FLOOR_KEYS.includes(v as FloorKey) ? (v as FloorKey) : 'cashflow';
})();
const floor = ref<FloorKey>(initialFloor);

// Interior floor content slides left/right to match the main app transition.
const floorTransition = useDirectionalFloorTransition(FLOOR_KEYS, floor);
// Payments: river vs table are an either-or (never shown together).
const paymentsView = ref<'list' | 'river'>('list');

watch(floor, (next) => {
  router.replace({ query: { ...route.query, floor: next === 'cashflow' ? undefined : next } });
});

// Floor list lifted into the shared nav model (`useAppNav`) so this strip and
// the desktop AppSidebar never drift.
const floors = appFloors('money') as Array<{ key: FloorKey; label: string; icon: string }>;

// Documents floor — sub-tab `?tab=` rides alongside `?floor=documents`.
// Hosting page owns the create modals; the floor component only renders
// the lists + tab strip + counts.
const documentsTab = ref<'proposals' | 'contracts'>(
  route.query.tab === 'contracts' || route.query.tab === 'proposals'
    ? (route.query.tab as 'proposals' | 'contracts')
    : 'proposals',
);
const documentsFloorRef = ref<any>(null);
const showProposalModal = ref(false);
const showContractModal = ref(false);
const showDraftAiModal = ref(false);

watch(documentsTab, (next) => {
  if (floor.value !== 'documents') return;
  router.replace({ query: { ...route.query, tab: next === 'proposals' ? undefined : next } });
});

watch(floor, (next, prev) => {
  if (prev === 'documents' && next !== 'documents') {
    // Drop ?tab= when leaving Documents so it doesn't bleed into other floors.
    const { tab: _t, ...rest } = route.query;
    router.replace({ query: { ...rest, floor: next === 'cashflow' ? undefined : next } });
  }
});

function onDocumentCreated() {
  showProposalModal.value = false;
  showContractModal.value = false;
  documentsFloorRef.value?.refresh?.();
}

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

// ── Org money pipeline (value → paid → to-hunt, the whole studio) ────────────
// The org altitude of the reporting the project + client surfaces show. Scoped
// by invoice `bill_to` (matching fetchCashflow). Paid = summed payments so
// partials count; per-invoice paid clamped so segments sum to invoiced. Contract
// value = Σ the org's non-archived projects. Hunt rows span every client.
interface OrgHuntRow { id: string; code: string; who: string; outstanding: number; dueDate: string | null }
const orgContractValue = ref<number | null>(null);
const orgPaid = ref(0);
const orgCurrentOutstanding = ref(0);
const orgOverdue = ref(0);
const orgHuntRows = ref<OrgHuntRow[]>([]);
const orgPipelineLoading = ref(false);
const orgPipelineReady = ref(false);
let orgPipelineLoaded = false;

async function fetchOrgPipeline() {
  const orgId = selectedOrg.value;
  orgPipelineLoading.value = true;
  try {
    const invoiceItems = useDirectusItems('invoices');
    const projectItems = useDirectusItems('projects');
    const invoiceFilter: any = orgId ? { bill_to: { _eq: orgId } } : {};
    const projectFilter: any = orgId
      ? { organization: { _eq: orgId }, status: { _neq: 'Archived' } }
      : { status: { _neq: 'Archived' } };
    const [invoices, projects] = await Promise.all([
      invoiceItems.list({
        fields: [
          'id', 'invoice_code', 'status', 'total_amount', 'due_date',
          'client.name', 'payments.amount', 'payments.status', 'payments.livemode',
        ],
        filter: invoiceFilter, limit: -1,
      }).catch(() => []) as Promise<any[]>,
      projectItems.list({
        fields: ['contract_value', 'status'], filter: projectFilter, limit: -1,
      }).catch(() => []) as Promise<any[]>,
    ]);

    const today = new Date(); today.setHours(0, 0, 0, 0);
    let paid = 0, current = 0, overdue = 0;
    const hunt: OrgHuntRow[] = [];

    for (const inv of invoices) {
      if (inv?.status === 'archived') continue;
      const total = Number(inv?.total_amount) || 0;
      const invPaidRaw = (inv?.payments || []).reduce((s: number, p: any) => {
        if (p?.status !== 'paid' || p?.livemode === false) return s;
        return s + (Number(p?.amount) || 0);
      }, 0);
      const invPaid = Math.min(Math.max(invPaidRaw, 0), total);
      const invOut = total - invPaid;
      paid += invPaid;
      if (invOut <= 0.005) continue;

      const due = inv?.due_date ? new Date(inv.due_date) : null;
      if (due) due.setHours(0, 0, 0, 0);
      const isOverdue = !!due && due.getTime() < today.getTime();
      if (isOverdue) overdue += invOut; else current += invOut;
      hunt.push({
        id: String(inv.id),
        code: inv?.invoice_code || 'Invoice',
        who: inv?.client?.name || 'Client',
        outstanding: invOut,
        dueDate: inv?.due_date || null,
      });
    }

    orgContractValue.value = projects.reduce((s, p) => s + (Number(p?.contract_value) || 0), 0);
    orgPaid.value = paid;
    orgCurrentOutstanding.value = current;
    orgOverdue.value = overdue;
    orgHuntRows.value = hunt;
    orgPipelineReady.value = true;
  } catch {
    orgPipelineReady.value = false;
  } finally {
    orgPipelineLoading.value = false;
  }
}

// Load once when the Insights floor is first opened; refetch on org switch.
watch(floor, (next) => {
  if (next === 'insights' && !orgPipelineLoaded) {
    orgPipelineLoaded = true;
    fetchOrgPipeline();
  }
}, { immediate: true });
watch(selectedOrg, () => { if (orgPipelineLoaded) fetchOrgPipeline(); });

// Hunt-list row → the invoices floor (the actionable list).
function openHuntInvoice(_id: string) { floor.value = 'invoices'; }

// ── Deposits floor (Stripe Connect — money the org RECEIVES from its clients) ─
// Relocated here from the Organization app's Billing tab: getting paid is a
// Money concern, distinct from the org's own SaaS subscription. Onboarding +
// the native operational surface (balance / transactions / payouts / refunds)
// both live on this floor. NOTE: distinct from Plaid bank-sync, which feeds the
// Expenses floor — Deposits is strictly Stripe settlement of client payments.
type ConnectStatus = 'active' | 'pending' | 'inactive' | 'restricted' | 'unknown';
const stripeConnect = ref<{
  status: ConnectStatus;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  accountId?: string | null;
} | null>(null);
const stripeConnectLoading = ref(false);
let depositsLoaded = false;

async function fetchStripeConnect() {
  if (!selectedOrg.value) return;
  stripeConnectLoading.value = true;
  try {
    const data = await $fetch<{
      status: 'none' | 'pending' | 'active' | 'restricted';
      chargesEnabled: boolean;
      payoutsEnabled: boolean;
      accountId: string | null;
    }>('/api/stripe/connect/status', { query: { organizationId: selectedOrg.value } });

    let mapped: ConnectStatus = 'inactive';
    if (data.status === 'active') mapped = 'active';
    else if (data.status === 'pending') mapped = 'pending';
    else if (data.status === 'restricted') mapped = 'restricted';

    stripeConnect.value = {
      status: mapped,
      chargesEnabled: data.chargesEnabled,
      payoutsEnabled: data.payoutsEnabled,
      accountId: data.accountId,
    };
  } catch (err: any) {
    stripeConnect.value = { status: err?.statusCode === 403 ? 'unknown' : 'inactive' };
  } finally {
    stripeConnectLoading.value = false;
  }
}

const connectActing = ref(false);
async function startStripeConnect() {
  const orgId = selectedOrg.value;
  if (!orgId || connectActing.value) return;
  connectActing.value = true;
  try {
    const base = window.location.origin;
    const res = await $fetch<{ url: string }>('/api/stripe/connect/onboard', {
      method: 'POST',
      body: {
        organizationId: orgId,
        returnUrl: `${base}/apps/money?floor=deposits&onboarding=complete`,
        refreshUrl: `${base}/apps/money?floor=deposits&onboarding=refresh`,
      },
    });
    if (res?.url) window.location.href = res.url;
  } catch (err: any) {
    toast.error('Could not start onboarding', {
      description: err?.data?.message || err?.message || 'Stripe rejected the request.',
    });
  } finally {
    connectActing.value = false;
  }
}

// Standard Connect OAuth — links a PRE-EXISTING Stripe account (e.g. a business
// already running payments elsewhere) instead of creating a fresh Express
// account. Full-page redirect to oauth-start; oauth-callback returns here with
// connect_linked=1 (or connect_error=…) via returnTo=money.
function connectExistingAccount() {
  const orgId = selectedOrg.value;
  if (!orgId || connectActing.value) return;
  connectActing.value = true;
  window.location.href = `/api/stripe/connect/oauth-start?organizationId=${encodeURIComponent(orgId)}&returnTo=money`;
}

// Return leg for both Connect flows (Express onboarding + Standard OAUTH link).
// Refresh status, toast, then strip the query so a refresh doesn't re-fire.
watch(
  () => [route.query.onboarding, route.query.connect_linked, route.query.connect_error] as const,
  async ([onboarding, linked, connectError]) => {
    if (!onboarding && !linked && !connectError) return;
    if (selectedOrg.value) {
      depositsLoaded = true;
      await fetchStripeConnect();
    }
    if (linked) {
      toast.success('Stripe account linked', {
        description: stripeConnect.value?.status === 'active'
          ? 'Your existing account is connected and can accept invoice payments.'
          : 'Account linked. Stripe is still verifying some details; this updates automatically.',
      });
    } else if (connectError) {
      toast.error('Could not link Stripe account', { description: String(connectError) });
    } else if (onboarding === 'complete') {
      toast.success('Stripe onboarding submitted', {
        description: stripeConnect.value?.status === 'active'
          ? 'Your account is active and can accept invoice payments.'
          : 'Stripe is still verifying your details; this updates automatically.',
      });
    }
    const { onboarding: _o, connect_linked: _l, connect_error: _e, ...rest } = route.query;
    router.replace({ query: rest });
  },
  { immediate: true },
);

const connectStatusMeta = computed(() => {
  const s = stripeConnect.value?.status;
  if (s === 'active') return { label: 'Connected · accepting payments', tone: 'bg-success/15 text-success', dot: 'bg-success' };
  if (s === 'pending') return { label: 'Onboarding in progress', tone: 'bg-warning/15 text-warning', dot: 'bg-warning' };
  if (s === 'restricted') return { label: 'Action required', tone: 'bg-destructive/15 text-destructive', dot: 'bg-destructive' };
  if (s === 'unknown') return { label: 'Status unavailable', tone: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground/40' };
  return { label: 'Not connected', tone: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground/30' };
});

watch(floor, (next) => {
  if (next === 'deposits' && !depositsLoaded) {
    depositsLoaded = true;
    fetchStripeConnect();
  }
}, { immediate: true });

watch(selectedOrg, () => { if (depositsLoaded) fetchStripeConnect(); });

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
          'refunded_total', 'disputed',
          'client.id', 'client.name',
        ],
        sort: ['-invoice_date'],
        limit: 500,
      }),
      expenseItems.list({
        fields: ['id', 'name', 'amount', 'category', 'date', 'vendor'],
        filter: expenseFilter,
        sort: ['-date'],
        limit: 500,
      }),
      paymentItems.list({
        filter: orgPaymentFilter(orgId),
        fields: ['id', 'amount', 'date_received', 'date_created', 'payment_method', 'status', 'invoice_id.id', 'invoice_id.invoice_code', 'invoice_id.client.name'],
        sort: ['-date_received'],
        limit: 500,
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

// ── Money In vs Out — monthly payments received vs expenses (this year) ──────
const cashflowMonthly = computed(() => {
  const now = new Date();
  const year = now.getFullYear();
  const monthsCount = now.getMonth() + 1; // Jan → current month
  const months = Array.from({ length: monthsCount }, (_, m) => ({
    key: `${year}-${String(m + 1).padStart(2, '0')}`,
    label: new Date(year, m, 1).toLocaleDateString('en-US', { month: 'short' }),
    in: 0,
    out: 0,
  }));
  const byKey = new Map(months.map((m) => [m.key, m]));

  for (const p of cashflowPayments.value) {
    const key = String(p.date_received || p.date_created || '').slice(0, 7);
    const bucket = byKey.get(key);
    if (bucket) bucket.in += Number(p.amount) || 0;
  }
  for (const e of cashflowExpenses.value) {
    const key = String(e.date || '').slice(0, 7);
    const bucket = byKey.get(key);
    if (bucket) bucket.out += Number(e.amount) || 0;
  }

  const maxVal = Math.max(1, ...months.map((m) => Math.max(m.in, m.out)));
  return months.map((m) => ({
    ...m,
    net: m.in - m.out,
    // Give any non-zero value a visible floor so tiny months still register.
    inPct: m.in > 0 ? Math.max((m.in / maxVal) * 100, 4) : 0,
    outPct: m.out > 0 ? Math.max((m.out / maxVal) * 100, 4) : 0,
  }));
});

const cashflowMonthlyTotals = computed(() => {
  const t = cashflowMonthly.value.reduce(
    (a, m) => ({ in: a.in + m.in, out: a.out + m.out }),
    { in: 0, out: 0 },
  );
  return { ...t, net: t.in - t.out };
});

const netTrendDots = computed(() => {
  const months = cashflowMonthly.value;
  const n = months.length;
  const maxVal = Math.max(1, ...months.map((m) => Math.max(m.in, m.out)));
  return months.map((m, i) => ({
    key: m.key,
    x: n === 1 ? 50 : ((i + 0.5) / n) * 100,
    y: Math.max(3, Math.min(97, 50 - (m.net / maxVal) * 50)),
    positive: m.net >= 0,
  }));
});
// Smooth (curved) path through the net dots — Catmull-Rom converted to cubic
// béziers. Coords are in the 0-100 viewBox; the non-uniform stretch keeps the
// curve smooth because bézier control points scale linearly.
const netTrendPath = computed(() => {
  const pts = netTrendDots.value;
  if (pts.length < 2) return pts.length === 1 ? `M ${pts[0]!.x} ${pts[0]!.y}` : '';
  let d = `M ${pts[0]!.x.toFixed(2)} ${pts[0]!.y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
});

// Drill a month → Payments floor filtered to that month.
function drillPaymentsMonth(m: { key: string }) {
  const [y, mo] = m.key.split('-').map(Number);
  moneyFrom.value = `${m.key}-01`;
  moneyTo.value = ymd(new Date(y!, mo!, 0)); // day 0 of next month = last day of this month
  paymentsView.value = 'list';
  floor.value = 'payments';
}

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
// LOCAL client filter for the invoices floor (own state; NOT the removed
// global chrome filter). Passed to getInvoices() so it wins over the legacy
// global selection.
const { clientId: invoicesClientId } = useClientFilter();

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
      clientId: invoicesClientId.value,
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

// Shared date-range filter applied client-side over the fetched invoices.
const filteredInvoices = computed(() => invoicesList.value.filter((inv: any) => inMoneyRange(inv.invoice_date)));

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

// payments_received has no reliable direct org column, so scope by the
// invoice's `bill_to` (the org that issued it) OR a direct `organization` tag.
// Without this, the list leaks every org's payments (e.g. EA-*/EAG-* invoices).
// Also exclude Stripe test-mode payments (livemode === false); legacy/manual
// rows have livemode null and are treated as live.
function orgPaymentFilter(orgId: string | null | undefined) {
  const notTest = { _or: [{ livemode: { _null: true } }, { livemode: { _eq: true } }] };
  const orgScope = orgId
    ? { _or: [{ invoice_id: { bill_to: { _eq: orgId } } }, { organization: { _eq: orgId } }] }
    : null;
  return orgScope ? { _and: [orgScope, notTest] } : notTest;
}

async function fetchPayments() {
  paymentsLoading.value = true;
  try {
    const paymentItems = useDirectusItems('payments_received');
    paymentsList.value = await paymentItems.list({
      filter: orgPaymentFilter(selectedOrg.value),
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

// ── Shared date-range filter — applies across the Money list floors ─────────
/** Local YYYY-MM-DD (avoids the UTC shift of toISOString). */
function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
/** First day of the calendar quarter containing `d`. */
function quarterStart(d: Date): Date {
  return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
}

// Default timeframe = year-to-date (QTD is available as a preset, but is often
// too sparse early in a quarter to be a useful landing view).
const _today = new Date();
const moneyFrom = ref<string>(ymd(new Date(_today.getFullYear(), 0, 1)));
const moneyTo = ref<string>(ymd(_today));

const moneyRangeActive = computed(() => !!moneyFrom.value || !!moneyTo.value);

type MoneyRangePreset = '30d' | 'qtd' | 'month' | 'ytd' | 'all';
function setMoneyRange(preset: MoneyRangePreset) {
  const now = new Date();
  if (preset === 'all') { moneyFrom.value = ''; moneyTo.value = ''; return; }
  moneyTo.value = ymd(now);
  if (preset === '30d') { const d = new Date(now); d.setDate(d.getDate() - 29); moneyFrom.value = ymd(d); }
  else if (preset === 'qtd') moneyFrom.value = ymd(quarterStart(now));
  else if (preset === 'month') moneyFrom.value = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
  else if (preset === 'ytd') moneyFrom.value = ymd(new Date(now.getFullYear(), 0, 1));
}

/** Generic date-in-range test on a YYYY-MM-DD(THH…) string. */
function inMoneyRange(dateStr: any): boolean {
  const from = moneyFrom.value;
  const to = moneyTo.value;
  if (!from && !to) return true;
  const key = typeof dateStr === 'string' ? dateStr.slice(0, 10) : '';
  if (!key) return false;
  if (from && key < from) return false;
  if (to && key > to) return false;
  return true;
}

const filteredPayments = computed(() =>
  paymentsList.value.filter((p) => inMoneyRange(p?.date_received || p?.date_created)),
);

const paymentsTotal = computed(() => filteredPayments.value.reduce((s, p) => s + (Number(p.amount) || 0), 0));

// ── Payments river mapping ─────────────────────────────────────────────────
// Each received payment becomes a leaf at date_received. Method drives hue:
// stripe=violet, manual=teal, plaid=blue, default=muted. Label = amount,
// sublabel = client / invoice. Hour position is synthesized from the payment
// id so multiple same-day payments lane out instead of stacking.
function paymentMethodHue(method: string): number {
	const m = (method || '').toLowerCase();
	if (m.includes('stripe') || m.includes('card')) return 270;
	if (m.includes('plaid') || m.includes('ach') || m.includes('bank')) return 210;
	if (m.includes('cash') || m.includes('check') || m.includes('manual')) return 150;
	return 200;
}
function paymentMethodSat(method: string): number {
	const m = (method || '').toLowerCase();
	if (m.includes('stripe') || m.includes('card')) return 65;
	return 60;
}
function paymentHashHour(id: string): number {
	let h = 0;
	for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
	return 4 + (h % 16);
}
const paymentsRiverItems = computed(() => {
	return filteredPayments.value
		.filter((p) => !!p?.date_received)
		.map((p) => {
			const base = new Date(p.date_received);
			base.setHours(paymentHashHour(String(p.id)), 0, 0, 0);
			const method = p.payment_method || p.method || '';
			const amount = Number(p.amount) || 0;
			const client = p.invoice_id?.client?.name || '';
			const code = p.invoice_id?.invoice_code || '';
			return {
				id: String(p.id),
				when: base.toISOString(),
				label: fmtMoney(amount),
				sublabel: [client, code].filter(Boolean).join(' · ') || (method || 'Payment'),
				hue: paymentMethodHue(method),
				sat: paymentMethodSat(method),
				icon: 'lucide:dollar-sign',
				_raw: p,
			};
		});
});
function onPaymentLeafSelect(item: { _raw: any }) {
	const id = item?._raw?.invoice_id?.id;
	if (id) openInvoice(id);
}

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
  let result = expenses.value.filter((e) => inMoneyRange(e.date));
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

// ── Lazy-load per floor ─────────────────────────────────────────────────────
const cashflowLoaded = ref(false);
const invoicesLoaded = ref(false);
const paymentsLoaded = ref(false);
const expensesLoaded = ref(false);

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
  },
  { immediate: true },
);

// Refetch on filter / org / client changes (only if floor already loaded)
watch([invoicesStatus, invoicesSort, selectedOrg, selectedClient, invoicesClientId], () => {
  if (invoicesLoaded.value) fetchInvoices();
});
watch([selectedOrg, selectedClient], () => {
  if (cashflowLoaded.value) fetchCashflow();
  if (paymentsLoaded.value) fetchPayments();
});

// ── Header action button ────────────────────────────────────────────────────
const headerAction = computed(() => {
  if (floor.value === 'invoices' && isAdmin.value) {
    return { label: 'New Invoice', icon: 'lucide:plus', onClick: () => (showInvoiceModal.value = true) };
  }
  if (floor.value === 'expenses') {
    return { label: 'Add Expense', icon: 'lucide:plus', onClick: openExpenseCreate };
  }
  if (floor.value === 'documents') {
    return documentsTab.value === 'contracts'
      ? { label: 'New Contract', icon: 'lucide:plus', onClick: () => (showContractModal.value = true) }
      : { label: 'New Proposal', icon: 'lucide:plus', onClick: () => (showProposalModal.value = true) };
  }
  return null;
});
</script>

<template>
  <div class="apps-page">
    <AppHeader title="Money" app-id="money">
      <template #actions>
        <Button
          v-if="floor === 'documents'"
          variant="outline"
          size="sm"
          @click="showDraftAiModal = true"
        >
          <Icon name="lucide:sparkles" class="w-4 h-4 mr-1" />
          Draft with AI
        </Button>
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

      <Transition :name="floorTransition" mode="out-in">
      <div :key="floor">
      <!-- ── Cash flow floor ──────────────────────────────────────────── -->
      <template v-if="floor === 'cashflow'">
        <div v-if="cashflowLoading && !cashflowInvoices.length" class="flex items-center justify-center py-24 gap-3">
          <Icon name="lucide:loader-2" class="w-6 h-6 text-muted-foreground animate-spin" />
          <span class="text-sm text-muted-foreground">Loading…</span>
        </div>

        <template v-else>
          <!-- KPI strip — tabular-nums on every big number so the cards
               don't visually jitter as values refresh. -->
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <div class="ios-card p-4">
              <p class="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Outstanding</p>
              <p class="text-2xl font-bold tabular-nums" :class="cashflowKpis.outstanding > 0 ? 'text-warning' : 'text-foreground'">
                {{ fmtCompact(cashflowKpis.outstanding) }}
              </p>
              <p class="text-[11px] text-muted-foreground mt-0.5">across all open invoices</p>
            </div>
            <div class="ios-card p-4">
              <p class="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Overdue</p>
              <p class="text-2xl font-bold tabular-nums" :class="cashflowKpis.overdueCount > 0 ? 'text-destructive' : 'text-foreground'">
                {{ cashflowKpis.overdueCount }}
              </p>
              <p class="text-[11px] text-muted-foreground mt-0.5">{{ cashflowKpis.overdueCount === 1 ? 'invoice' : 'invoices' }} past due</p>
            </div>
            <div class="ios-card p-4">
              <p class="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Billed this month</p>
              <p class="text-2xl font-bold tabular-nums text-foreground">{{ fmtCompact(cashflowKpis.billedThisMonth) }}</p>
              <p class="text-[11px] text-muted-foreground mt-0.5">{{ format(new Date(), 'MMMM yyyy') }}</p>
            </div>
            <div class="ios-card p-4">
              <p class="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Paid this month</p>
              <p class="text-2xl font-bold tabular-nums text-success">{{ fmtCompact(cashflowKpis.paidThisMonth) }}</p>
              <p class="text-[11px] text-muted-foreground mt-0.5">collected</p>
            </div>
          </div>

          <!-- Money In vs Out — diverging monthly bars (payments up, expenses down) -->
          <div class="ios-card p-5 mb-5">
            <div class="flex items-end justify-between mb-4 flex-wrap gap-3">
              <div>
                <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Money In vs Out</h3>
                <p class="text-[11px] text-muted-foreground/70 mt-0.5">Payments received vs expenses · {{ new Date().getFullYear() }}</p>
              </div>
              <div class="flex items-center gap-4 sm:gap-6">
                <div class="text-right">
                  <p class="text-[10px] uppercase tracking-wide text-muted-foreground">In</p>
                  <p class="text-sm font-bold tabular-nums text-success">{{ fmtCompact(cashflowMonthlyTotals.in) }}</p>
                </div>
                <div class="text-right">
                  <p class="text-[10px] uppercase tracking-wide text-muted-foreground">Out</p>
                  <p class="text-sm font-bold tabular-nums text-rose-500">{{ fmtCompact(cashflowMonthlyTotals.out) }}</p>
                </div>
                <div class="text-right">
                  <p class="text-[10px] uppercase tracking-wide text-muted-foreground">Net</p>
                  <p class="text-sm font-bold tabular-nums" :class="cashflowMonthlyTotals.net >= 0 ? 'text-success' : 'text-rose-500'">
                    {{ cashflowMonthlyTotals.net >= 0 ? '+' : '−' }}{{ fmtCompact(Math.abs(cashflowMonthlyTotals.net)) }}
                  </p>
                </div>
              </div>
            </div>

            <div class="relative">
              <!-- Net trend line overlaid on the bars (net-zero rides the centerline).
                   The line is SVG (preserveAspectRatio=none stretches it to fit); the
                   dots are HTML circles so the non-uniform scale can't squash them into
                   ellipses. -->
              <svg
                class="absolute inset-x-0 top-0 w-full h-[153px] pointer-events-none"
                preserveAspectRatio="none"
                viewBox="0 0 100 100"
                aria-hidden="true"
              >
                <path
                  :d="netTrendPath"
                  fill="none"
                  stroke="hsl(var(--foreground) / 0.35)"
                  stroke-width="1.5"
                  stroke-linejoin="round"
                  stroke-linecap="round"
                  vector-effect="non-scaling-stroke"
                />
              </svg>
              <div class="absolute inset-x-0 top-0 h-[153px] pointer-events-none">
                <span
                  v-for="d in netTrendDots"
                  :key="d.key"
                  class="absolute w-2 h-2 rounded-full ring-2 ring-card"
                  :class="d.positive ? 'bg-success' : 'bg-rose-400'"
                  :style="{ left: `${d.x}%`, top: `${d.y}%`, transform: 'translate(-50%, -50%)' }"
                />
              </div>

              <div class="flex items-stretch gap-1.5 sm:gap-2">
                <button
                  v-for="m in cashflowMonthly"
                  :key="m.key"
                  type="button"
                  class="flex-1 flex flex-col items-center group cursor-pointer rounded-lg hover:bg-muted/30 transition-colors py-1"
                  :title="`${m.label} — in ${fmtMoney(m.in)} · out ${fmtMoney(m.out)} · net ${fmtMoney(m.net)} · click to view payments`"
                  @click="drillPaymentsMonth(m)"
                >
                  <!-- payments in (grows up toward the centerline) -->
                  <div class="w-full flex items-end justify-center h-[72px]">
                    <div
                      class="w-full max-w-[26px] bg-success/70 group-hover:bg-success transition-all duration-300"
                      :style="{ height: `${m.inPct}%` }"
                    />
                  </div>
                  <div class="w-full h-px bg-border/70 my-1" />
                  <!-- expenses out (grows down from the centerline) -->
                  <div class="w-full flex items-start justify-center h-[72px]">
                    <div
                      class="w-full max-w-[26px] bg-rose-400/70 group-hover:bg-rose-400 transition-all duration-300"
                      :style="{ height: `${m.outPct}%` }"
                    />
                  </div>
                  <p class="text-[10px] text-muted-foreground mt-1.5 group-hover:text-foreground transition-colors">{{ m.label }}</p>
                </button>
              </div>
            </div>

            <div class="flex items-center gap-4 mt-4 text-[10px] text-muted-foreground">
              <span class="inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-success" /> Payments in</span>
              <span class="inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-rose-400" /> Expenses out</span>
              <span class="inline-flex items-center gap-1.5"><span class="w-3 h-px bg-foreground/40" /> Net</span>
              <span class="ml-auto hidden sm:inline text-muted-foreground/60">Click a month → payments</span>
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
                  @click="openInvoice(inv.id, $event)"
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
                @click="p.invoice_id?.id && openInvoice(p.invoice_id.id, $event)"
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

      <!-- ── Documents floor ──────────────────────────────────────────── -->
      <template v-else-if="floor === 'documents'">
        <MoneyDocumentsFloor
          ref="documentsFloorRef"
          :initial-tab="documentsTab"
          @tab-change="documentsTab = $event"
        />
      </template>

      <!-- ── Pipeline floor (proposal pursuit board) ──────────────────── -->
      <template v-else-if="floor === 'pipeline'">
        <MoneyProposalPipeline />
      </template>

      <!-- ── Invoices floor ───────────────────────────────────────────── -->
      <template v-else-if="floor === 'invoices'">
        <div class="flex flex-col gap-3 mb-5">
          <div class="flex gap-3 flex-wrap items-center">
            <input
              v-model="invoicesSearch"
              type="search"
              placeholder="Search invoices…"
              class="flex-1 min-w-48 rounded-full glass-field px-3 py-2 text-sm"
              @input="debouncedFetchInvoices"
            />
            <UTabs
              v-model="invoicesStatus"
              :items="invoiceStatusItems"
              class="w-fit"
            />
            <LayoutClientFilterSelect v-model="invoicesClientId" trigger-class="w-44" />
          </div>
          <AppsMoneyDateFilter
            v-if="invoicesList.length"
            v-model:from="moneyFrom"
            v-model:to="moneyTo"
            :count="filteredInvoices.length"
            :total="invoicesList.length"
            :active="moneyRangeActive"
            noun="invoices"
            @preset="setMoneyRange"
          />
        </div>

        <div v-if="invoicesLoading && !invoicesList.length" class="flex flex-col items-center justify-center py-24 gap-3">
          <span class="spinner-ios spinner-ios--xl" role="status" aria-label="Loading" />
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

        <div v-else-if="!filteredInvoices.length" class="flex flex-col items-center justify-center py-16 gap-3">
          <Icon name="lucide:calendar-search" class="w-10 h-10 text-muted-foreground/40" />
          <p class="text-sm text-muted-foreground">No invoices in this date range.</p>
          <button type="button" class="text-xs text-primary hover:underline" @click="setMoneyRange('all')">Clear filter</button>
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
                  <th class="text-center py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider sr-only">PDF</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="inv in filteredInvoices"
                  :key="inv.id"
                  class="border-b border-border/30 last:border-b-0 hover:bg-muted/20 cursor-pointer transition-colors"
                  :class="{ 'opacity-50': inv.status === 'paid' || inv.status === 'archived' }"
                  @click="openInvoice(inv.id, $event)"
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
                    <!-- Reconciliation markers: distinguish refunded/disputed from unpaid. -->
                    <span
                      v-if="Number((inv as any).refunded_total || 0) > 0"
                      class="ml-1 inline-flex items-center gap-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 text-[9px] font-medium align-middle"
                      :title="`${fmtMoney(Number((inv as any).refunded_total))} refunded/reversed`"
                    >
                      <Icon name="lucide:rotate-ccw" class="w-2.5 h-2.5" />
                      {{ Number((inv as any).refunded_total) >= Number(inv.total_amount || 0) ? 'Refunded' : fmtMoney(Number((inv as any).refunded_total)) }}
                    </span>
                    <span
                      v-if="(inv as any).disputed"
                      class="ml-1 inline-flex items-center gap-0.5 rounded-full bg-destructive/10 text-destructive px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider align-middle"
                      title="Payment disputed (chargeback)"
                    >
                      <Icon name="lucide:gavel" class="w-2.5 h-2.5" />
                      Disputed
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
                  <td class="py-3 px-2 text-center" @click.stop>
                    <button
                      class="inline-flex items-center justify-center w-7 h-7 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                      title="Open / download PDF in a new tab"
                      @click="openInvoicePdf(inv.id)"
                    >
                      <Icon name="lucide:file-down" class="w-4 h-4" />
                    </button>
                  </td>
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
          <span class="spinner-ios spinner-ios--xl" role="status" aria-label="Loading" />
          <p class="text-sm text-muted-foreground">Loading payments…</p>
        </div>

        <template v-else>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            <div class="ios-card p-4">
              <p class="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Total Received</p>
              <p class="text-2xl font-bold tabular-nums text-success">{{ fmtMoney(paymentsTotal) }}</p>
            </div>
            <div class="ios-card p-4">
              <p class="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Payments</p>
              <p class="text-2xl font-bold tabular-nums text-foreground">{{ filteredPayments.length }}</p>
            </div>
            <div class="ios-card p-4">
              <p class="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Latest</p>
              <p class="text-2xl font-bold text-foreground">
                {{ filteredPayments.length ? (getFriendlyDateThree(filteredPayments[0]?.date_received) || '—') : '—' }}
              </p>
            </div>
          </div>

          <!-- Shared date-range filter (left) + List/River view toggle (right) -->
          <div v-if="paymentsList.length" class="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <AppsMoneyDateFilter
              v-model:from="moneyFrom"
              v-model:to="moneyTo"
              :count="filteredPayments.length"
              :total="paymentsList.length"
              :active="moneyRangeActive"
              noun="payments"
              @preset="setMoneyRange"
            />
            <div class="inline-flex items-center gap-0.5 p-0.5 bg-muted/40 rounded-full text-[11px] font-medium shrink-0">
              <button type="button" class="px-3 py-1 rounded-full transition-colors" :class="paymentsView === 'list' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'" @click="paymentsView = 'list'">List</button>
              <button type="button" class="px-3 py-1 rounded-full transition-colors" :class="paymentsView === 'river' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'" @click="paymentsView = 'river'">River</button>
            </div>
          </div>

          <div v-if="!paymentsList.length" class="flex flex-col items-center justify-center py-24 gap-4">
            <Icon name="lucide:credit-card" class="w-12 h-12 text-muted-foreground/40" />
            <p class="text-sm text-muted-foreground">No payments received yet.</p>
          </div>

          <!-- Cash-inflow river — 30-day rhythm of payments received, leaves
               sized only by visibility (every drop matters). Method drives
               hue. Click a leaf → linked invoice slide-over. -->
          <div v-if="filteredPayments.length && paymentsView === 'river'" class="mb-5">
            <div class="flex items-center justify-between mb-3 flex-wrap gap-2 px-1">
              <div>
                <h3 class="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Cash inflow river
                </h3>
                <p class="text-[11px] text-muted-foreground/70 mt-0.5">
                  Last 30 days · click a leaf to open the invoice
                </p>
              </div>
              <div class="hidden sm:flex items-center gap-2 text-[10px] text-muted-foreground">
                <span class="inline-flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full" style="background: hsl(270 65% 55%)" />card</span>
                <span class="inline-flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full" style="background: hsl(210 60% 55%)" />ach</span>
                <span class="inline-flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full" style="background: hsl(150 60% 50%)" />manual</span>
              </div>
            </div>
            <RiverChart
              :items="paymentsRiverItems"
              :days-back="29"
              :days-forward="1"
              :hour-height="14"
              :hide-hours="true"
              :accent-hue="150"
              empty-title="Quiet stream."
              empty-subtitle="No payments received in the last 30 days."
              @select="onPaymentLeafSelect"
            />
          </div>

          <div
            v-if="paymentsList.length && !filteredPayments.length"
            class="flex flex-col items-center justify-center py-16 gap-3"
          >
            <Icon name="lucide:calendar-search" class="w-10 h-10 text-muted-foreground/40" />
            <p class="text-sm text-muted-foreground">No payments in this date range.</p>
            <button type="button" class="text-xs text-primary hover:underline" @click="setMoneyRange('all')">Clear filter</button>
          </div>

          <div v-if="filteredPayments.length && paymentsView === 'list'" class="ios-card overflow-hidden">
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
                  v-for="p in filteredPayments"
                  :key="p.id"
                  class="border-b border-border/30 last:border-b-0 hover:bg-muted/20 transition-colors"
                  :class="{ 'cursor-pointer': p.invoice_id?.id }"
                  @click="p.invoice_id?.id && openInvoice(p.invoice_id.id, $event)"
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

      <!-- ── Deposits floor (Stripe Connect — getting paid by clients) ─── -->
      <template v-else-if="floor === 'deposits'">
        <div v-if="stripeConnectLoading && !stripeConnect" class="flex items-center justify-center py-16 gap-3">
          <Icon name="lucide:loader-2" class="w-5 h-5 animate-spin text-muted-foreground" />
          <span class="text-sm text-muted-foreground">Loading deposits…</span>
        </div>

        <template v-else>
          <!-- Status / onboarding card -->
          <div class="ios-card p-5 mb-5">
            <div class="flex items-center justify-between gap-3">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon name="lucide:landmark" class="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p class="font-semibold text-foreground">Stripe deposits</p>
                  <p class="text-xs text-muted-foreground">Card &amp; ACH payments from clients, settled to your bank by Stripe</p>
                </div>
              </div>
              <span
                class="flex items-center gap-1.5 text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5 font-medium shrink-0"
                :class="connectStatusMeta.tone"
              >
                <span :class="['w-1.5 h-1.5 rounded-full', connectStatusMeta.dot]" />
                {{ connectStatusMeta.label }}
              </span>
            </div>

            <div v-if="stripeConnect?.status !== 'active'" class="mt-4 flex flex-col gap-2.5">
              <div class="flex items-center gap-3">
                <Button size="sm" :disabled="connectActing" @click="startStripeConnect">
                  {{ stripeConnect?.status === 'pending' || stripeConnect?.status === 'restricted' ? 'Continue setup' : 'Set up payments' }}
                </Button>
                <a href="https://dashboard.stripe.com/" target="_blank" rel="noopener" class="text-xs text-muted-foreground hover:text-foreground">
                  Stripe dashboard
                </a>
              </div>
              <!-- Link a pre-existing Stripe account (Standard Connect OAuth)
                   instead of creating a new Express account. Only offered before
                   an account has been started. -->
              <button
                v-if="stripeConnect?.status !== 'pending' && stripeConnect?.status !== 'restricted'"
                type="button"
                class="text-xs text-muted-foreground text-left w-fit disabled:opacity-50"
                :disabled="connectActing"
                @click="connectExistingAccount"
              >
                Already using Stripe? <span class="text-primary hover:underline">Link an existing account</span>
              </button>
            </div>
            <div v-else class="mt-4">
              <a
                href="https://dashboard.stripe.com/"
                target="_blank"
                rel="noopener"
                class="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                <Icon name="lucide:external-link" class="w-3.5 h-3.5" />
                Manage on Stripe
              </a>
            </div>
          </div>

          <!-- Native operational surface once the connected account is live -->
          <OrganizationBillingSurface
            v-if="stripeConnect?.status === 'active' && selectedOrg"
            :organization-id="selectedOrg"
          />
          <div v-else class="ios-card p-8 text-center">
            <Icon name="lucide:banknote" class="w-9 h-9 mx-auto mb-3 text-muted-foreground/30" />
            <p class="text-sm text-muted-foreground">
              Connect your Stripe account to see balance, transactions, and payouts here.
            </p>
          </div>
        </template>
      </template>

      <!-- ── Expenses floor ───────────────────────────────────────────── -->
      <template v-else-if="floor === 'expenses'">
        <div v-if="expensesLoading && !expenses.length" class="flex flex-col items-center justify-center py-24 gap-3">
          <span class="spinner-ios spinner-ios--xl" role="status" aria-label="Loading" />
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
              class="flex-1 min-w-[180px] rounded-full glass-field px-3 py-2 text-sm"
            />
            <select
              v-model="expensesCategory"
              class="rounded-md glass-field px-3 py-2 text-sm"
            >
              <option value="">All Categories</option>
              <option v-for="cat in EXPENSE_CATEGORIES" :key="cat.value" :value="cat.value">{{ cat.label }}</option>
            </select>
            <select
              v-model="expensesStatusFilter"
              class="rounded-md glass-field px-3 py-2 text-sm"
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

          <div class="mb-4">
            <AppsMoneyDateFilter
              v-model:from="moneyFrom"
              v-model:to="moneyTo"
              :count="filteredExpenses.length"
              :total="expenses.length"
              :active="moneyRangeActive"
              noun="expenses"
              @preset="setMoneyRange"
            />
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

      <!-- ── Insights floor ────────────────────────────────────────────── -->
      <template v-else-if="floor === 'insights'">
        <!-- Whole-studio money pipeline: value → paid → to-hunt across every
             client, with the org-wide hunt list. Leads the Insights floor. -->
        <div v-if="orgPipelineReady || orgPipelineLoading" class="grid gap-4 lg:grid-cols-2 mb-5">
          <MoneyPipeline
            :contract-value="orgContractValue"
            :paid="orgPaid"
            :current-outstanding="orgCurrentOutstanding"
            :overdue="orgOverdue"
          />
          <MoneyHuntList :rows="orgHuntRows" :loading="orgPipelineLoading" @open="openHuntInvoice" />
        </div>
        <MoneyInsightsView :snapshot="moneyInsightsSnapshot" :loading="moneyInsightsLoading" />
      </template>
      </div>
      </Transition>

      <!-- Documents create modals — owned at the page level so the header
           "+ New Proposal/Contract" CTA can trigger them. -->
      <ProposalsFormModal
        v-model="showProposalModal"
        @created="onDocumentCreated"
      />
      <ContractsFormModal
        v-model="showContractModal"
        @created="onDocumentCreated"
      />
      <DraftWithAiSheet
        v-model="showDraftAiModal"
        @created="onDocumentCreated"
      />
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
