<template>
  <div class="ios-card p-5">
    <h3 class="font-medium text-sm flex items-center gap-2 mb-4">
      <Icon name="lucide:users" class="w-4 h-4 text-muted-foreground" />
      Revenue by Client
    </h3>

    <div v-if="clientData.length" class="space-y-3">
      <div
        v-for="client in clientData.slice(0, 8)"
        :key="client.name"
        class="flex items-center gap-3"
      >
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between mb-1">
            <span class="text-sm font-medium truncate">{{ client.name }}</span>
            <span class="text-sm font-semibold ml-2">{{ formatCurrency(client.total) }}</span>
          </div>
          <div class="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              class="h-full rounded-full transition-all"
              :class="client.unpaid > 0 ? 'bg-amber-500' : 'bg-emerald-500'"
              :style="{ width: maxTotal > 0 ? `${(client.total / maxTotal) * 100}%` : '0%' }"
            />
          </div>
          <div class="flex justify-between mt-0.5 text-[10px] text-muted-foreground">
            <span>{{ client.count }} invoices</span>
            <span v-if="client.unpaid > 0" class="text-amber-500">{{ formatCurrency(client.unpaid) }} unpaid</span>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="py-8 text-center text-sm text-muted-foreground">
      No client data available
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Invoice } from '~/types/directus';

const props = defineProps<{
  invoices: Invoice[];
}>();

const clientData = computed(() => {
  const map = new Map<string, { name: string; total: number; unpaid: number; count: number }>();

  for (const inv of props.invoices) {
    const clientName = inv.client && typeof inv.client === 'object'
      ? (inv.client as any).name || 'Unknown'
      : 'No Client';

    const existing = map.get(clientName) || { name: clientName, total: 0, unpaid: 0, count: 0 };
    existing.total += Number(inv.total_amount) || 0;
    existing.count++;
    if (inv.status !== 'paid' && inv.status !== 'archived') {
      existing.unpaid += Number(inv.total_amount) || 0;
    }
    map.set(clientName, existing);
  }

  return Array.from(map.values()).sort((a, b) => b.total - a.total);
});

const maxTotal = computed(() => {
  if (!clientData.value.length) return 0;
  return clientData.value[0].total;
});
</script>
