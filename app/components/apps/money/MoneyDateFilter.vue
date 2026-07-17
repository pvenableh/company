<!--
  MoneyDateFilter — shared date-range filter for the Money app's list floors
  (Payments · Invoices · Expenses). Two date inputs + quick presets (30d · QTD ·
  Month · YTD · All) and a live count. `from`/`to` are v-model (YYYY-MM-DD);
  `preset` is emitted for the parent's setMoneyRange().
-->
<script setup lang="ts">
const from = defineModel<string>('from', { default: '' });
const to = defineModel<string>('to', { default: '' });

defineProps<{
  count: number;
  total: number;
  active: boolean;
  noun?: string;
}>();

const emit = defineEmits<{ (e: 'preset', key: '30d' | 'qtd' | 'month' | 'ytd' | 'all'): void }>();

const presets = [
  { key: '30d', label: '30d' },
  { key: 'qtd', label: 'QTD' },
  { key: 'month', label: 'Month' },
  { key: 'ytd', label: 'YTD' },
  { key: 'all', label: 'All' },
] as const;
</script>

<template>
  <div class="flex items-center gap-2 flex-wrap">
    <input
      v-model="from"
      type="date"
      aria-label="From date"
      :max="to || undefined"
      class="rounded-full border bg-background px-3 py-1.5 text-sm"
    />
    <span class="text-xs text-muted-foreground">to</span>
    <input
      v-model="to"
      type="date"
      aria-label="To date"
      :min="from || undefined"
      class="rounded-full border bg-background px-3 py-1.5 text-sm"
    />
    <div class="inline-flex items-center gap-0.5 p-0.5 bg-muted/40 rounded-full text-[11px] font-medium">
      <button
        v-for="p in presets"
        :key="p.key"
        type="button"
        class="px-2.5 py-1 rounded-full transition-colors"
        :class="(p.key === 'all' && !active) ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
        @click="emit('preset', p.key)"
      >
        {{ p.label }}
      </button>
    </div>
    <span class="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
      <template v-if="active">{{ count }} of {{ total }} {{ noun || '' }}</template>
      <template v-else>{{ total }} {{ noun || '' }}</template>
    </span>
  </div>
</template>
