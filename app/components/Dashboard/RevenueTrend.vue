<template>
  <div class="ios-card p-5">
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-medium text-sm flex items-center gap-2">
        <Icon name="lucide:trending-up" class="w-4 h-4 text-muted-foreground" />
        Revenue Trend
      </h3>
      <select v-model.number="period" class="text-xs rounded-full border bg-background px-3 py-1 focus:outline-none focus:ring-1 focus:ring-primary">
        <option :value="6">Last 6 Months</option>
        <option :value="12">Last 12 Months</option>
        <option :value="3">Last 3 Months</option>
      </select>
    </div>

    <div class="h-64">
      <ClientOnly>
        <template v-if="chartData.length">
          <ChartContainer :config="chartConfig" class="aspect-auto h-full w-full">
            <VisXYContainer
              :data="chartData"
              :margin="{ left: 0 }"
              :y-domain="[0, undefined]"
            >
              <VisLine
                :x="xAccessor"
                :y="yAccessors"
                :color="[chartConfig.billed.color!, chartConfig.paid.color!]"
                :curve-type="CurveType.MonotoneX"
              />
              <VisAxis
                type="x"
                :x="xAccessor"
                :tick-line="false"
                :domain-line="false"
                :grid-line="false"
                :tick-format="xTickFormat"
              />
              <VisAxis
                type="y"
                :tick-format="yTickFormat"
                :grid-line="true"
                :tick-line="false"
                :domain-line="false"
              />
              <ChartCrosshair
                :template="crosshairTemplate"
                :color="[chartConfig.billed.color!, chartConfig.paid.color!]"
              />
            </VisXYContainer>
          </ChartContainer>
        </template>
        <div v-else class="h-full flex items-center justify-center text-sm text-muted-foreground">
          No revenue data available
        </div>
      </ClientOnly>
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
import type { Invoice } from '~~/shared/directus';
import type { ChartConfig } from '~/components/ui/chart';
import { ChartContainer, ChartCrosshair, ChartTooltipContent, componentToString } from '~/components/ui/chart';
import { VisXYContainer, VisLine, VisAxis } from '@unovis/vue';
import { CurveType } from '@unovis/ts';

const props = defineProps<{
  invoices: Invoice[];
}>();

const period = ref(6);

const chartConfig: ChartConfig = {
  billed: { label: 'Billed', color: 'hsl(217, 91%, 60%)' },
  paid: { label: 'Paid', color: 'hsl(142, 71%, 45%)' },
};

type DataPoint = { date: Date; billed: number; paid: number };

const xAccessor = (d: DataPoint) => d.date;
const yAccessors = [(d: DataPoint) => d.billed, (d: DataPoint) => d.paid];
const xTickFormat = (d: number) => {
  const date = new Date(d);
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
};
const yTickFormat = (v: number) => '$' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v.toString());

const crosshairTemplate = componentToString(chartConfig, ChartTooltipContent, {
  labelFormatter(d: number | Date) {
    return new Date(d).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  },
});

const chartData = computed(() => {
  const now = new Date();
  const months: DataPoint[] = [];

  for (let i = period.value - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
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

    months.push({ date: d, billed, paid });
  }

  return months;
});
</script>
