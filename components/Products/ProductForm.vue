<template>
  <form @submit.prevent="handleSubmit" class="space-y-5">
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-medium mb-1">Name *</label>
        <input
          v-model="formData.name"
          required
          class="w-full rounded-md border bg-background px-3 py-2 text-sm"
          placeholder="Product name"
        />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Type</label>
        <select v-model="formData.type" class="w-full rounded-md border bg-background px-3 py-2 text-sm">
          <option value="Service">Service</option>
          <option value="Product">Product</option>
        </select>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-medium mb-1">Price</label>
        <input
          v-model.number="formData.price"
          type="number"
          min="0"
          step="0.01"
          class="w-full rounded-md border bg-background px-3 py-2 text-sm"
          placeholder="0.00"
        />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Status</label>
        <select v-model="formData.status" class="w-full rounded-md border bg-background px-3 py-2 text-sm">
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
      </div>
    </div>

    <div>
      <label class="block text-sm font-medium mb-1">Description</label>
      <textarea
        v-model="formData.description"
        rows="3"
        class="w-full rounded-md border bg-background px-3 py-2 text-sm"
        placeholder="Product description..."
      />
    </div>

    <div class="flex justify-end gap-2 pt-2">
      <Button type="button" variant="outline" @click="$emit('cancel')">Cancel</Button>
      <Button type="submit" :disabled="saving || !formData.name">
        {{ saving ? 'Saving...' : (product ? 'Update Product' : 'Create Product') }}
      </Button>
    </div>
  </form>
</template>

<script setup lang="ts">
import type { Product } from '~/types/directus';
import { Button } from '~/components/ui/button';

const props = defineProps<{
  product?: Product | null;
  saving?: boolean;
}>();

const emit = defineEmits<{
  save: [data: Partial<Product>];
  cancel: [];
}>();

const formData = reactive({
  name: props.product?.name || '',
  type: props.product?.type || 'Service',
  price: props.product?.price || null,
  status: props.product?.status || 'draft',
  description: props.product?.description || '',
});

function handleSubmit() {
  emit('save', {
    name: formData.name,
    type: formData.type as 'Service' | 'Product',
    price: formData.price,
    status: formData.status as 'published' | 'draft' | 'archived',
    description: formData.description || undefined,
  });
}
</script>
