<!--
  InvoiceWorkspace — shared body for the invoice detail surface.

  Consumed by both the `/invoices/detail/[id]` full-page route AND the
  `invoice` slide-over panel (`<InvoicePanel>`). Pass `:invoiceId`; the
  component fetches itself. Emits `@loaded` with the invoice record
  (panel uses it to populate the slide-over shell title).

  Dual-mode contract — canonical pattern for every workspace component
  that powers both a slide-over panel AND a `/<entity>/[id]` deep-link
  route (Invoice / Contract / Proposal / MailingList / Event / Meeting /
  Lead). The `:compact` prop is the single source of truth:

    - `compact = true` (hosted by a slide-over panel): hide chrome the
      shell already provides (back-link, floating AI sidebar), and
      delegate "back to list" / cross-noun pivots to the slide-over stack
      via `emit('back')` (the panel pops) or
      `useAppSlideOverStack().push(type, id)` (the panel pushes another).
    - `compact = false` (standalone deep-link route): own the chrome,
      and route-navigate to the apps-shell equivalent of the legacy
      page (`/apps/money` for invoices, never `/invoices`). Standalone
      mode is exclusively for emailed/shared deep-links — apps-shell
      users always enter through the slide-over.

  This contract is what allows us to delete every `// allow-legacy-link`
  comment in the workspace bodies: the standalone branch ALWAYS routes
  inside `/apps/*`, the compact branch ALWAYS stays in the stack.
-->
<script setup lang="ts">
import type { Invoice, PaymentsReceived } from '~~/shared/directus';
import { Button } from '~/components/ui/button';

const props = defineProps<{
  invoiceId: string;
  compact?: boolean;
}>();

const emit = defineEmits<{
  (e: 'loaded', invoice: Invoice): void;
  (e: 'back'): void;
}>();

const router = useRouter();
const { getInvoice } = useInvoices();
const { getUrl: getFileUrl } = useDirectusFiles();

const invoice = ref<Invoice | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const sendingEmail = ref(false);
// Inline edit mode — replaces the old modal-over-slide-over pattern.
// When true the workspace body swaps from the read-only detail view to
// the InvoiceForm component and the chrome shows Cancel + Save (+ Delete)
// instead of the Edit pencil + Record Payment quick actions.
const editMode = ref(false);
const editFormRef = ref<any>(null);
const editSaving = ref(false);
const editStatus = ref<string>('pending');
const invoiceStatuses = [
  { id: 'pending', name: 'Pending' },
  { id: 'processing', name: 'Processing' },
  { id: 'paid', name: 'Paid' },
  { id: 'archived', name: 'Archived' },
];
const showPaymentModal = ref(false);
const paymentMethodKey = ref<'check' | 'zelle' | 'venmo' | 'cash' | 'other' | 'edit'>('check');
const editingPayment = ref<PaymentsReceived | null>(null);
const toast = useToast();
const { updateInvoice, deleteInvoice } = useInvoices();
const { awardEvent } = useArcadeAwards();

const { getStatusBadgeClasses } = useStatusStyle();
const { setEntity, clearEntity, sidebarOpen, closeSidebar } = useEntityPageContext();

async function loadInvoice() {
  loading.value = true;
  error.value = null;
  try {
    invoice.value = await getInvoice(props.invoiceId);
    if (invoice.value) emit('loaded', invoice.value);
  } catch (e: any) {
    error.value = e?.message || 'Failed to load invoice';
  } finally {
    loading.value = false;
  }
}

function onInvoiceUpdated(updated: Invoice) {
  invoice.value = updated;
  emit('loaded', updated);
}

function onInvoiceDeleted() {
  if (props.compact) {
    emit('back');
  } else {
    router.push('/apps/money');
  }
}

// ── Inline edit mode ─────────────────────────────────────────────
// Replaces the previous "Edit → opens FormModal bottom sheet" pattern.
// The slide-over panel itself swaps to an editing view; chrome shows
// Cancel + Save + Delete. No more stacked modal over the slide-over.

function enterEditMode() {
  if (!invoice.value) return;
  editStatus.value = invoice.value.status || 'pending';
  editMode.value = true;
}

function onEditStatusChange(e: { newStatus: string }) {
  editStatus.value = e.newStatus;
}

function cancelEdit() {
  editMode.value = false;
}

function triggerEditSubmit() {
  editFormRef.value?.triggerSubmit?.();
}

async function onEditFormSave(payload: any) {
  if (!invoice.value?.id) return;
  editSaving.value = true;
  const prevStatus = invoice.value.status;
  try {
    const updated = await updateInvoice(invoice.value.id, { ...payload, status: editStatus.value });
    toast.add({ title: 'Invoice updated', color: 'green' });
    // Arcade reward — getting paid is a money moment.
    if (editStatus.value === 'paid' && prevStatus !== 'paid') {
      awardEvent('invoice_paid_on_time', { amount: Number(updated?.total_amount || invoice.value?.total_amount || 0) || undefined });
    }
    onInvoiceUpdated(updated);
    editMode.value = false;
  } catch (err: any) {
    toast.add({ title: 'Failed to save invoice', description: err?.message, color: 'red' });
  } finally {
    editSaving.value = false;
  }
}

async function handleInlineDelete() {
  if (!invoice.value?.id) return;
  if (!confirm('Delete this invoice? This cannot be undone.')) return;
  editSaving.value = true;
  try {
    await deleteInvoice(invoice.value.id);
    toast.add({ title: 'Invoice deleted', color: 'green' });
    onInvoiceDeleted();
  } catch (err: any) {
    toast.add({ title: 'Failed to delete invoice', description: err?.message, color: 'red' });
  } finally {
    editSaving.value = false;
  }
}

function getBillToName(inv: Invoice): string {
  if (!inv.bill_to) return '—';
  if (typeof inv.bill_to === 'string') return inv.bill_to;
  return inv.bill_to.name || '—';
}

function getClientName(inv: Invoice): string {
  if (!inv.client) return '—';
  if (typeof inv.client === 'string') return inv.client;
  return (inv.client as any).name || '—';
}

function getCheckImageUrl(inv: Invoice): string | null {
  const ci = inv.check_image;
  if (!ci) return null;
  const fileId = typeof ci === 'string' ? ci : (ci as any).id;
  if (!fileId) return null;
  return getFileUrl(fileId, { width: 400, format: 'webp' });
}

function getProjectTitles(inv: Invoice): string {
  if (!inv.projects?.length) return '—';
  const titles = (inv.projects as any[])
    .map((j: any) => {
      const p = j.projects_id;
      if (!p) return null;
      if (typeof p === 'string') return p;
      return p.title || null;
    })
    .filter(Boolean);
  return titles.length ? titles.join(', ') : '—';
}

function stripHtml(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').trim();
}

function formatLineItemAmount(li: any): string {
  return formatCurrency((li.quantity || 0) * (li.rate || 0));
}

const totalPaid = computed(() => {
  const list = (invoice.value?.payments as any[]) || [];
  return list
    .filter(p => p?.status === 'paid')
    .reduce((sum, p) => sum + Number(p?.amount || 0), 0);
});

const balanceDue = computed(() => {
  const total = Number(invoice.value?.total_amount || 0);
  return Math.max(0, Math.round((total - totalPaid.value) * 100) / 100);
});

const fullyPaid = computed(() => {
  const total = Number(invoice.value?.total_amount || 0);
  return total > 0 && totalPaid.value >= total;
});

function openPaymentModal(method: 'check' | 'zelle' | 'venmo' | 'cash' | 'other') {
  paymentMethodKey.value = method;
  editingPayment.value = null;
  showPaymentModal.value = true;
}

function openEditPayment(payment: any) {
  paymentMethodKey.value = 'edit';
  editingPayment.value = payment;
  showPaymentModal.value = true;
}

function isManualPayment(payment: any): boolean {
  return !payment?.payment_intent && !payment?.charge_id;
}

function getPaymentMethodIcon(method: string | null | undefined): string {
  const m = (method || '').toLowerCase();
  if (m === 'check') return 'lucide:square-check-big';
  if (m === 'zelle') return 'lucide:send';
  if (m === 'venmo') return 'lucide:smartphone';
  if (m === 'cash') return 'lucide:banknote';
  if (m === 'card' || m === 'us_bank_account' || m === 'cashapp') return 'lucide:credit-card';
  return 'lucide:wallet';
}

function getPaymentMethodLabel(method: string | null | undefined): string {
  const m = (method || '').toLowerCase();
  if (m === 'check') return 'Check';
  if (m === 'zelle') return 'Zelle';
  if (m === 'venmo') return 'Venmo';
  if (m === 'cash') return 'Cash';
  if (m === 'card') return 'Card';
  if (m === 'us_bank_account') return 'Bank';
  if (!m) return 'Payment';
  return method as string;
}

async function handleDeletePayment(payment: any) {
  if (!confirm(`Delete this $${payment.amount} payment? This cannot be undone.`)) return;
  try {
    await $fetch(`/api/invoices/${props.invoiceId}/payments/${payment.id}`, { method: 'DELETE' });
    toast.add({ title: 'Payment deleted', color: 'green' });
    await loadInvoice();
  } catch (e: any) {
    toast.add({
      title: 'Failed to delete payment',
      description: e?.data?.message || e?.message || 'Something went wrong',
      color: 'red',
    });
  }
}

async function onPaymentSaved() {
  await loadInvoice();
}

async function handleSendEmail() {
  if (!invoice.value) return;
  sendingEmail.value = true;
  try {
    await $fetch('/api/email/invoicenotice', {
      method: 'POST',
      body: invoice.value,
    });
    toast.add({ title: 'Invoice email sent', color: 'green' });
  } catch (e: any) {
    toast.add({
      title: 'Failed to send email',
      description: e?.message || 'Something went wrong',
      color: 'red',
    });
  } finally {
    sendingEmail.value = false;
  }
}

onMounted(loadInvoice);

// Refetch when the panel reuses this component for a different invoice
// (slide-over → push another invoice without unmount).
watch(() => props.invoiceId, () => {
  invoice.value = null;
  loadInvoice();
});

// Only wire the global entity-page-context when this workspace owns the
// page chrome — in compact (slide-over) mode the panel's own focus is
// the slide-over stack, not the underlying page.
if (!props.compact) {
  watch(invoice, (inv) => {
    if (inv) setEntity('invoice', String(inv.id), inv.invoice_code || 'Invoice');
  }, { immediate: true });
  onUnmounted(() => clearEntity());
}
</script>

<template>
  <div>
    <!-- Loading State -->
    <div v-if="loading" class="flex flex-col items-center justify-center py-24 gap-3">
      <span class="spinner-ios spinner-ios--xl" role="status" aria-label="Loading" />
      <p class="text-sm text-muted-foreground">Loading invoice...</p>
    </div>

    <!-- Error State (no data) -->
    <div v-else-if="error && !invoice" class="flex flex-col items-center justify-center py-24 gap-4">
      <Icon name="lucide:alert-circle" class="w-10 h-10 text-destructive" />
      <p class="text-sm text-destructive">{{ error }}</p>
      <div class="flex gap-2">
        <Button v-if="compact" variant="outline" size="sm" class="text-[10px] font-medium uppercase tracking-wide" @click="$emit('back')">
          <Icon name="lucide:chevron-left" class="w-4 h-4 mr-1" />
          Back
        </Button>
        <NuxtLink v-else to="/apps/money">
          <Button variant="outline" size="sm" class="text-[10px] font-medium uppercase tracking-wide">
            <Icon name="lucide:chevron-left" class="w-4 h-4 mr-1" />
            Back to Invoices
          </Button>
        </NuxtLink>
        <Button size="sm" @click="loadInvoice">
          <Icon name="lucide:refresh-cw" class="w-4 h-4 mr-1" />
          Retry
        </Button>
      </div>
    </div>

    <!-- Invoice Detail -->
    <template v-else-if="invoice">
      <!-- Back link (full-page mode only — slide-over shell owns its own back chrome) -->
      <NuxtLink
        v-if="!compact"
        to="/apps/money"
        class="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors mt-4 mb-2"
      >
        <Icon name="lucide:chevron-left" class="w-3 h-3" />
        Invoices
      </NuxtLink>

      <!-- Header — in compact mode the shell already shows title+subtitle,
           so collapse to just the status pill + action row.
           Edit mode swaps the right-side button cluster from
           [Ask Earnest][Edit] to [Cancel][Save] (Delete lives next to
           the title in compact). -->
      <div class="flex items-center justify-between mb-5" :class="{ 'mt-2': compact }">
        <div>
          <div class="flex items-center gap-2">
            <h1 v-if="!compact" class="text-base font-semibold text-foreground">{{ invoice.invoice_code || 'Invoice' }}</h1>
            <span
              v-if="invoice.status && !editMode"
              class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize"
              :class="getStatusBadgeClasses(invoice.status)"
            >
              {{ invoice.status }}
            </span>
            <span
              v-if="editMode"
              class="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
            >
              <Icon name="lucide:pencil" class="w-3 h-3" />
              Editing
            </span>
          </div>
          <p v-if="!compact" class="text-xs text-muted-foreground">{{ getClientName(invoice) }}</p>
        </div>
        <div class="flex items-center gap-1.5">
          <template v-if="!editMode">
            <button
              v-if="!compact"
              class="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-border text-xs font-medium text-primary hover:bg-primary/10 hover:border-primary/30 transition-colors"
              @click="sidebarOpen = true"
            >
              <EarnestIcon class="w-3.5 h-3.5" />
              <span class="hidden sm:inline">Ask Earnest</span>
            </button>
            <button
              class="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors"
              @click="enterEditMode"
            >
              <Icon name="lucide:pencil" class="w-3.5 h-3.5" />
              <span class="hidden sm:inline">Edit</span>
            </button>
          </template>
          <template v-else>
            <button
              class="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50"
              :disabled="editSaving"
              @click="cancelEdit"
            >
              Cancel
            </button>
            <button
              class="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              :disabled="editSaving || !editFormRef?.hasLineItems"
              @click="triggerEditSubmit"
            >
              <Icon :name="editSaving ? 'lucide:loader-2' : 'lucide:save'" class="w-3.5 h-3.5" :class="{ 'animate-spin': editSaving }" />
              <span class="hidden sm:inline">{{ editSaving ? 'Saving…' : 'Save' }}</span>
            </button>
          </template>
        </div>
      </div>

      <!-- ── Inline Edit Form ────────────────────────────────────────
           When editMode is true the entire read-only body is replaced
           by the same form the FormModal used to host. This keeps a
           single editing surface — no stacked modal, no separate route. -->
      <div v-if="editMode" class="space-y-4 pb-6">
        <FormStatusTimeline
          v-if="invoice"
          :currentStatus="editStatus"
          :statuses="invoiceStatuses"
          collection="invoices"
          :itemId="invoice.id"
          class="mb-4"
          @status-change="onEditStatusChange"
        />
        <InvoicesInvoiceForm
          ref="editFormRef"
          :invoice="invoice"
          :saving="editSaving"
          v-model:status="editStatus"
          @save="onEditFormSave"
        />
        <div class="flex items-center justify-between pt-4 border-t border-border/40">
          <button
            class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-destructive border border-destructive/30 hover:bg-destructive/10 text-xs font-medium transition-colors disabled:opacity-50"
            :disabled="editSaving"
            @click="handleInlineDelete"
          >
            <Icon name="lucide:trash-2" class="w-3.5 h-3.5" />
            Delete
          </button>
          <div class="flex items-center gap-2">
            <button
              class="inline-flex items-center gap-1 h-8 px-3 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50"
              :disabled="editSaving"
              @click="cancelEdit"
            >
              Cancel
            </button>
            <button
              class="inline-flex items-center gap-1.5 h-8 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              :disabled="editSaving || !editFormRef?.hasLineItems"
              @click="triggerEditSubmit"
            >
              <Icon :name="editSaving ? 'lucide:loader-2' : 'lucide:save'" class="w-3.5 h-3.5" :class="{ 'animate-spin': editSaving }" />
              {{ editSaving ? 'Saving…' : 'Save changes' }}
            </button>
          </div>
        </div>
      </div>

      <!-- ── Read-only view (default) ──────────────────────────────── -->
      <div v-if="!editMode" class="contents">

      <!-- Record Payment quick-actions -->
      <div
        v-if="!fullyPaid"
        class="flex flex-wrap items-center gap-1.5 mb-5"
      >
        <span class="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">Record payment:</span>
        <button
          class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-card text-xs font-medium hover:bg-success/10 hover:border-success/30 dark:hover:bg-success/20 transition-colors"
          @click="openPaymentModal('check')"
        >
          <Icon name="lucide:square-check-big" class="w-3.5 h-3.5 text-success" />
          Check
        </button>
        <button
          class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-card text-xs font-medium hover:bg-violet-50 hover:border-violet-300 dark:hover:bg-violet-950/20 transition-colors"
          @click="openPaymentModal('zelle')"
        >
          <Icon name="lucide:send" class="w-3.5 h-3.5 text-violet-600" />
          Zelle
        </button>
        <button
          class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-card text-xs font-medium hover:bg-info/10 hover:border-info/30 dark:hover:bg-info/20 transition-colors"
          @click="openPaymentModal('venmo')"
        >
          <Icon name="lucide:smartphone" class="w-3.5 h-3.5 text-info" />
          Venmo
        </button>
        <button
          class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-card text-xs font-medium hover:bg-warning/10 hover:border-warning/30 dark:hover:bg-warning/20 transition-colors"
          @click="openPaymentModal('cash')"
        >
          <Icon name="lucide:banknote" class="w-3.5 h-3.5 text-warning" />
          Cash
        </button>
        <button
          class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-card text-xs font-medium hover:bg-muted transition-colors"
          @click="openPaymentModal('other')"
        >
          <Icon name="lucide:more-horizontal" class="w-3.5 h-3.5 text-muted-foreground" />
          Other
        </button>
        <span v-if="balanceDue > 0 && totalPaid > 0" class="ml-auto text-xs text-muted-foreground">
          Balance due: <span class="font-semibold text-foreground tabular-nums">{{ formatCurrency(balanceDue) }}</span>
        </span>
      </div>
      <div
        v-else
        class="flex items-center gap-2 mb-5 px-3 py-2 rounded-lg bg-success/10 dark:bg-success/20 border border-success/30 dark:border-success text-xs text-success dark:text-success"
      >
        <Icon name="lucide:check-circle-2" class="w-4 h-4" />
        Invoice fully paid ({{ formatCurrency(totalPaid) }} of {{ formatCurrency(invoice.total_amount || 0) }})
      </div>

      <!-- Inline error banner -->
      <div
        v-if="error"
        class="mb-4 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
      >
        <Icon name="lucide:alert-circle" class="w-4 h-4 shrink-0" />
        {{ error }}
        <button class="ml-auto text-destructive/60 hover:text-destructive" @click="error = null">
          <Icon name="lucide:x" class="w-4 h-4" />
        </button>
      </div>

      <!-- AI Notices -->
      <ClientOnly>
        <AIProactiveNotices v-if="invoice?.id" entity-type="invoice" :entity-id="String(invoice.id)" />
      </ClientOnly>

      <div class="grid grid-cols-1 gap-6" :class="{ 'lg:grid-cols-3': !compact }">
        <!-- Main: Details -->
        <div class="space-y-4" :class="{ 'lg:col-span-2': !compact }">
          <!-- Billing + Dates + Misc -->
          <div class="ios-card p-6 space-y-4">
            <h2 class="text-[10px] uppercase tracking-wider text-muted-foreground">Invoice Details</h2>

            <div class="grid grid-cols-2 gap-4 text-sm">
              <div class="space-y-1">
                <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Client</p>
                <p class="font-medium">{{ getClientName(invoice) }}</p>
              </div>
              <div class="space-y-1">
                <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Projects</p>
                <p>{{ getProjectTitles(invoice) }}</p>
              </div>
              <div class="space-y-1">
                <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Invoice Date</p>
                <p>{{ invoice.invoice_date ? getFriendlyDateThree(invoice.invoice_date) : '—' }}</p>
              </div>
              <div class="space-y-1">
                <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Due Date</p>
                <p>{{ invoice.due_date ? getFriendlyDateThree(invoice.due_date) : '—' }}</p>
              </div>
              <div v-if="invoice.melio" class="space-y-1 col-span-2">
                <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Melio Link</p>
                <a :href="invoice.melio" target="_blank" class="text-primary hover:underline break-all text-xs">{{ invoice.melio }}</a>
              </div>
            </div>

            <!-- Billing contact -->
            <div v-if="invoice.billing_name || invoice.billing_email || invoice.billing_address" class="pt-3 border-t border-border/30 space-y-1">
              <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Billing Contact</p>
              <p v-if="invoice.billing_name" class="text-sm font-medium">{{ invoice.billing_name }}</p>
              <p v-if="invoice.billing_email" class="text-xs">{{ invoice.billing_email }}</p>
              <p v-if="invoice.billing_address" class="text-xs text-muted-foreground">{{ invoice.billing_address }}</p>
            </div>

            <!-- CC Emails -->
            <div v-if="Array.isArray(invoice.emails) && invoice.emails.length" class="pt-3 border-t border-border/30 space-y-1.5">
              <p class="text-[10px] uppercase tracking-wider text-muted-foreground">CC</p>
              <div class="flex flex-wrap gap-1.5">
                <span
                  v-for="email in invoice.emails"
                  :key="email"
                  class="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px]"
                >
                  {{ email }}
                </span>
              </div>
            </div>

            <!-- Notes -->
            <div v-if="invoice.note" class="pt-3 border-t border-border/30 space-y-1">
              <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Note</p>
              <p class="text-sm whitespace-pre-wrap">{{ invoice.note }}</p>
            </div>
            <div v-if="invoice.memo" class="pt-3 border-t border-border/30 space-y-1">
              <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Internal Memo</p>
              <p class="text-sm whitespace-pre-wrap text-muted-foreground">{{ invoice.memo }}</p>
            </div>
          </div>

          <!-- Line Items -->
          <div class="ios-card p-6">
            <h2 class="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Line Items</h2>

            <div v-if="(invoice.line_items as any[])?.length" class="space-y-2">
              <div class="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-1 pb-2 border-b border-border/30">
                <span class="col-span-3">Product</span>
                <span class="col-span-4">Description</span>
                <span class="col-span-1 text-right">Qty</span>
                <span class="col-span-2 text-right">Rate</span>
                <span class="col-span-2 text-right">Amount</span>
              </div>
              <div
                v-for="li in (invoice.line_items as any[])"
                :key="li.id"
                class="grid grid-cols-12 gap-2 text-sm px-1 py-1.5"
              >
                <span class="col-span-3 truncate">{{ typeof li.product === 'object' ? (li.product?.name || '—') : '—' }}</span>
                <span class="col-span-4 truncate text-muted-foreground">{{ stripHtml(li.description || '') || '—' }}</span>
                <span class="col-span-1 text-right tabular-nums">{{ li.quantity || 0 }}</span>
                <span class="col-span-2 text-right tabular-nums">{{ formatCurrency(li.rate || 0) }}</span>
                <span class="col-span-2 text-right font-medium tabular-nums">{{ formatLineItemAmount(li) }}</span>
              </div>
              <div class="flex justify-end pt-3 border-t border-border">
                <div class="text-sm font-semibold">
                  Total: <span class="ml-2">{{ formatCurrency(invoice.total_amount || 0) }}</span>
                </div>
              </div>
            </div>
            <p v-else class="text-sm text-muted-foreground italic">No line items.</p>
          </div>
        </div>

        <!-- Sidebar -->
        <div class="space-y-4">
          <!-- Summary -->
          <div class="ios-card p-5">
            <h3 class="text-[10px] uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <Icon name="lucide:info" class="w-3.5 h-3.5" />
              Summary
            </h3>
            <div class="space-y-2.5 text-sm">
              <div class="flex justify-between">
                <span class="text-muted-foreground">Total</span>
                <span class="font-semibold">{{ formatCurrency(invoice.total_amount || 0) }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">Due</span>
                <span>{{ invoice.due_date ? getFriendlyDateThree(invoice.due_date) : '—' }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">Created</span>
                <span>{{ invoice.date_created ? new Date(invoice.date_created).toLocaleDateString() : '—' }}</span>
              </div>
              <div v-if="getBillToName(invoice) !== '—'" class="flex justify-between">
                <span class="text-muted-foreground">Org</span>
                <span class="text-xs text-muted-foreground">{{ getBillToName(invoice) }}</span>
              </div>
              <div v-if="invoice.date_mailed" class="flex justify-between">
                <span class="text-muted-foreground">Mailed</span>
                <span>{{ getFriendlyDateThree(invoice.date_mailed) }}</span>
              </div>
            </div>
            <!-- Check Image -->
            <div v-if="getCheckImageUrl(invoice)" class="mt-3 pt-3 border-t border-border/30">
              <p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Check Image</p>
              <a :href="getCheckImageUrl(invoice)!" target="_blank">
                <img
                  :src="getCheckImageUrl(invoice)!"
                  alt="Check"
                  class="w-full rounded-lg border object-cover max-h-40"
                />
              </a>
            </div>
          </div>

          <!-- Actions -->
          <div class="ios-card p-5">
            <h3 class="text-[10px] uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <Icon name="lucide:link" class="w-3.5 h-3.5" />
              Actions
            </h3>
            <div class="flex flex-col gap-2">
              <Button
                variant="outline"
                size="sm"
                class="w-full justify-start"
                :disabled="sendingEmail"
                @click="handleSendEmail"
              >
                <Icon
                  :name="sendingEmail ? 'lucide:loader-2' : 'lucide:send'"
                  class="w-4 h-4 mr-2"
                  :class="{ 'animate-spin': sendingEmail }"
                />
                {{ sendingEmail ? 'Sending...' : 'Send Invoice Email' }}
              </Button>
              <NuxtLink :to="`/invoices/${invoice.id}`" target="_blank" class="block">
                <Button variant="outline" size="sm" class="w-full justify-start">
                  <Icon name="lucide:eye" class="w-4 h-4 mr-2" />
                  Preview
                </Button>
              </NuxtLink>
            </div>
          </div>

          <!-- Payments -->
          <div v-if="(invoice.payments as any[])?.length" class="ios-card p-5">
            <h3 class="text-[10px] uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <Icon name="lucide:banknote" class="w-3.5 h-3.5" />
              Payments
              <span class="text-xs text-muted-foreground/60 ml-auto">
                {{ formatCurrency(totalPaid) }} of {{ formatCurrency(invoice.total_amount || 0) }}
              </span>
            </h3>
            <div class="space-y-2">
              <div
                v-for="payment in (invoice.payments as any[])"
                :key="payment.id"
                class="group p-3 bg-muted/30 rounded-xl text-sm"
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1.5">
                      <Icon :name="getPaymentMethodIcon(payment.payment_method)" class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span class="font-medium tabular-nums">{{ formatCurrency(Number(payment.amount || 0)) }}</span>
                      <span class="text-[10px] uppercase tracking-wider text-muted-foreground">{{ getPaymentMethodLabel(payment.payment_method) }}</span>
                      <span
                        v-if="!isManualPayment(payment)"
                        class="inline-flex items-center rounded-full bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider"
                      >
                        Stripe
                      </span>
                    </div>
                    <p class="text-xs text-muted-foreground mt-0.5">
                      {{ payment.date_received ? new Date(payment.date_received).toLocaleDateString() : 'Pending' }}
                      <template v-if="payment.reference">· #{{ payment.reference }}</template>
                    </p>
                    <p v-if="payment.note" class="text-xs text-muted-foreground/80 italic mt-1">{{ payment.note }}</p>
                  </div>
                  <div class="flex items-center gap-1 shrink-0">
                    <span
                      class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize"
                      :class="getStatusBadgeClasses(payment.status)"
                    >
                      {{ payment.status }}
                    </span>
                    <button
                      v-if="isManualPayment(payment)"
                      class="p-1 rounded hover:bg-muted text-muted-foreground/60 hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Edit payment"
                      @click="openEditPayment(payment)"
                    >
                      <Icon name="lucide:pencil" class="w-3 h-3" />
                    </button>
                    <button
                      v-if="isManualPayment(payment)"
                      class="p-1 rounded hover:bg-destructive/10 text-muted-foreground/60 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete payment"
                      @click="handleDeletePayment(payment)"
                    >
                      <Icon name="lucide:trash-2" class="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      </div>
      <!-- /read-only view -->

      <!-- Record Payment Modal — kept for record-payment quick actions
           (Check / Zelle / Venmo / Cash / Other + Edit existing) since
           those still benefit from a focused commit step. Editing the
           invoice itself is now inline (above). -->
      <InvoicesRecordPaymentModal
        v-model="showPaymentModal"
        :invoice="invoice"
        :method="paymentMethodKey"
        :payment="editingPayment"
        @saved="onPaymentSaved"
      />
    </template>

    <!-- Contextual AI Sidebar — full-page mode only. The slide-over panel
         lives inside a transformed container so this fixed overlay would
         not render at viewport level there. -->
  </div>
</template>
