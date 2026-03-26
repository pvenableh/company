<script setup lang="ts">
import type { Invoice } from '~/types/directus';
import { Button } from '~/components/ui/button';

definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Invoice Detail | Earnest' });

const route = useRoute();
const router = useRouter();
const invoiceId = route.params.id as string;
const { getInvoice, updateInvoice, deleteInvoice } = useInvoices();

const invoice = ref<Invoice | null>(null);
const loading = ref(true);
const saving = ref(false);
const deleting = ref(false);
const showDeleteConfirm = ref(false);
const sendingEmail = ref(false);
const error = ref<string | null>(null);
const toast = useToast();

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-500/15 text-yellow-400',
  processing: 'bg-blue-500/15 text-blue-400',
  paid: 'bg-emerald-500/15 text-emerald-400',
  archived: 'bg-neutral-500/15 text-neutral-400',
};

async function loadInvoice() {
  loading.value = true;
  error.value = null;
  try {
    invoice.value = await getInvoice(invoiceId);
  } catch (e: any) {
    error.value = e?.message || 'Failed to load invoice';
  } finally {
    loading.value = false;
  }
}

async function handleUpdate(data: any) {
  saving.value = true;
  error.value = null;
  try {
    invoice.value = await updateInvoice(invoiceId, data);
  } catch (e: any) {
    error.value = e?.message || 'Failed to update invoice';
  } finally {
    saving.value = false;
  }
}

async function handleDelete() {
  deleting.value = true;
  try {
    await deleteInvoice(invoiceId);
    router.push('/invoices');
  } catch (e: any) {
    error.value = e?.message || 'Failed to delete invoice';
    deleting.value = false;
    showDeleteConfirm.value = false;
  }
}

function getBillToName(inv: Invoice): string {
  if (!inv.bill_to) return '\u2014';
  if (typeof inv.bill_to === 'string') return inv.bill_to;
  return inv.bill_to.name || '\u2014';
}

function getClientName(inv: Invoice): string {
  if (!inv.client) return '\u2014';
  if (typeof inv.client === 'string') return inv.client;
  return (inv.client as any).name || '\u2014';
}

function getProjectTitle(inv: Invoice): string {
  if (!inv.project) return '\u2014';
  if (typeof inv.project === 'string') return inv.project;
  return (inv.project as any).title || '\u2014';
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
</script>

<template>
  <div class="p-6 max-w-5xl mx-auto">
    <!-- Loading State -->
    <div v-if="loading" class="flex flex-col items-center justify-center py-24 gap-3">
      <Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
      <p class="text-sm text-muted-foreground">Loading invoice...</p>
    </div>

    <!-- Error State (no data) -->
    <div v-else-if="error && !invoice" class="flex flex-col items-center justify-center py-24 gap-4">
      <Icon name="lucide:alert-circle" class="w-10 h-10 text-destructive" />
      <p class="text-sm text-destructive">{{ error }}</p>
      <div class="flex gap-2">
        <NuxtLink to="/invoices">
          <Button variant="outline" size="sm">
            <Icon name="lucide:arrow-left" class="w-4 h-4 mr-1" />
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
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
          <NuxtLink
            to="/invoices"
            class="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            <Icon name="lucide:arrow-left" class="w-5 h-5" />
          </NuxtLink>
          <div>
            <h1 class="text-xl font-semibold text-foreground">{{ invoice.invoice_code || 'Invoice' }}</h1>
            <p class="text-sm text-muted-foreground">{{ getClientName(invoice) }}</p>
          </div>
          <span
            v-if="invoice.status"
            class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize"
            :class="statusColors[invoice.status] || 'bg-muted text-muted-foreground'"
          >
            {{ invoice.status }}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          class="text-destructive hover:text-destructive hover:bg-destructive/10"
          @click="showDeleteConfirm = true"
        >
          <Icon name="lucide:trash-2" class="w-4 h-4 mr-1" />
          Delete
        </Button>
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

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Main: Form -->
        <div class="lg:col-span-2">
          <div class="ios-card p-6">
            <h2 class="font-medium mb-4">Invoice Details</h2>
            <InvoicesInvoiceForm
              :invoice="invoice"
              :saving="saving"
              @save="handleUpdate"
              @cancel="router.push('/invoices')"
            />
          </div>
        </div>

        <!-- Sidebar -->
        <div class="space-y-4">
          <!-- Summary -->
          <div class="ios-card p-5">
            <h3 class="font-medium text-sm mb-3 flex items-center gap-2">
              <Icon name="lucide:info" class="w-4 h-4 text-muted-foreground" />
              Summary
            </h3>
            <div class="space-y-2.5 text-sm">
              <div class="flex justify-between">
                <span class="text-muted-foreground">Total</span>
                <span class="font-semibold">{{ formatCurrency(invoice.total_amount || 0) }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">Due</span>
                <span>{{ invoice.due_date ? getFriendlyDateThree(invoice.due_date) : '\u2014' }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">Created</span>
                <span>{{ invoice.date_created ? new Date(invoice.date_created).toLocaleDateString() : '\u2014' }}</span>
              </div>
              <div v-if="getBillToName(invoice) !== '\u2014'" class="flex justify-between">
                <span class="text-muted-foreground">Org</span>
                <span class="text-xs text-muted-foreground">{{ getBillToName(invoice) }}</span>
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="ios-card p-5">
            <h3 class="font-medium text-sm mb-3 flex items-center gap-2">
              <Icon name="lucide:link" class="w-4 h-4 text-muted-foreground" />
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
                  <Icon name="lucide:credit-card" class="w-4 h-4 mr-2" />
                  Payment Page
                </Button>
              </NuxtLink>
              <NuxtLink :to="`/invoices/preview/${invoice.id}`" target="_blank" class="block">
                <Button variant="outline" size="sm" class="w-full justify-start">
                  <Icon name="lucide:eye" class="w-4 h-4 mr-2" />
                  Preview
                </Button>
              </NuxtLink>
            </div>
          </div>

          <!-- Payments -->
          <div v-if="(invoice.payments as any[])?.length" class="ios-card p-5">
            <h3 class="font-medium text-sm mb-3 flex items-center gap-2">
              <Icon name="lucide:banknote" class="w-4 h-4 text-muted-foreground" />
              Payments
              <span class="text-xs text-muted-foreground/60 ml-auto">
                {{ (invoice.payments as any[]).length }}
              </span>
            </h3>
            <div class="space-y-2">
              <div
                v-for="payment in (invoice.payments as any[])"
                :key="payment.id"
                class="flex items-center justify-between p-3 bg-muted/30 rounded-xl text-sm"
              >
                <div>
                  <p class="font-medium">${{ payment.amount }}</p>
                  <p class="text-xs text-muted-foreground">
                    {{ payment.date_received ? new Date(payment.date_received).toLocaleDateString() : 'Pending' }}
                  </p>
                </div>
                <span
                  class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize"
                  :class="payment.status === 'paid' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-yellow-500/15 text-yellow-400'"
                >
                  {{ payment.status }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Delete Confirmation Modal -->
    <Teleport to="body">
      <div
        v-if="showDeleteConfirm"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        @click.self="showDeleteConfirm = false"
      >
        <div class="ios-card w-full max-w-md mx-4 p-6 shadow-xl">
          <div class="flex items-start gap-3 mb-4">
            <div class="flex items-center justify-center w-10 h-10 rounded-full bg-destructive/10 shrink-0">
              <Icon name="lucide:alert-triangle" class="w-5 h-5 text-destructive" />
            </div>
            <div>
              <h3 class="font-semibold">Delete Invoice</h3>
              <p class="text-sm text-muted-foreground mt-1">
                Are you sure you want to delete invoice
                <strong>{{ invoice?.invoice_code || invoice?.id }}</strong>?
                This action cannot be undone.
              </p>
            </div>
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              :disabled="deleting"
              @click="showDeleteConfirm = false"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              :disabled="deleting"
              @click="handleDelete"
            >
              <Icon v-if="deleting" name="lucide:loader-2" class="w-4 h-4 mr-1 animate-spin" />
              {{ deleting ? 'Deleting...' : 'Delete' }}
            </Button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
