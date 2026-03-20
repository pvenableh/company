<template>
  <form @submit.prevent="handleSubmit" class="space-y-5">
    <!-- Row 1: Bill To + Client -->
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-medium mb-1">Bill To *</label>
        <select v-model="formData.bill_to" required class="w-full rounded-md border bg-background px-3 py-2 text-sm">
          <option value="">Select organization...</option>
          <option v-for="org in orgs" :key="org.id" :value="org.id">{{ org.name }}</option>
        </select>
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Client</label>
        <select v-model="formData.client" class="w-full rounded-md border bg-background px-3 py-2 text-sm">
          <option :value="null">None</option>
          <option v-for="c in clientOptions" :key="c.value" :value="c.value">{{ c.label }}</option>
        </select>
      </div>
    </div>

    <!-- Row 2: Invoice Code + Project -->
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-medium mb-1">Invoice Code</label>
        <input
          v-model="formData.invoice_code"
          class="w-full rounded-md border bg-background px-3 py-2 text-sm"
          placeholder="INV-001"
        />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Project</label>
        <select v-model="formData.project" class="w-full rounded-md border bg-background px-3 py-2 text-sm">
          <option :value="null">None</option>
          <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.title }}</option>
        </select>
      </div>
    </div>

    <!-- Row 3: Dates -->
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-medium mb-1">Invoice Date *</label>
        <input
          v-model="formData.invoice_date"
          type="date"
          required
          class="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Due Date *</label>
        <input
          v-model="formData.due_date"
          type="date"
          required
          class="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      </div>
    </div>

    <!-- Status + Melio -->
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-medium mb-1">Status</label>
        <select v-model="formData.status" class="w-full rounded-md border bg-background px-3 py-2 text-sm">
          <option v-for="s in statusOptions" :key="s.value" :value="s.value">{{ s.label }}</option>
        </select>
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Melio Link</label>
        <input
          v-model="formData.melio"
          class="w-full rounded-md border bg-background px-3 py-2 text-sm"
          placeholder="https://app.meliopayments.com/..."
        />
      </div>
    </div>

    <!-- Note -->
    <div>
      <label class="block text-sm font-medium mb-1">Note</label>
      <textarea
        v-model="formData.note"
        rows="2"
        class="w-full rounded-md border bg-background px-3 py-2 text-sm"
        placeholder="Note visible on the invoice..."
      />
    </div>

    <!-- Memo -->
    <div>
      <label class="block text-sm font-medium mb-1">Internal Memo</label>
      <textarea
        v-model="formData.memo"
        rows="2"
        class="w-full rounded-md border bg-background px-3 py-2 text-sm"
        placeholder="Internal memo (not shown to client)..."
      />
    </div>

    <!-- Line Items -->
    <div>
      <div class="flex items-center justify-between mb-3">
        <label class="text-sm font-medium">Line Items *</label>
        <Button type="button" variant="outline" size="sm" @click="addLineItem">
          <Icon name="lucide:plus" class="w-3.5 h-3.5 mr-1" />
          Add Item
        </Button>
      </div>

      <div v-if="lineItems.length" class="space-y-2">
        <!-- Header -->
        <div class="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-1">
          <span class="col-span-3">Product</span>
          <span class="col-span-3">Description</span>
          <span class="col-span-2">Qty</span>
          <span class="col-span-2">Rate</span>
          <span class="col-span-2 text-right">Amount</span>
        </div>

        <InvoicesLineItemRow
          v-for="(item, index) in lineItems"
          :key="item._key"
          :line-item="item"
          :products="productsList"
          :index="index"
          @update="updateLineItem"
          @remove="removeLineItem"
        />

        <!-- Total -->
        <div class="flex justify-end pt-3 border-t border-border">
          <div class="text-sm font-medium">
            Total: <span class="ml-2">${{ formatAmount(computedTotal) }}</span>
          </div>
        </div>
      </div>

      <div v-else class="text-center py-8 text-sm text-muted-foreground border border-dashed rounded-lg">
        No line items yet. Click "Add Item" to get started.
      </div>
    </div>

    <!-- Actions -->
    <div class="flex justify-end gap-2 pt-2">
      <Button type="button" variant="outline" @click="$emit('cancel')">Cancel</Button>
      <Button type="submit" :disabled="saving || !lineItems.length">
        {{ saving ? 'Saving...' : (invoice ? 'Update Invoice' : 'Create Invoice') }}
      </Button>
    </div>
  </form>
</template>

<script setup lang="ts">
import type { Invoice, Product } from '~/types/directus';
import type { LineItemFormData } from '~/components/Invoices/LineItemRow.vue';
import { Button } from '~/components/ui/button';

const props = defineProps<{
  invoice?: Invoice | null;
  saving?: boolean;
  defaults?: { project?: string | null; bill_to?: string | null } | null;
}>();

const emit = defineEmits<{
  save: [data: any];
  cancel: [];
}>();

const statusOptions = [
  { label: 'Pending', value: 'pending' },
  { label: 'Processing', value: 'processing' },
  { label: 'Paid', value: 'paid' },
  { label: 'Archived', value: 'archived' },
];

// --- Fetch dropdown data ---
const { organizations } = useOrganization();
const { getClientOptions } = useClients();
const { getProducts, generateInvoiceCode } = useInvoices();
const projectItems = useDirectusItems('projects');

const orgs = computed(() => organizations.value || []);
const clientOptions = ref<{ label: string; value: string }[]>([]);
const projects = ref<any[]>([]);
const productsList = ref<Product[]>([]);

function todayString(): string {
  return new Date().toISOString().split('T')[0];
}

function extractId(val: any): string | null {
  if (!val) return null;
  if (typeof val === 'string') return val;
  return val.id || null;
}

// --- Form state ---
const formData = reactive({
  bill_to: extractId(props.invoice?.bill_to) || props.defaults?.bill_to || '',
  client: extractId(props.invoice?.client) || null,
  project: extractId(props.invoice?.project) || props.defaults?.project || null,
  invoice_code: props.invoice?.invoice_code || '',
  invoice_date: props.invoice?.invoice_date?.split('T')[0] || todayString(),
  due_date: props.invoice?.due_date?.split('T')[0] || '',
  status: props.invoice?.status || 'pending',
  note: props.invoice?.note || '',
  memo: props.invoice?.memo || '',
  melio: props.invoice?.melio || '',
});

// --- Line items state ---
let keyCounter = 0;

interface LineItemWithKey extends LineItemFormData {
  _key: number;
}

const lineItems = ref<LineItemWithKey[]>([]);
const removedLineItemIds = ref<string[]>([]);

// Initialize from existing invoice
function stripHtml(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').trim();
}

if (props.invoice?.line_items?.length) {
  lineItems.value = (props.invoice.line_items as any[]).map(li => ({
    _key: keyCounter++,
    id: li.id,
    product: typeof li.product === 'string' ? li.product : li.product?.id || '',
    quantity: li.quantity ?? 1,
    rate: li.rate ?? 0,
    description: stripHtml(li.description || ''),
    _isNew: false,
  }));
}

function addLineItem() {
  lineItems.value.push({
    _key: keyCounter++,
    product: '',
    quantity: 1,
    rate: 0,
    description: '',
    _isNew: true,
  });
}

function updateLineItem(index: number, data: Partial<LineItemFormData>) {
  Object.assign(lineItems.value[index], data);
}

function removeLineItem(index: number) {
  const item = lineItems.value[index];
  if (item.id && !item._isNew) {
    removedLineItemIds.value.push(item.id);
  }
  lineItems.value.splice(index, 1);
}

const computedTotal = computed(() => {
  return lineItems.value.reduce((sum, li) => sum + (li.quantity || 0) * (li.rate || 0), 0);
});

function formatAmount(value: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function handleSubmit() {
  const payload: any = {
    bill_to: formData.bill_to,
    invoice_code: formData.invoice_code || undefined,
    invoice_date: formData.invoice_date,
    due_date: formData.due_date,
    status: formData.status,
    note: formData.note || undefined,
    memo: formData.memo || undefined,
    melio: formData.melio || undefined,
    client: formData.client || undefined,
    project: formData.project || undefined,
  };

  if (props.invoice) {
    // Edit mode: use Directus nested mutation syntax
    const lineItemPayload: any = {};
    const newItems = lineItems.value.filter(li => li._isNew);
    const existingItems = lineItems.value.filter(li => !li._isNew && li.id);

    if (newItems.length) {
      lineItemPayload.create = newItems.map(li => ({
        product: li.product,
        quantity: li.quantity,
        rate: li.rate,
        description: li.description || undefined,
      }));
    }
    if (existingItems.length) {
      lineItemPayload.update = existingItems.map(li => ({
        id: li.id,
        product: li.product,
        quantity: li.quantity,
        rate: li.rate,
        description: li.description || undefined,
      }));
    }
    if (removedLineItemIds.value.length) {
      lineItemPayload.delete = removedLineItemIds.value;
    }

    if (Object.keys(lineItemPayload).length) {
      payload.line_items = lineItemPayload;
    }
  } else {
    // Create mode
    payload.line_items = {
      create: lineItems.value.map(li => ({
        product: li.product,
        quantity: li.quantity,
        rate: li.rate,
        description: li.description || undefined,
      })),
    };
  }

  emit('save', payload);
}

// --- Auto-generate invoice code when client or invoice_date changes (new invoices only) ---
const autoGenerateCode = async () => {
  if (!formData.client || props.invoice) return; // Only for new invoices
  try {
    const code = await generateInvoiceCode(formData.client, formData.invoice_date);
    if (code) {
      formData.invoice_code = code;
    }
  } catch (e) {
    // Silently fail — user can still enter manually
  }
};

watch(() => formData.client, autoGenerateCode);
watch(() => formData.invoice_date, autoGenerateCode);

// --- Fetch dropdown data on mount ---
onMounted(async () => {
  try {
    const [clientOpts, prods, projs] = await Promise.all([
      getClientOptions(),
      getProducts(),
      projectItems.list({
        fields: ['id', 'title'],
        sort: ['title'],
        limit: 200,
      }),
    ]);
    clientOptions.value = clientOpts;
    productsList.value = prods;
    projects.value = projs;
  } catch (err) {
    console.error('Failed to load form data:', err);
  }
});
</script>
