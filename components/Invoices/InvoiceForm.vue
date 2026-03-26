<template>
  <form @submit.prevent="handleSubmit" class="space-y-5">
    <!-- Row 1: Client (primary billing target) -->
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-medium mb-1">Client *</label>
        <select v-model="formData.client" required class="w-full rounded-md border bg-background px-3 py-2 text-sm">
          <option :value="null" disabled>Select client...</option>
          <option v-for="c in clientOptions" :key="c.value" :value="c.value">{{ c.label }}</option>
        </select>
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Organization</label>
        <select v-model="formData.bill_to" class="w-full rounded-md border bg-background px-3 py-2 text-sm" :disabled="!!formData.client">
          <option value="">Auto (from client)</option>
          <option v-for="org in orgs" :key="org.id" :value="org.id">{{ org.name }}</option>
        </select>
        <p v-if="formData.client" class="text-[10px] text-muted-foreground mt-0.5">Auto-set from client</p>
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

    <!-- Billing Contact Details -->
    <div class="border-t pt-4 mt-2">
      <h3 class="text-sm font-semibold mb-3 flex items-center gap-2">
        <Icon name="lucide:contact" class="w-4 h-4 text-muted-foreground" />
        Billing Contact
      </h3>
      <p class="text-xs text-muted-foreground mb-3">These details appear on the invoice. Auto-filled from the client's billing contacts.</p>

      <!-- Contact selector when client has multiple billing contacts -->
      <div v-if="availableBillingContacts.length > 1" class="mb-3">
        <label class="block text-sm font-medium mb-1">Select Contact</label>
        <select
          class="w-full rounded-md border bg-background px-3 py-2 text-sm"
          :value="selectedContactIndex"
          @change="selectBillingContact(Number(($event.target as HTMLSelectElement).value))"
        >
          <option v-for="(contact, i) in availableBillingContacts" :key="i" :value="i">
            {{ contact.name || 'Unnamed' }} — {{ contact.email }}
          </option>
          <option :value="-1">Custom...</option>
        </select>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium mb-1">Billing Name</label>
          <input
            v-model="formData.billing_name"
            class="w-full rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="Contact name"
          />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Billing Email</label>
          <input
            v-model="formData.billing_email"
            type="email"
            class="w-full rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="billing@example.com"
          />
        </div>
      </div>
      <div class="mt-3">
        <label class="block text-sm font-medium mb-1">Billing Address</label>
        <input
          v-model="formData.billing_address"
          class="w-full rounded-md border bg-background px-3 py-2 text-sm"
          placeholder="Billing address"
        />
      </div>
    </div>

    <!-- CC / Additional Recipients -->
    <div>
      <label class="block text-sm font-medium mb-1">Email Recipients (CC)</label>
      <div class="flex flex-wrap gap-1.5 min-h-[38px] w-full rounded-md border bg-background px-3 py-2 text-sm items-center">
        <span
          v-for="(email, i) in ccEmails"
          :key="i"
          class="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs"
        >
          {{ email }}
          <button type="button" class="hover:text-destructive" @click="removeCcEmail(i)">
            <Icon name="lucide:x" class="w-3 h-3" />
          </button>
        </span>
        <input
          v-model="ccInput"
          class="flex-1 min-w-[160px] bg-transparent outline-none text-sm placeholder:text-muted-foreground"
          placeholder="Add email and press Enter..."
          @keydown.enter.prevent="addCcEmail"
          @keydown.tab.prevent="addCcEmail"
          @blur="addCcEmail"
        />
      </div>
      <p class="text-[10px] text-muted-foreground mt-0.5">Additional people to CC when the invoice is sent</p>
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
const { getClientOptions, getClients } = useClients();
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
  billing_name: props.invoice?.billing_name || '',
  billing_email: props.invoice?.billing_email || '',
  billing_address: props.invoice?.billing_address || '',
});

// --- CC emails state ---
const ccEmails = ref<string[]>(
  Array.isArray(props.invoice?.emails) ? [...props.invoice.emails] : []
);
const ccInput = ref('');

function addCcEmail() {
  const raw = ccInput.value.trim().toLowerCase();
  if (!raw) return;
  // Support comma/semicolon-separated paste
  const parts = raw.split(/[,;\s]+/).filter(Boolean);
  for (const part of parts) {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(part) && !ccEmails.value.includes(part)) {
      ccEmails.value.push(part);
    }
  }
  ccInput.value = '';
}

function removeCcEmail(index: number) {
  ccEmails.value.splice(index, 1);
}

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
    billing_name: formData.billing_name || undefined,
    billing_email: formData.billing_email || undefined,
    billing_address: formData.billing_address || undefined,
    client: formData.client || undefined,
    project: formData.project || undefined,
    emails: ccEmails.value.length ? ccEmails.value : [],
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

// Auto-derive bill_to and billing contact from client's organization
const clientLookup = ref<Map<string, string>>(new Map());
const clientBillingLookup = ref<Map<string, { billing_name?: string; billing_email?: string; billing_address?: string; billing_contacts?: Array<{ name: string; email: string }> }>>(new Map());

// Billing contact selector — shows client's billing_contacts for picking
const availableBillingContacts = computed(() => {
  if (!formData.client) return [];
  const billing = clientBillingLookup.value.get(formData.client);
  return billing?.billing_contacts?.filter(c => c.email?.trim()) || [];
});

const selectedContactIndex = computed(() => {
  const contacts = availableBillingContacts.value;
  if (!contacts.length) return -1;
  const idx = contacts.findIndex(c => c.email === formData.billing_email);
  return idx >= 0 ? idx : -1;
});

function selectBillingContact(index: number) {
  if (index < 0) return; // "Custom" selected — leave fields as-is
  const contact = availableBillingContacts.value[index];
  if (contact) {
    formData.billing_email = contact.email || '';
    formData.billing_name = contact.name || '';
  }
}

watch(() => formData.client, (clientId) => {
  autoGenerateCode();
  if (clientId && clientLookup.value.has(clientId)) {
    formData.bill_to = clientLookup.value.get(clientId) || '';
  }
  // Auto-populate billing fields from client — prefer billing_contacts (UI-managed source of truth)
  if (clientId && !props.invoice && clientBillingLookup.value.has(clientId)) {
    const billing = clientBillingLookup.value.get(clientId)!;
    const primaryContact = billing.billing_contacts?.find(c => c.email?.trim());
    formData.billing_email = primaryContact?.email || billing.billing_email || '';
    formData.billing_name = primaryContact?.name || billing.billing_name || '';
    formData.billing_address = billing.billing_address || '';
  }
});
watch(() => formData.invoice_date, autoGenerateCode);

// --- Fetch dropdown data on mount ---
onMounted(async () => {
  try {
    const [clientOpts, allClients, prods, projs] = await Promise.all([
      getClientOptions(),
      getClients({ limit: 500 }),
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

    // Build client → organization and billing lookups
    const clientList = Array.isArray(allClients) ? allClients : allClients?.data || [];
    for (const c of clientList) {
      const orgId = typeof c.organization === 'object' ? c.organization?.id : c.organization;
      if (orgId) clientLookup.value.set(c.id, orgId);
      clientBillingLookup.value.set(c.id, {
        billing_name: c.billing_name || undefined,
        billing_email: c.billing_email || undefined,
        billing_address: c.billing_address || undefined,
        billing_contacts: c.billing_contacts || undefined,
      });
    }

    // Auto-set bill_to if client is already selected (edit mode)
    if (formData.client && clientLookup.value.has(formData.client)) {
      formData.bill_to = clientLookup.value.get(formData.client) || formData.bill_to;
    }
  } catch (err) {
    console.error('Failed to load form data:', err);
  }
});
</script>
