<script setup lang="ts">
import type { Invoice } from '~~/shared/directus';
import { Button } from '~/components/ui/button';

definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Invoice Detail | Earnest' });

const route = useRoute();
const router = useRouter();
const invoiceId = route.params.id as string;
const { getInvoice } = useInvoices();
const { getUrl: getFileUrl } = useDirectusFiles();

const invoice = ref<Invoice | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const sendingEmail = ref(false);
const showEditModal = ref(false);
const toast = useToast();

const { getStatusBadgeClasses } = useStatusStyle();
const { setEntity, clearEntity, sidebarOpen, closeSidebar } = useEntityPageContext();

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

function onInvoiceUpdated(updated: Invoice) {
  invoice.value = updated;
}

function onInvoiceDeleted() {
  router.push('/invoices');
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

function getCheckImageUrl(inv: Invoice): string | null {
  const ci = inv.check_image;
  if (!ci) return null;
  const fileId = typeof ci === 'string' ? ci : (ci as any).id;
  if (!fileId) return null;
  return getFileUrl(fileId, { width: 400, format: 'webp' });
}

function getProjectTitles(inv: Invoice): string {
  if (!inv.projects?.length) return '\u2014';
  const titles = (inv.projects as any[])
    .map((j: any) => {
      const p = j.projects_id;
      if (!p) return null;
      if (typeof p === 'string') return p;
      return p.title || null;
    })
    .filter(Boolean);
  return titles.length ? titles.join(', ') : '\u2014';
}

function stripHtml(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').trim();
}

function formatLineItemAmount(li: any): string {
  return formatCurrency((li.quantity || 0) * (li.rate || 0));
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

watch(invoice, (inv) => {
  if (inv) setEntity('invoice', String(inv.id), inv.invoice_code || 'Invoice');
}, { immediate: true });
onUnmounted(() => clearEntity());
</script>

<template>
  <LayoutPageContainer>
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
      <!-- Back link -->
      <NuxtLink
        to="/invoices"
        class="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors mt-4 mb-2"
      >
        <Icon name="lucide:chevron-left" class="w-3 h-3" />
        Invoices
      </NuxtLink>

      <!-- Header -->
      <div class="flex items-center justify-between mb-5">
        <div>
          <div class="flex items-center gap-2">
            <h1 class="text-base font-semibold text-foreground">{{ invoice.invoice_code || 'Invoice' }}</h1>
            <span
              v-if="invoice.status"
              class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize"
              :class="getStatusBadgeClasses(invoice.status)"
            >
              {{ invoice.status }}
            </span>
          </div>
          <p class="text-xs text-muted-foreground">{{ getClientName(invoice) }}</p>
        </div>
        <div class="flex items-center gap-1.5">
          <button
            class="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-border text-xs font-medium text-primary hover:bg-primary/10 hover:border-primary/30 transition-colors"
            @click="sidebarOpen = true"
          >
            <Icon name="lucide:sparkles" class="w-3.5 h-3.5" />
            <span class="hidden sm:inline">Ask Earnest</span>
          </button>
          <button
            class="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors"
            @click="showEditModal = true"
          >
            <Icon name="lucide:pencil" class="w-3.5 h-3.5" />
            <span class="hidden sm:inline">Edit</span>
          </button>
        </div>
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

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Main: Details -->
        <div class="lg:col-span-2 space-y-4">
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
                <p>{{ invoice.invoice_date ? getFriendlyDateThree(invoice.invoice_date) : '\u2014' }}</p>
              </div>
              <div class="space-y-1">
                <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Due Date</p>
                <p>{{ invoice.due_date ? getFriendlyDateThree(invoice.due_date) : '\u2014' }}</p>
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
                <span class="col-span-3 truncate">{{ typeof li.product === 'object' ? (li.product?.name || '\u2014') : '\u2014' }}</span>
                <span class="col-span-4 truncate text-muted-foreground">{{ stripHtml(li.description || '') || '\u2014' }}</span>
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
            <h3 class="text-[10px] uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <Icon name="lucide:banknote" class="w-3.5 h-3.5" />
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
                  :class="getStatusBadgeClasses(payment.status)"
                >
                  {{ payment.status }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Edit Modal -->
      <InvoicesFormModal
        v-model="showEditModal"
        :invoice="invoice"
        @updated="onInvoiceUpdated"
        @deleted="onInvoiceDeleted"
      />
    </template>

    <!-- Contextual AI Sidebar -->
    <ClientOnly>
      <AIContextualSidebar
        v-if="sidebarOpen && invoice?.id"
        entity-type="invoice"
        :entity-id="String(invoice.id)"
        :entity-label="invoice.invoice_code || 'Invoice'"
        @close="closeSidebar"
      />
      <Transition name="overlay">
        <div v-if="sidebarOpen" class="fixed inset-0 bg-black/20 z-40" @click="closeSidebar" />
      </Transition>
    </ClientOnly>
  </LayoutPageContainer>
</template>
