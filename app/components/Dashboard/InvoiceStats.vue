<template>
  <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
    <div class="ios-card p-4">
      <p class="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Billed</p>
      <p class="text-2xl font-semibold">{{ formatCurrency(stats.totalBilled) }}</p>
      <p class="text-xs text-muted-foreground mt-1">{{ stats.invoiceCount }} invoices</p>
    </div>
    <div class="ios-card p-4">
      <p class="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Unpaid</p>
      <p class="text-2xl font-semibold" :class="stats.totalUnpaid > 0 ? 'text-amber-500' : ''">
        {{ formatCurrency(stats.totalUnpaid) }}
      </p>
      <p class="text-xs text-muted-foreground mt-1">{{ stats.unpaidCount }} unpaid</p>
    </div>
    <div class="ios-card p-4">
      <p class="text-xs text-muted-foreground uppercase tracking-wider mb-1">Overdue</p>
      <p class="text-2xl font-semibold" :class="stats.overdueAmount > 0 ? 'text-red-500' : ''">
        {{ formatCurrency(stats.overdueAmount) }}
      </p>
      <p class="text-xs text-muted-foreground mt-1">{{ stats.overdueCount }} overdue</p>
    </div>
    <div class="ios-card p-4">
      <p class="text-xs text-muted-foreground uppercase tracking-wider mb-1">This Month</p>
      <p class="text-2xl font-semibold text-emerald-500">{{ formatCurrency(stats.monthlyRevenue) }}</p>
      <p class="text-xs text-muted-foreground mt-1">{{ stats.monthlyPaidCount }} paid</p>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  stats: {
    totalBilled: number;
    invoiceCount: number;
    totalUnpaid: number;
    unpaidCount: number;
    overdueAmount: number;
    overdueCount: number;
    monthlyRevenue: number;
    monthlyPaidCount: number;
  };
}>();
</script>
