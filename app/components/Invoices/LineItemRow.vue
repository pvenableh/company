<template>
  <div class="grid grid-cols-12 gap-2 items-start group">
    <!-- Product -->
    <div class="col-span-3">
      <select
        :value="lineItem.product"
        class="w-full rounded-md border bg-background px-3 py-2 text-sm"
        @change="handleProductChange(($event.target as HTMLSelectElement).value)"
      >
        <option value="">Select product...</option>
        <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
    </div>

    <!-- Description -->
    <div class="col-span-3">
      <input
        :value="lineItem.description"
        class="w-full rounded-md border bg-background px-3 py-2 text-sm"
        placeholder="Description"
        @input="emit('update', index, { description: ($event.target as HTMLInputElement).value })"
      />
    </div>

    <!-- Quantity -->
    <div class="col-span-2">
      <input
        :value="lineItem.quantity"
        type="number"
        min="0"
        step="any"
        class="w-full rounded-md border bg-background px-3 py-2 text-sm"
        placeholder="Qty"
        @input="emit('update', index, { quantity: parseFloat(($event.target as HTMLInputElement).value) || 0 })"
      />
    </div>

    <!-- Rate -->
    <div class="col-span-2">
      <input
        :value="lineItem.rate"
        type="number"
        min="0"
        step="0.01"
        class="w-full rounded-md border bg-background px-3 py-2 text-sm"
        placeholder="Rate"
        @input="emit('update', index, { rate: parseFloat(($event.target as HTMLInputElement).value) || 0 })"
      />
    </div>

    <!-- Amount (computed) + Remove -->
    <div class="col-span-2 flex items-center gap-2">
      <span class="text-sm font-medium flex-1 text-right py-2">
        ${{ formatAmount(computedAmount) }}
      </span>
      <button
        type="button"
        class="p-1.5 text-muted-foreground/40 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
        @click="emit('remove', index)"
      >
        <Icon name="lucide:trash-2" class="w-4 h-4" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Product } from '~~/shared/directus';

export interface LineItemFormData {
  id?: string;
  product: string;
  quantity: number;
  rate: number;
  description: string;
  _isNew: boolean;
}

const props = defineProps<{
  lineItem: LineItemFormData;
  products: Product[];
  index: number;
}>();

const emit = defineEmits<{
  update: [index: number, data: Partial<LineItemFormData>];
  remove: [index: number];
}>();

const computedAmount = computed(() => {
  return (props.lineItem.quantity || 0) * (props.lineItem.rate || 0);
});

function formatAmount(value: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function handleProductChange(productId: string) {
  const product = props.products.find(p => p.id === productId);
  const updates: Partial<LineItemFormData> = { product: productId };
  if (product?.price) {
    updates.rate = product.price;
  }
  emit('update', props.index, updates);
}
</script>
