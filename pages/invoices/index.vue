<script setup lang="ts">
import type { Invoice } from '~/types/directus';
import { Button } from '~/components/ui/button';
import { useDebounceFn } from '@vueuse/core';
import { getFriendlyDateThree } from '~/utils/dates';

definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Invoices | Earnest' });

const router = useRouter();
const { getInvoices, createInvoice, updateInvoice, deleteInvoice } = useInvoices();
const { selectedClient } = useClients();
const { canAccess } = useOrgRole();
const isAdmin = computed(() => canAccess('invoices'));

const allInvoices = ref<Invoice[]>([]);
const total = ref(0);
const loading = ref(true);
const search = ref('');
const showCreateModal = ref(false);
const creating = ref(false);
const statusFilter = ref('all');
const showPaid = ref(false);
const viewMode = ref<'cards' | 'table'>('table');
const deleteTarget = ref<Invoice | null>(null);

const sortBy = ref('-due_date');
const sortOptions = [
  { label: 'Due Date (Newest)', value: '-due_date' },
  { label: 'Due Date (Oldest)', value: 'due_date' },
  { label: 'Amount (High\u2192Low)', value: '-total_amount' },
  { label: 'Amount (Low\u2192High)', value: 'total_amount' },
  { label: 'Recently Created', value: '-date_created' },
  { label: 'Invoice Code', value: 'invoice_code' },
];

const statusOptions = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Processing', value: 'processing' },
  { label: 'Paid', value: 'paid' },
  { label: 'Archived', value: 'archived' },
];

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-500/15 text-yellow-400',
  processing: 'bg-blue-500/15 text-blue-400',
  paid: 'bg-emerald-500/15 text-emerald-400',
  archived: 'bg-neutral-500/15 text-neutral-400',
};

// Active invoices (pending + processing)
const activeInvoices = computed(() =>
  allInvoices.value.filter(inv => inv.status === 'pending' || inv.status === 'processing')
);

// Paid + archived invoices
const completedInvoices = computed(() =>
  allInvoices.value.filter(inv => inv.status === 'paid' || inv.status === 'archived')
);

// Stats
const totalBilled = computed(() =>
  allInvoices.value.reduce((sum, inv) => sum + (Number(inv.total_amount) || 0), 0)
);

const totalUnpaid = computed(() =>
  allInvoices.value
    .filter(inv => inv.status !== 'paid')
    .reduce((sum, inv) => sum + (Number(inv.total_amount) || 0), 0)
);

function getDueDateUrgency(inv: Invoice): 'past' | 'urgent' | 'normal' {
  if (!inv.due_date || inv.status === 'paid' || inv.status === 'archived') return 'normal';
  const due = new Date(inv.due_date);
  const now = new Date();
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'past';
  if (diffDays <= 7) return 'urgent';
  return 'normal';
}

const dueDateColors: Record<string, string> = {
  past: 'text-red-400',
  urgent: 'text-amber-400',
  normal: 'text-muted-foreground',
};

const fetchData = async () => {
  loading.value = true;
  try {
    const result = await getInvoices({
      search: search.value || undefined,
      status: statusFilter.value !== 'all' ? statusFilter.value : undefined,
      sort: [sortBy.value],
      limit: 200,
    });
    allInvoices.value = result.data;
    total.value = result.total;
  } catch (err) {
    console.error('Failed to fetch invoices:', err);
  } finally {
    loading.value = false;
  }
};

const debouncedFetch = useDebounceFn(fetchData, 300);

function viewInvoice(invoice: Invoice) {
  router.push(`/invoices/detail/${invoice.id}`);
}

async function handleCreate(data: any) {
  creating.value = true;
  try {
    await createInvoice(data);
    showCreateModal.value = false;
    await fetchData();
  } catch (err) {
    console.error('Failed to create invoice:', err);
  } finally {
    creating.value = false;
  }
}

function formatAmount(value: number | null | undefined): string {
  return formatCurrency(Number(value) || 0);
}

function getDisplayName(inv: Invoice): string {
  // Prefer client name (the actual billing target), fall back to bill_to org
  const client = inv.client;
  if (client && typeof client === 'object' && (client as any).name) {
    return (client as any).name;
  }
  if (!inv.bill_to) return '\u2014';
  if (typeof inv.bill_to === 'string') return inv.bill_to;
  return (inv.bill_to as any).name || '\u2014';
}

async function confirmDelete() {
  if (!deleteTarget.value) return;
  try {
    await deleteInvoice(deleteTarget.value.id);
    allInvoices.value = allInvoices.value.filter(i => i.id !== deleteTarget.value!.id);
    total.value = Math.max(0, total.value - 1);
  } catch (err) {
    console.error('Failed to delete invoice:', err);
  } finally {
    deleteTarget.value = null;
  }
}

async function updateStatus(inv: Invoice, newStatus: string) {
  try {
    await updateInvoice(inv.id, { status: newStatus });
    inv.status = newStatus;
  } catch (err) {
    console.error('Failed to update status:', err);
  }
}

function getLineItemCount(inv: Invoice): number {
  if (!inv.line_items) return 0;
  return Array.isArray(inv.line_items) ? inv.line_items.length : 0;
}

onMounted(fetchData);

watch(() => selectedClient.value, debouncedFetch);
</script>

<template>
  <div class="p-6 max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-xl font-semibold">Invoices</h1>
        <p class="text-sm text-muted-foreground">
          {{ total }} total<span v-if="activeInvoices.length">, {{ activeInvoices.length }} active</span>
        </p>
      </div>
      <div class="flex items-center gap-2">
        <LayoutShareButton title="Invoices | Earnest" />
        <Button v-if="isAdmin" size="sm" @click="showCreateModal = true">
          <Icon name="lucide:plus" class="w-4 h-4 mr-1" />
          New Invoice
        </Button>
      </div>
    </div>

    <!-- Stats -->
    <div class="flex gap-4 mb-6">
      <div class="ios-card px-4 py-3 flex-1">
        <p class="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Total Billed</p>
        <p class="text-lg font-semibold">{{ formatAmount(totalBilled) }}</p>
      </div>
      <div class="ios-card px-4 py-3 flex-1">
        <p class="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Total Unpaid</p>
        <p class="text-lg font-semibold" :class="totalUnpaid > 0 ? 'text-amber-400' : ''">{{ formatAmount(totalUnpaid) }}</p>
      </div>
    </div>

    <!-- Filters -->
    <div class="flex gap-3 mb-6 flex-wrap items-center">
      <input
        v-model="search"
        type="search"
        placeholder="Search invoices..."
        class="flex-1 min-w-48 rounded-md border bg-background px-3 py-2 text-sm"
        @input="debouncedFetch"
      />
      <select
        v-model="statusFilter"
        @change="fetchData"
        class="rounded-md border bg-background px-3 py-2 text-sm w-36"
      >
        <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
      </select>
      <select
        v-model="sortBy"
        @change="fetchData"
        class="rounded-md border bg-background px-3 py-2 text-sm w-48"
      >
        <option v-for="opt in sortOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
      </select>
      <!-- View Toggle -->
      <div class="flex gap-0.5 p-0.5 bg-muted/40 rounded-lg">
        <button
          @click="viewMode = 'cards'"
          class="p-1.5 rounded-md transition-all"
          :class="viewMode === 'cards' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'"
        >
          <Icon name="lucide:layout-grid" class="w-4 h-4" />
        </button>
        <button
          @click="viewMode = 'table'"
          class="p-1.5 rounded-md transition-all"
          :class="viewMode === 'table' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'"
        >
          <Icon name="lucide:list" class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="flex flex-col items-center justify-center py-24 gap-3">
      <Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
      <p class="text-sm text-muted-foreground">Loading invoices...</p>
    </div>

    <!-- Empty State -->
    <div v-else-if="!allInvoices.length" class="flex flex-col items-center justify-center py-24 gap-4">
      <Icon name="lucide:file-text" class="w-12 h-12 text-muted-foreground/40" />
      <div class="text-center">
        <p class="text-sm font-medium text-muted-foreground">No invoices found</p>
        <p class="text-xs text-muted-foreground/70 mt-1">
          {{ search ? 'Try adjusting your search.' : 'Create your first invoice to get started.' }}
        </p>
      </div>
      <Button v-if="!search && isAdmin" size="sm" @click="showCreateModal = true">
        <Icon name="lucide:plus" class="w-4 h-4 mr-1" />
        New Invoice
      </Button>
    </div>

    <template v-else>
      <!-- TABLE VIEW -->
      <div v-if="viewMode === 'table'" class="ios-card overflow-hidden">
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
                <th class="text-right py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider w-24"></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="inv in allInvoices"
                :key="inv.id"
                class="border-b border-border/30 last:border-b-0 hover:bg-muted/20 cursor-pointer transition-colors"
                :class="{ 'opacity-50': inv.status === 'paid' || inv.status === 'archived' }"
                @click="viewInvoice(inv)"
              >
                <td class="py-3 px-4">
                  <span class="font-medium">{{ inv.invoice_code || 'No Code' }}</span>
                </td>
                <td class="py-3 px-4 text-muted-foreground">{{ getDisplayName(inv) }}</td>
                <td class="py-3 px-4" @click.stop>
                  <select
                    v-if="isAdmin"
                    :value="inv.status"
                    @change="updateStatus(inv, ($event.target as HTMLSelectElement).value)"
                    class="appearance-none rounded-full px-2 py-0.5 text-[10px] font-medium capitalize border-0 cursor-pointer pr-5 bg-no-repeat bg-[right_4px_center] bg-[length:10px]"
                    :class="statusColors[inv.status || 'pending']"
                    :style="{ backgroundImage: `url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22 fill=%22currentColor%22><path fill-rule=%22evenodd%22 d=%22M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z%22 clip-rule=%22evenodd%22/></svg>')` }"
                  >
                    <option v-for="s in statusOptions.slice(1)" :key="s.value" :value="s.value">{{ s.label }}</option>
                  </select>
                  <span
                    v-else
                    class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize"
                    :class="statusColors[inv.status || 'pending']"
                  >
                    {{ inv.status }}
                  </span>
                </td>
                <td class="py-3 px-4 text-right font-medium tabular-nums">{{ formatAmount(inv.total_amount) }}</td>
                <td class="py-3 px-4">
                  <span :class="dueDateColors[getDueDateUrgency(inv)]">
                    {{ inv.due_date ? getFriendlyDateThree(inv.due_date) : '\u2014' }}
                  </span>
                  <span
                    v-if="getDueDateUrgency(inv) === 'past'"
                    class="text-[9px] uppercase font-semibold text-red-400 ml-1"
                  >
                    Past due
                  </span>
                </td>
                <td class="py-3 px-4 text-center text-muted-foreground">{{ getLineItemCount(inv) }}</td>
                <td class="py-3 px-4 text-right" @click.stop>
                  <div class="flex items-center justify-end gap-1">
                    <NuxtLink v-if="inv.status === 'pending'" :to="`/invoices/${inv.id}`">
                      <Button variant="outline" size="sm" class="h-7 text-xs">Pay</Button>
                    </NuxtLink>
                    <NuxtLink :to="`/invoices/detail/${inv.id}`">
                      <Button variant="ghost" size="sm" class="h-7 text-xs">Edit</Button>
                    </NuxtLink>
                    <button
                      v-if="isAdmin"
                      class="p-1.5 rounded-md text-muted-foreground/50 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Delete invoice"
                      @click="deleteTarget = inv"
                    >
                      <Icon name="lucide:trash-2" class="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- CARD VIEW -->
      <!-- Active Invoices -->
      <div v-else-if="activeInvoices.length" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="inv in activeInvoices"
          :key="inv.id"
          class="ios-card p-5 cursor-pointer hover:ring-1 hover:ring-white/10 transition-all"
          @click="viewInvoice(inv)"
        >
          <div class="flex items-start justify-between mb-3">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 mb-1">
                <h3 class="text-sm font-medium truncate">{{ inv.invoice_code || 'No Code' }}</h3>
                <span
                  class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize shrink-0"
                  :class="statusColors[inv.status || 'pending']"
                >
                  {{ inv.status }}
                </span>
              </div>
              <p class="text-xs text-muted-foreground truncate">{{ getDisplayName(inv) }}</p>
            </div>
            <p class="text-sm font-semibold ml-3 shrink-0">{{ formatAmount(inv.total_amount) }}</p>
          </div>

          <div class="space-y-1.5 text-xs text-muted-foreground">
            <div class="flex items-center gap-1.5">
              <Icon name="lucide:calendar" class="w-3.5 h-3.5 shrink-0" />
              <span :class="dueDateColors[getDueDateUrgency(inv)]">
                Due {{ inv.due_date ? getFriendlyDateThree(inv.due_date) : '\u2014' }}
              </span>
              <span
                v-if="getDueDateUrgency(inv) === 'past'"
                class="text-[9px] uppercase font-semibold text-red-400 ml-1"
              >
                Past due
              </span>
            </div>
            <div class="flex items-center gap-1.5">
              <Icon name="lucide:list" class="w-3.5 h-3.5 shrink-0" />
              <span>{{ getLineItemCount(inv) }} line item{{ getLineItemCount(inv) !== 1 ? 's' : '' }}</span>
            </div>
          </div>

          <!-- Actions row -->
          <div class="flex items-center gap-2 mt-3 pt-3 border-t border-border/30">
            <NuxtLink
              v-if="inv.status === 'pending'"
              :to="`/invoices/${inv.id}`"
              @click.stop
            >
              <Button variant="outline" size="sm" class="h-7 text-xs">
                <Icon name="lucide:credit-card" class="w-3.5 h-3.5 mr-1" />
                Pay
              </Button>
            </NuxtLink>
            <NuxtLink :to="`/invoices/detail/${inv.id}`" @click.stop>
              <Button variant="ghost" size="sm" class="h-7 text-xs">
                <Icon name="lucide:pencil" class="w-3.5 h-3.5 mr-1" />
                Edit
              </Button>
            </NuxtLink>
          </div>
        </div>
      </div>

      <!-- No active invoices message (card view only) -->
      <div v-else-if="viewMode !== 'table' && completedInvoices.length" class="text-center py-12">
        <p class="text-sm text-muted-foreground">No active invoices match your filters.</p>
      </div>

      <!-- Paid / Archived Section (card view only) -->
      <div v-if="viewMode !== 'table' && completedInvoices.length" class="mt-8">
        <button
          class="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4 group"
          @click="showPaid = !showPaid"
        >
          <Icon
            name="lucide:chevron-right"
            class="w-4 h-4 transition-transform duration-200"
            :class="{ 'rotate-90': showPaid }"
          />
          <span class="font-medium">Paid &amp; Archived</span>
          <span class="text-xs bg-muted/60 px-2 py-0.5 rounded-full">{{ completedInvoices.length }}</span>
        </button>

        <Transition
          enter-active-class="transition-all duration-300 ease-out"
          enter-from-class="opacity-0 -translate-y-2 max-h-0"
          enter-to-class="opacity-100 translate-y-0 max-h-[2000px]"
          leave-active-class="transition-all duration-200 ease-in"
          leave-from-class="opacity-100 translate-y-0 max-h-[2000px]"
          leave-to-class="opacity-0 -translate-y-2 max-h-0"
        >
          <div v-show="showPaid" class="overflow-hidden">
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div
                v-for="inv in completedInvoices"
                :key="inv.id"
                class="ios-card p-5 cursor-pointer hover:ring-1 hover:ring-white/10 transition-all opacity-60 hover:opacity-90"
                @click="viewInvoice(inv)"
              >
                <div class="flex items-start justify-between mb-3">
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2 mb-1">
                      <h3 class="text-sm font-medium truncate text-muted-foreground">{{ inv.invoice_code || 'No Code' }}</h3>
                      <span
                        class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize shrink-0"
                        :class="statusColors[inv.status || 'archived']"
                      >
                        {{ inv.status }}
                      </span>
                    </div>
                    <p class="text-xs text-muted-foreground/60 truncate">{{ getDisplayName(inv) }}</p>
                  </div>
                  <p class="text-sm font-medium text-muted-foreground ml-3 shrink-0">{{ formatAmount(inv.total_amount) }}</p>
                </div>

                <div class="space-y-1.5 text-xs text-muted-foreground/60">
                  <div class="flex items-center gap-1.5">
                    <Icon name="lucide:calendar" class="w-3.5 h-3.5 shrink-0" />
                    <span>{{ inv.due_date ? getFriendlyDateThree(inv.due_date) : '\u2014' }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </template>

    <!-- Create Modal -->
    <Teleport to="body">
      <div
        v-if="showCreateModal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        @click.self="showCreateModal = false"
      >
        <div class="ios-card shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto p-6">
          <h2 class="font-semibold mb-4">New Invoice</h2>
          <InvoicesInvoiceForm
            :saving="creating"
            @save="handleCreate"
            @cancel="showCreateModal = false"
          />
        </div>
      </div>
    </Teleport>

    <!-- Delete Confirmation Dialog -->
    <Teleport to="body">
      <div
        v-if="deleteTarget"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        @click.self="deleteTarget = null"
      >
        <div class="ios-card shadow-xl w-full max-w-sm mx-4 p-6">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center shrink-0">
              <Icon name="lucide:trash-2" class="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h2 class="font-semibold">Delete Invoice</h2>
              <p class="text-sm text-muted-foreground">{{ deleteTarget.invoice_code || 'Untitled' }}</p>
            </div>
          </div>
          <p class="text-sm text-muted-foreground mb-5">
            This will permanently delete the invoice and its line items. This action cannot be undone.
          </p>
          <div class="flex justify-end gap-2">
            <Button variant="outline" size="sm" @click="deleteTarget = null">Cancel</Button>
            <Button variant="destructive" size="sm" @click="confirmDelete">Delete</Button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
