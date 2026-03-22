<script setup lang="ts">
import type { Product } from '~/types/directus';
import { Button } from '~/components/ui/button';
import { useDebounceFn } from '@vueuse/core';

definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Products | Earnest' });

const { getProducts, createProduct, updateProduct, deleteProduct } = useProducts();

const allProducts = ref<Product[]>([]);
const total = ref(0);
const loading = ref(true);
const search = ref('');
const typeFilter = ref('all');
const showCreateModal = ref(false);
const creating = ref(false);
const editingProduct = ref<Product | null>(null);
const showEditModal = ref(false);
const editSaving = ref(false);
const showDeleteConfirm = ref(false);
const deletingProduct = ref<Product | null>(null);
const deleting = ref(false);
const error = ref<string | null>(null);

const sortBy = ref('name');
const sortOptions = [
  { label: 'Name (A-Z)', value: 'name' },
  { label: 'Name (Z-A)', value: '-name' },
  { label: 'Price (High→Low)', value: '-price' },
  { label: 'Price (Low→High)', value: 'price' },
  { label: 'Recently Created', value: '-date_created' },
];

const typeColors: Record<string, string> = {
  Service: 'bg-blue-500/15 text-blue-400',
  Product: 'bg-purple-500/15 text-purple-400',
};

const statusColors: Record<string, string> = {
  published: 'bg-emerald-500/15 text-emerald-400',
  draft: 'bg-yellow-500/15 text-yellow-400',
  archived: 'bg-neutral-500/15 text-neutral-400',
};

async function fetchData() {
  loading.value = true;
  error.value = null;
  try {
    const result = await getProducts({
      search: search.value || undefined,
      type: typeFilter.value !== 'all' ? typeFilter.value : undefined,
      sort: [sortBy.value],
      limit: 200,
    });
    allProducts.value = result.data;
    total.value = result.total;
  } catch (e: any) {
    error.value = e?.message || 'Failed to load products';
  } finally {
    loading.value = false;
  }
}

const debouncedSearch = useDebounceFn(() => fetchData(), 300);

watch(search, () => debouncedSearch());
watch([typeFilter, sortBy], () => fetchData());

async function handleCreate(data: Partial<Product>) {
  creating.value = true;
  try {
    await createProduct(data);
    showCreateModal.value = false;
    await fetchData();
  } catch (e: any) {
    error.value = e?.message || 'Failed to create product';
  } finally {
    creating.value = false;
  }
}

async function handleEdit(data: Partial<Product>) {
  if (!editingProduct.value) return;
  editSaving.value = true;
  try {
    await updateProduct(editingProduct.value.id, data);
    showEditModal.value = false;
    editingProduct.value = null;
    await fetchData();
  } catch (e: any) {
    error.value = e?.message || 'Failed to update product';
  } finally {
    editSaving.value = false;
  }
}

function openEdit(product: Product) {
  editingProduct.value = product;
  showEditModal.value = true;
}

function confirmDelete(product: Product) {
  deletingProduct.value = product;
  showDeleteConfirm.value = true;
}

async function handleDelete() {
  if (!deletingProduct.value) return;
  deleting.value = true;
  try {
    await deleteProduct(deletingProduct.value.id);
    showDeleteConfirm.value = false;
    deletingProduct.value = null;
    await fetchData();
  } catch (e: any) {
    error.value = e?.message || 'Failed to delete product';
  } finally {
    deleting.value = false;
  }
}

// Stats
const serviceCount = computed(() => allProducts.value.filter(p => p.type === 'Service').length);
const productCount = computed(() => allProducts.value.filter(p => p.type === 'Product').length);
const avgPrice = computed(() => {
  const priced = allProducts.value.filter(p => p.price);
  if (!priced.length) return 0;
  return priced.reduce((sum, p) => sum + (p.price || 0), 0) / priced.length;
});

function stripHtml(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').trim();
}

onMounted(fetchData);
</script>

<template>
  <div class="p-6 max-w-6xl mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-xl font-semibold">Products</h1>
        <p class="text-sm text-muted-foreground">{{ total }} total</p>
      </div>
      <Button size="sm" @click="showCreateModal = true">
        <Icon name="lucide:plus" class="w-4 h-4 mr-1" />
        Add Product
      </Button>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-3 gap-4 mb-6">
      <div class="ios-card p-4 text-center">
        <p class="text-2xl font-semibold">{{ total }}</p>
        <p class="text-xs text-muted-foreground mt-1">Total Products</p>
      </div>
      <div class="ios-card p-4 text-center">
        <p class="text-2xl font-semibold">{{ serviceCount }}</p>
        <p class="text-xs text-muted-foreground mt-1">Services</p>
      </div>
      <div class="ios-card p-4 text-center">
        <p class="text-2xl font-semibold">{{ formatCurrency(avgPrice) }}</p>
        <p class="text-xs text-muted-foreground mt-1">Avg Price</p>
      </div>
    </div>

    <!-- Error Banner -->
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

    <!-- Filters -->
    <div class="flex flex-wrap gap-3 mb-6">
      <div class="relative flex-1 min-w-[200px]">
        <Icon name="lucide:search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          v-model="search"
          class="w-full rounded-lg border bg-background pl-9 pr-3 py-2 text-sm"
          placeholder="Search products..."
        />
      </div>
      <select v-model="typeFilter" class="rounded-lg border bg-background px-3 py-2 text-sm">
        <option value="all">All Types</option>
        <option value="Service">Services</option>
        <option value="Product">Products</option>
      </select>
      <select v-model="sortBy" class="rounded-lg border bg-background px-3 py-2 text-sm">
        <option v-for="opt in sortOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
      </select>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex flex-col items-center justify-center py-24 gap-3">
      <Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
      <p class="text-sm text-muted-foreground">Loading products...</p>
    </div>

    <!-- Empty -->
    <div v-else-if="!allProducts.length" class="flex flex-col items-center justify-center py-24 gap-3">
      <Icon name="lucide:package" class="w-10 h-10 text-muted-foreground/40" />
      <p class="text-sm text-muted-foreground">No products found</p>
      <Button size="sm" variant="outline" @click="showCreateModal = true">
        <Icon name="lucide:plus" class="w-4 h-4 mr-1" />
        Add Product
      </Button>
    </div>

    <!-- Grid -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="product in allProducts"
        :key="product.id"
        class="ios-card p-5 cursor-pointer hover:shadow-md transition-shadow"
        @click="openEdit(product)"
      >
        <div class="flex items-start justify-between mb-3">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-lg bg-muted/60 flex items-center justify-center text-xs font-semibold text-muted-foreground">
              {{ (product.name || '?')[0].toUpperCase() }}
            </div>
            <div>
              <h3 class="font-medium text-sm">{{ product.name }}</h3>
              <span
                v-if="product.type"
                class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                :class="typeColors[product.type] || 'bg-muted text-muted-foreground'"
              >
                {{ product.type }}
              </span>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span
              v-if="product.status"
              class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize"
              :class="statusColors[product.status] || 'bg-muted text-muted-foreground'"
            >
              {{ product.status }}
            </span>
          </div>
        </div>

        <p v-if="product.description" class="text-xs text-muted-foreground line-clamp-2 mb-3">
          {{ stripHtml(product.description) }}
        </p>

        <div class="flex items-center justify-between pt-2 border-t border-border">
          <span class="text-sm font-semibold">
            {{ product.price ? formatCurrency(product.price) : '—' }}
          </span>
          <button
            class="p-1.5 text-muted-foreground/40 hover:text-destructive transition-colors"
            @click.stop="confirmDelete(product)"
          >
            <Icon name="lucide:trash-2" class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>

    <!-- Create Modal -->
    <Teleport to="body">
      <div
        v-if="showCreateModal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        @click.self="showCreateModal = false"
      >
        <div class="ios-card w-full max-w-lg mx-4 p-6 shadow-xl">
          <h2 class="text-lg font-semibold mb-4">New Product</h2>
          <ProductsProductForm :saving="creating" @save="handleCreate" @cancel="showCreateModal = false" />
        </div>
      </div>
    </Teleport>

    <!-- Edit Modal -->
    <Teleport to="body">
      <div
        v-if="showEditModal && editingProduct"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        @click.self="showEditModal = false"
      >
        <div class="ios-card w-full max-w-lg mx-4 p-6 shadow-xl">
          <h2 class="text-lg font-semibold mb-4">Edit Product</h2>
          <ProductsProductForm
            :product="editingProduct"
            :saving="editSaving"
            @save="handleEdit"
            @cancel="showEditModal = false"
          />
        </div>
      </div>
    </Teleport>

    <!-- Delete Confirmation -->
    <Teleport to="body">
      <div
        v-if="showDeleteConfirm"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        @click.self="showDeleteConfirm = false"
      >
        <div class="ios-card w-full max-w-md mx-4 p-6 shadow-xl">
          <div class="flex items-start gap-3 mb-4">
            <div class="flex items-center justify-center w-10 h-10 rounded-full bg-destructive/10 shrink-0">
              <Icon name="lucide:alert-triangle" class="w-5 h-5 text-destructive" />
            </div>
            <div>
              <h3 class="font-semibold">Delete Product</h3>
              <p class="text-sm text-muted-foreground mt-1">
                Are you sure you want to delete
                <strong>{{ deletingProduct?.name }}</strong>?
                This action cannot be undone.
              </p>
            </div>
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" :disabled="deleting" @click="showDeleteConfirm = false">Cancel</Button>
            <Button variant="destructive" size="sm" :disabled="deleting" @click="handleDelete">
              <Icon v-if="deleting" name="lucide:loader-2" class="w-4 h-4 mr-1 animate-spin" />
              {{ deleting ? 'Deleting...' : 'Delete' }}
            </Button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
