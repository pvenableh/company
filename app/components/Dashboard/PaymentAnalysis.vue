<template>
  <div class="ios-card p-5">
    <h3 class="font-medium text-sm flex items-center gap-2 mb-4">
      <Icon name="lucide:credit-card" class="w-4 h-4 text-muted-foreground" />
      Payment Analysis
    </h3>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Payment Methods -->
      <div>
        <h4 class="text-xs text-muted-foreground uppercase tracking-wider mb-3">Methods</h4>
        <div class="space-y-2">
          <div v-for="method in paymentMethods" :key="method.name" class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <Icon :name="method.icon" class="w-4 h-4 text-muted-foreground" />
              <span class="text-sm">{{ method.name }}</span>
            </div>
            <div class="text-right">
              <span class="text-sm font-medium">{{ method.count }}</span>
              <span class="text-xs text-muted-foreground ml-1">payments</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Payment Timing -->
      <div>
        <h4 class="text-xs text-muted-foreground uppercase tracking-wider mb-3">Timing</h4>
        <div class="space-y-3">
          <div>
            <p class="text-2xl font-semibold">{{ avgDaysToPay }}</p>
            <p class="text-xs text-muted-foreground">Avg days to pay</p>
          </div>
          <div>
            <p class="text-lg font-medium">{{ totalPayments }}</p>
            <p class="text-xs text-muted-foreground">Total payments received</p>
          </div>
          <div>
            <p class="text-lg font-medium text-emerald-500">{{ formatCurrency(totalPaidAmount) }}</p>
            <p class="text-xs text-muted-foreground">Total collected</p>
          </div>
        </div>
      </div>

      <!-- Recent Payments -->
      <div>
        <h4 class="text-xs text-muted-foreground uppercase tracking-wider mb-3">Recent</h4>
        <div v-if="recentPayments.length" class="space-y-2">
          <div
            v-for="payment in recentPayments"
            :key="payment.id"
            class="flex items-center justify-between p-2 bg-muted/30 rounded-lg"
          >
            <div>
              <p class="text-sm font-medium">{{ formatCurrency(payment.amount || 0) }}</p>
              <p class="text-[10px] text-muted-foreground">
                {{ payment.date_received ? new Date(payment.date_received).toLocaleDateString() : 'Pending' }}
              </p>
            </div>
            <span
              class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize"
              :class="payment.status === 'paid' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-yellow-500/15 text-yellow-400'"
            >
              {{ payment.status }}
            </span>
          </div>
        </div>
        <div v-else class="text-sm text-muted-foreground">No recent payments</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Invoice } from '~~/shared/directus';

const props = defineProps<{
  invoices: Invoice[];
}>();

// Collect all payments from all invoices
const allPayments = computed(() => {
  const payments: any[] = [];
  for (const inv of props.invoices) {
    if (Array.isArray(inv.payments)) {
      for (const p of inv.payments) {
        if (typeof p === 'object') {
          payments.push({ ...p, invoiceDate: inv.invoice_date });
        }
      }
    }
  }
  return payments;
});

const paymentMethods = computed(() => {
  const methods: Record<string, number> = { stripe: 0, melio: 0, other: 0 };
  for (const p of allPayments.value) {
    if (p.payment_intent || p.charge_id) {
      methods.stripe++;
    } else {
      methods.other++;
    }
  }

  // Check invoices with melio links
  for (const inv of props.invoices) {
    if (inv.melio && inv.status === 'paid') {
      methods.melio++;
    }
  }

  const result = [];
  if (methods.stripe > 0) result.push({ name: 'Stripe', count: methods.stripe, icon: 'lucide:credit-card' });
  if (methods.melio > 0) result.push({ name: 'Melio', count: methods.melio, icon: 'lucide:banknote' });
  if (methods.other > 0) result.push({ name: 'Other', count: methods.other, icon: 'lucide:wallet' });
  return result;
});

const avgDaysToPay = computed(() => {
  const paidInvoices = props.invoices.filter(inv => inv.status === 'paid' && inv.invoice_date);
  if (!paidInvoices.length) return '—';

  let totalDays = 0;
  let count = 0;

  for (const inv of paidInvoices) {
    const payments = Array.isArray(inv.payments) ? inv.payments : [];
    const paidPayment = payments.find((p: any) => typeof p === 'object' && p.date_received);
    if (paidPayment && typeof paidPayment === 'object') {
      const invoiceDate = new Date(inv.invoice_date!);
      const paidDate = new Date((paidPayment as any).date_received);
      const days = Math.round((paidDate.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24));
      if (days >= 0) {
        totalDays += days;
        count++;
      }
    }
  }

  return count > 0 ? Math.round(totalDays / count) : '—';
});

const totalPayments = computed(() => allPayments.value.filter(p => p.status === 'paid').length);
const totalPaidAmount = computed(() => allPayments.value.filter(p => p.status === 'paid').reduce((sum, p) => sum + (Number(p.amount) || 0), 0));

const recentPayments = computed(() => {
  return allPayments.value
    .filter(p => p.status === 'paid')
    .sort((a, b) => {
      const dateA = a.date_received ? new Date(a.date_received).getTime() : 0;
      const dateB = b.date_received ? new Date(b.date_received).getTime() : 0;
      return dateB - dateA;
    })
    .slice(0, 5);
});
</script>
