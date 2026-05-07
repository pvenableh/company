<template>
  <div class="border border-border/60 rounded-lg p-3 bg-muted/20 space-y-2 group">
    <!-- Row 1: Product · Qty · Rate · Amount · Remove -->
    <div class="grid grid-cols-12 gap-2 items-center">
      <!-- Product -->
      <div class="col-span-5">
        <select
          :value="lineItem.product"
          class="w-full rounded-md border bg-background px-3 py-2 text-sm"
          @change="handleProductChange(($event.target as HTMLSelectElement).value)"
        >
          <option value="">Select product...</option>
          <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
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
      <div class="col-span-3 flex items-center gap-2 justify-end">
        <span class="text-sm font-medium tabular-nums py-2">
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

    <!-- Row 2: Description (full width, rich text) -->
    <div class="line-item-row__description">
      <label class="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">Description</label>
      <FormTiptap
        :model-value="lineItem.description"
        :character-limit="0"
        :show-char-count="false"
        :allow-uploads="false"
        height="min-h-[60px] max-h-64"
        custom-classes="px-3 py-2"
        @update:model-value="emit('update', index, { description: $event })"
      />
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

<style>
.line-item-row__description .tiptap-wrapper {
  font-size: 13px;
}
.line-item-row__description .ProseMirror {
  min-height: 36px;
  font-size: 13px;
  line-height: 1.4;
}
.line-item-row__description .ProseMirror p {
  margin: 0;
}
.line-item-row__description .ProseMirror p + p {
  margin-top: 4px;
}
</style>
