<template>
  <div class="ios-card p-5">
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-medium text-sm flex items-center gap-2">
        <Icon name="lucide:trending-up" class="w-4 h-4 text-muted-foreground" />
        Revenue Trend
      </h3>
      <select v-model="period" class="text-xs rounded-md border bg-background px-2 py-1">
        <option value="6">Last 6 Months</option>
        <option value="12">Last 12 Months</option>
        <option value="3">Last 3 Months</option>
      </select>
    </div>

    <div v-if="chartData.length" class="h-64">
      <ChartContainer :config="chartConfig" class="h-full">
        <VisXYContainer :data="chartData" :padding="{ top: 10 }">
          <VisLine :x="(d: any) => d.index" :y="(d: any) => d.billed" color="var(--color-billed)" :curve-type="'monotone'" />
          <VisLine :x="(d: any) => d.index" :y="(d: any) => d.paid" color="var(--color-paid)" :curve-type="'monotone'" />
          <VisAxis type="x" :tick-format="(i: number) => chartData[i]?.label || ''" :grid-line="false" />
          <VisAxis type="y" :tick-format="(v: number) => '$' + (v >= 1000 ? (v/1000).toFixed(0) + 'k' : v.toString())" :grid-line="true" />
          <VisTooltip />
          <VisCrosshair template="" />
        </VisXYContainer>
      </ChartContainer>
    </div>
    <div v-else class="h-64 flex items-center justify-center text-sm text-muted-foreground">
      No revenue data available
    </div>

    <div class="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
      <span class="flex items-center gap-1.5">
        <span class="w-3 h-0.5 rounded-full bg-blue-500"></span>
        Billed
      </span>
      <span class="flex items-center gap-1.5">
        <span class="w-3 h-0.5 rounded-full bg-emerald-500"></span>
        Paid
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Invoice } from '~/types/directus';
import type { ChartConfig } from '~/components/ui/chart';
import { ChartContainer } from '~/components/ui/chart';
import { VisXYContainer, VisLine, VisAxis, VisTooltip, VisCrosshair } from '@unovis/vue';

const props = defineProps<{
  invoices: Invoice[];
}>();

const period = ref(6);

const chartConfig: ChartConfig = {
  billed: { label: 'Billed', color: 'hsl(217, 91%, 60%)' },
  paid: { label: 'Paid', color: 'hsl(142, 71%, 45%)' },
};

const chartData = computed(() => {
  const now = new Date();
  const months: { label: string; billed: number; paid: number; index: number }[] = [];

  for (let i = period.value - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthStr = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    const year = d.getFullYear();
    const month = d.getMonth();

    let billed = 0;
    let paid = 0;

    for (const inv of props.invoices) {
      const invDate = inv.invoice_date ? new Date(inv.invoice_date) : null;
      if (!invDate) continue;
      if (invDate.getFullYear() === year && invDate.getMonth() === month) {
        billed += Number(inv.total_amount) || 0;
        if (inv.status === 'paid') {
          paid += Number(inv.total_amount) || 0;
        }
      }
    }

    months.push({ label: monthStr, billed, paid, index: months.length });
  }

  return months;
});
</script>
